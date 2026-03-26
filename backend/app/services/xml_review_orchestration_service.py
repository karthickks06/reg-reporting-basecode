import json
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from typing import Any
from uuid import uuid4

import xmlschema
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.constants import AGENT_DEFAULT_PROMPTS
from app.deps import active_instruction
from app.models import AnalysisRun, Artifact, Workflow, WorkflowStageHistory
from app.paths import ARTIFACT_ROOT
from app.services.artifact_naming_service import build_generated_artifact_display_name, build_generated_artifact_filename
from app.services.xml_contract_service import (
    detect_contract_report_code,
    functional_spec_rows,
    load_admin_mapping_contracts,
    load_shared_mapping_contract,
    render_contract_xml,
)
from app.services.llm_service import ask_llm_json, ask_llm_text
from app.services.logging_service import log_workflow_action
from app.services.output_validation_service import validate_reviewer_output, log_validation_result
from app.services.workflow_access_service import assert_workflow_stage_access
from app.services.workflow_gates import evaluate_stage_exit_gate
from app.services.workflow_provenance_service import ensure_functional_spec_matches_workflow, ensure_xml_artifact_matches_workflow
from app.services.xml_service import build_psd008_xml_from_rows, pick_expected_xsd_root, xml_root_local_name


def _model_dump(req: Any) -> dict[str, Any]:
    """Handle model dump within the service layer."""
    if hasattr(req, "model_dump"):
        return dict(req.model_dump())
    if hasattr(req, "dict"):
        return dict(req.dict())
    return {}


def _extract_xml_tag_summary(xml_text: str, limit: int = 300) -> list[str]:
    """Extract XML tag summary within the service layer."""
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except Exception:
        return []
    tags: set[str] = set()
    for elem in root.iter():
        tag = str(elem.tag or "")
        if "}" in tag:
            tag = tag.split("}", 1)[1]
        if tag:
            tags.add(tag)
        if len(tags) >= limit:
            break
    return sorted(tags)


def _extract_xml_path_summary(xml_text: str, limit: int = 600) -> list[str]:
    """Extract XML path summary within the service layer."""
    try:
        root = ET.fromstring(xml_text.encode("utf-8"))
    except Exception:
        return []

    paths: list[str] = []
    seen: set[str] = set()

    def local_name(tag: Any) -> str:
        """Handle local name within the service layer."""
        text = str(tag or "")
        return text.split("}", 1)[1] if "}" in text else text

    def walk(node: ET.Element, trail: list[str]) -> None:
        """Handle walk within the service layer."""
        current = trail + [local_name(node.tag)]
        path = "/" + "/".join(segment for segment in current if segment)
        key = path.lower()
        if path and key not in seen:
            seen.add(key)
            paths.append(path)
        if len(paths) >= limit:
            return
        for child in list(node):
            walk(child, current)
            if len(paths) >= limit:
                return

    walk(root, [])
    return paths


def _required_fields_from_psd_text(psd_text: str, limit: int = 200) -> list[str]:
    """Handle required fields from PSD text within the service layer."""
    rows = []
    for line in (psd_text or "").splitlines():
        s = line.strip()
        if not s or len(s) < 3:
            continue
        if ":" in s:
            left = s.split(":", 1)[0].strip()
            if 2 <= len(left) <= 80 and re.search(r"[A-Za-z]", left):
                rows.append(left)
        elif re.match(r"^[A-Za-z][A-Za-z0-9 _/\-]{2,80}$", s):
            rows.append(s)
        if len(rows) >= limit:
            break
    uniq = []
    seen = set()
    for field in rows:
        key = re.sub(r"\s+", " ", field).strip().lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(field.strip())
    return uniq[:limit]


def _required_fields_from_functional_spec_rows(rows: list[dict[str, Any]], limit: int = 200) -> list[str]:
    """Handle required fields from functional spec rows within the service layer."""
    required = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        field = str(
            row.get("field")
            or row.get("target_field")
            or row.get("label")
            or row.get("name")
            or ""
        ).strip()
        if not field:
            continue
        required.append(field)
        if len(required) >= limit:
            break

    out = []
    seen = set()
    for field in required:
        key = re.sub(r"\s+", " ", field).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(field)
    return out[:limit]


def _required_specs_from_functional_spec_rows(rows: list[dict[str, Any]], limit: int = 200) -> list[dict[str, Any]]:
    """Handle required specs from functional spec rows within the service layer."""
    specs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        label = str(
            row.get("field")
            or row.get("business_field")
            or row.get("target_field")
            or row.get("label")
            or row.get("name")
            or ""
        ).strip()
        xml_path = str(row.get("xml_path") or "").strip()
        matching_column = str(row.get("matching_column") or row.get("source_column") or "").strip()
        status = str(row.get("status") or "").strip().lower()
        if not label and not xml_path:
            continue
        dedupe_key = re.sub(r"\s+", " ", f"{label}|{xml_path}|{matching_column}".strip().lower())
        if not dedupe_key or dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        specs.append(
            {
                "label": label or xml_path,
                "xml_path": xml_path,
                "matching_column": matching_column,
                "required": "missing" not in status,
                "source": "functional_spec",
            }
        )
        if len(specs) >= limit:
            break
    return specs


def _required_specs_from_mapping_contract(mapping_contract: dict[str, Any], limit: int = 200) -> list[dict[str, Any]]:
    """Handle required specs from mapping contract within the service layer."""
    root_name = str(mapping_contract.get("root_element") or "").strip()
    record_name = str(mapping_contract.get("record_element") or "").strip()
    specs: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_mapping(mapping: dict[str, Any], *, prefix: str = "") -> None:
        """Add mapping within the service layer."""
        target_xpath = str(mapping.get("target_xpath") or "").strip()
        if not target_xpath:
            return
        xml_path = target_xpath
        if prefix:
            xml_path = f"{prefix}/{target_xpath.lstrip('/')}"
        elif not xml_path.startswith("/"):
            xml_path = f"/{root_name}/{record_name}/{xml_path.lstrip('/')}" if root_name and record_name else f"/{xml_path.lstrip('/')}"
        key = _normalize_key(xml_path)
        if not key or key in seen:
            return
        seen.add(key)
        source_column = str(mapping.get("source_column") or "").strip()
        specs.append(
            {
                "label": source_column or target_xpath.split("/")[-1].replace("[*]", ""),
                "xml_path": xml_path,
                "matching_column": source_column,
                "required": bool(mapping.get("required")),
                "source": "mapping_contract",
            }
        )

    for mapping in mapping_contract.get("header_mappings") or []:
        if isinstance(mapping, dict):
            add_mapping(mapping)
            if len(specs) >= limit:
                return specs[:limit]
    for mapping in mapping_contract.get("record_mappings") or []:
        if isinstance(mapping, dict):
            add_mapping(mapping)
            if len(specs) >= limit:
                return specs[:limit]
    return specs[:limit]


def _model_fields_from_json(data_model_json: dict[str, Any], limit: int = 1000) -> list[str]:
    """Handle model fields from json within the service layer."""
    fields = []
    if isinstance(data_model_json, dict):
        for key in ("targets", "fields", "columns"):
            value = data_model_json.get(key)
            if isinstance(value, list):
                for item in value:
                    fields.append(str(item).strip())
    out = []
    seen = set()
    for item in fields:
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def _functional_spec_context(spec_art: Artifact | None, limit: int = 8000) -> dict[str, Any]:
    """Handle functional spec context within the service layer."""
    if not spec_art:
        return {"text": "", "rows": []}
    spec_json = spec_art.extracted_json or {}
    rows = []
    if isinstance(spec_json, dict) and isinstance(spec_json.get("rows"), list):
        rows = [row for row in spec_json.get("rows", []) if isinstance(row, dict)][:50]
    text = str(spec_art.extracted_text or "")[:limit]
    return {
        "text": text,
        "rows": rows,
    }


def _data_artifact_context(data_art: Artifact | None, limit_rows: int = 50) -> dict[str, Any]:
    """Handle data artifact context within the service layer."""
    if not data_art:
        return {"headers": [], "rows": [], "text_preview": ""}
    data_json = data_art.extracted_json or {}
    headers = []
    rows = []
    if isinstance(data_json, dict):
        raw_headers = data_json.get("headers") or data_json.get("columns") or []
        if isinstance(raw_headers, list):
            headers = [str(item).strip() for item in raw_headers if str(item).strip()][:200]
        raw_rows = data_json.get("rows") or []
        if isinstance(raw_rows, list):
            rows = raw_rows[:limit_rows]
    return {
        "headers": headers,
        "rows": rows,
        "text_preview": str(data_art.extracted_text or "")[:4000],
    }


def _build_rule_checks(xml_tags: list[str], psd_required_fields: list[str], model_fields: list[str]) -> dict[str, Any]:
    """Build rule checks within the service layer."""
    tag_keys = {re.sub(r"[^a-z0-9]", "", t.lower()) for t in xml_tags if t}

    def to_key(value: str) -> str:
        """Handle to key within the service layer."""
        return re.sub(r"[^a-z0-9]", "", str(value or "").lower())

    required_total = len(psd_required_fields)
    required_matches = []
    required_missing = []
    for field in psd_required_fields:
        k = to_key(field)
        if k and k in tag_keys:
            required_matches.append(field)
        else:
            required_missing.append(field)

    model_total = len(model_fields)
    model_matches = []
    for field in model_fields:
        k = to_key(field)
        if k and k in tag_keys:
            model_matches.append(field)

    required_coverage_pct = round((len(required_matches) / required_total) * 100, 2) if required_total else 0.0
    model_alignment_pct = round((len(model_matches) / model_total) * 100, 2) if model_total else 0.0

    return {
        "required_field_coverage_pct": required_coverage_pct,
        "required_field_total": required_total,
        "required_field_matched": len(required_matches),
        "required_field_missing": required_missing[:100],
        "model_alignment_pct": model_alignment_pct,
        "model_field_total": model_total,
        "model_field_matched": len(model_matches),
        "passed": bool(required_total > 0 and required_coverage_pct >= 95.0),
    }


def _normalize_key(value: str) -> str:
    """Normalize a key so related fields can be compared reliably."""
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _normalize_path_key(value: str) -> str:
    """Normalize an XML path so related fields can be compared reliably."""
    text = str(value or "").replace("[*]", "").strip()
    return "/".join(_normalize_key(part) for part in text.split("/") if part.strip())


def _match_required_spec(
    spec: dict[str, Any],
    *,
    xml_path_keys: set[str],
    xml_tag_keys: set[str],
) -> bool:
    """Handle match required spec within the service layer."""
    xml_path = str(spec.get("xml_path") or "").strip()
    if xml_path:
        if _normalize_path_key(xml_path) in xml_path_keys:
            return True

    candidate_keys = [
        _normalize_key(str(spec.get("label") or "")),
        _normalize_key(str(spec.get("matching_column") or "").split(".")[-1]),
        _normalize_key(str(spec.get("matching_column") or "").split(":")[-1]),
    ]
    candidate_keys = [key for key in candidate_keys if key]
    if not candidate_keys:
        return False
    return any(key in xml_tag_keys for key in candidate_keys)


def _build_rule_checks_v2(
    *,
    xml_tags: list[str],
    xml_paths: list[str],
    required_specs: list[dict[str, Any]],
    model_fields: list[str],
) -> dict[str, Any]:
    """Build rule checks v2 within the service layer."""
    xml_tag_keys = {_normalize_key(tag) for tag in xml_tags if tag}
    xml_path_keys = {_normalize_path_key(path) for path in xml_paths if path}

    required_items = [spec for spec in required_specs if bool(spec.get("required", True))]
    optional_items = [spec for spec in required_specs if not bool(spec.get("required", True))]

    required_matches: list[dict[str, Any]] = []
    required_missing: list[dict[str, Any]] = []
    for spec in required_items:
        if _match_required_spec(spec, xml_path_keys=xml_path_keys, xml_tag_keys=xml_tag_keys):
            required_matches.append(spec)
        else:
            required_missing.append(spec)

    optional_missing: list[dict[str, Any]] = []
    for spec in optional_items:
        if not _match_required_spec(spec, xml_path_keys=xml_path_keys, xml_tag_keys=xml_tag_keys):
            optional_missing.append(spec)

    model_total = len(model_fields)
    model_matches = []
    for field in model_fields:
        k = _normalize_key(field)
        if k and k in xml_tag_keys:
            model_matches.append(field)

    required_total = len(required_items)
    required_coverage_pct = round((len(required_matches) / required_total) * 100, 2) if required_total else 0.0
    model_alignment_pct = round((len(model_matches) / model_total) * 100, 2) if model_total else 0.0

    return {
        "required_field_coverage_pct": required_coverage_pct,
        "required_field_total": required_total,
        "required_field_matched": len(required_matches),
        "required_field_missing": [str(spec.get("label") or spec.get("xml_path") or "").strip() for spec in required_missing[:100]],
        "optional_field_total": len(optional_items),
        "optional_field_missing": [str(spec.get("label") or spec.get("xml_path") or "").strip() for spec in optional_missing[:100]],
        "coverage_basis": str(required_items[0].get("source") if required_items else "heuristic"),
        "model_alignment_pct": model_alignment_pct,
        "model_field_total": model_total,
        "model_field_matched": len(model_matches),
        "passed": bool(required_total > 0 and required_coverage_pct >= 95.0),
    }


def _parse_xsd_error(error_text: str) -> dict[str, Any]:
    """Parse XSD error within the service layer."""
    text = str(error_text or "").strip()
    if not text:
        return {"message": "Unknown XSD validation error", "path": "", "expected": "", "actual": "", "rule": "xsd"}

    path_match = re.search(r"Path:\s*([^\n]+)", text)
    reason_match = re.search(r"Reason:\s*([^\n]+)", text)
    actual_match = re.search(r"failed validating\s+'([^']+)'", text)
    enum_match = re.search(r"XsdEnumerationFacets\(\[([^\]]+)\]\)", text)
    simple_type_match = re.search(r"Xsd([A-Za-z0-9_]+)\(", text)

    path = (path_match.group(1).strip() if path_match else "")
    reason = (reason_match.group(1).strip() if reason_match else text.splitlines()[0][:300])
    actual = (actual_match.group(1).strip() if actual_match else "")
    expected = ""
    rule = "xsd"

    if enum_match:
        options = [o.strip().strip("'\"") for o in enum_match.group(1).split(",") if o.strip()]
        if options:
            expected = f"one of: {', '.join(options)}"
            rule = "enumeration"
    elif simple_type_match:
        expected = simple_type_match.group(1)
        rule = simple_type_match.group(1)

    message = reason
    if expected and actual:
        message = f"Expected {expected}, got '{actual}'."
    elif expected:
        message = f"Expected {expected}."

    return {
        "path": path,
        "rule": rule,
        "expected": expected,
        "actual": actual,
        "message": message,
    }


def _structure_xsd_errors(errors: list[str], limit: int = 100) -> list[dict[str, Any]]:
    """Handle structure XSD errors within the service layer."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for err in (errors or []):
        parsed = _parse_xsd_error(str(err))
        key = "|".join(
            [
                str(parsed.get("path") or ""),
                str(parsed.get("rule") or ""),
                str(parsed.get("expected") or ""),
                str(parsed.get("actual") or ""),
                str(parsed.get("message") or ""),
            ]
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(parsed)
        if len(out) >= limit:
            break
    return out


def _compact_validation_display(
    xsd_ok: bool,
    rule_checks: dict[str, Any],
    xsd_details: list[dict[str, Any]],
    ai_review: dict[str, Any],
) -> dict[str, Any]:
    """Build a compact validation summary for the workbench and lightweight API responses."""
    top_errors = xsd_details[:10]
    overall_status = "PASS" if (xsd_ok and bool(rule_checks.get("passed"))) else "REVIEW_REQUIRED"

    action_items: list[str] = []
    enum_errors = [e for e in xsd_details if str(e.get("rule", "")).lower() == "enumeration"]
    if enum_errors:
        action_items.append("Normalize enumerated values to XSD allowed tokens before submission.")
    if not xsd_ok:
        action_items.append("Run pre-submit XSD validation and block submission on schema errors.")
    if not bool(rule_checks.get("passed")):
        action_items.append("Review required-field coverage and align PSD field extraction to canonical required fields.")

    ai_suggestions = ai_review.get("suggestions") if isinstance(ai_review, dict) else None
    if isinstance(ai_suggestions, list):
        for item in ai_suggestions[:3]:
            s = str(item or "").strip()
            if s and s not in action_items:
                action_items.append(s)

    paths = [str(e.get("path") or "").strip() for e in xsd_details if str(e.get("path") or "").strip()]
    top_paths = [p for p, _ in Counter(paths).most_common(5)]

    return {
        "status": overall_status,
        "summary": (
            "XML passed schema and rule checks."
            if overall_status == "PASS"
            else "XML failed one or more schema/rule checks. Resolve top errors and retry."
        ),
        "xsd_pass": bool(xsd_ok),
        "rule_checks_pass": bool(rule_checks.get("passed")),
        "error_count": len(xsd_details),
        "top_error_paths": top_paths,
        "top_errors": top_errors,
        "action_items": action_items[:8],
    }


def _normalize_ai_review(ai_review: Any, rule_checks: dict[str, Any]) -> dict[str, Any]:
    """Normalize reviewer LLM output into the stable shape expected by gates and UI."""
    if not isinstance(ai_review, dict):
        ai_review = {}

    normalized = dict(ai_review)
    raw_score = normalized.get("coverage_score")
    try:
        score = float(raw_score)
    except Exception:
        derived = rule_checks.get("required_field_coverage_pct")
        try:
            score = float(derived)
        except Exception:
            score = 0.0
    normalized["coverage_score"] = max(0.0, min(100.0, score))
    return normalized


def _find_active_artifact(db: Session, project_id: str, artifact_id: int) -> Artifact | None:
    """Find active artifact within the service layer."""
    return (
        db.query(Artifact)
        .filter(Artifact.id == artifact_id, Artifact.project_id == project_id, Artifact.is_deleted.is_(False))
        .first()
    )


async def execute_xml_generation(req: Any, db: Session) -> dict[str, Any]:
    """Generate submission XML for the active workflow using the current linked inputs."""
    workflow = None
    if req.workflow_id:
        workflow = (
            db.query(Workflow)
            .filter(Workflow.id == req.workflow_id, Workflow.project_id == req.project_id, Workflow.is_active.is_(True))
            .first()
        )
        if not workflow:
            raise HTTPException(status_code=404, detail="workflow_not_found")
        if workflow.status != "in_progress":
            raise HTTPException(status_code=422, detail="workflow_not_in_progress")
        if workflow.current_stage not in {"DEV", "REVIEWER"}:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "workflow_locked_for_stage",
                    "message": "Workflow is not editable for XML generation",
                    "current_stage": workflow.current_stage,
                    "required_stage": "DEV or REVIEWER",
                },
            )
    data_art = _find_active_artifact(db, req.project_id, req.data_artifact_id)
    xsd_art = _find_active_artifact(db, req.project_id, req.xsd_artifact_id)
    if not data_art or not xsd_art:
        raise HTTPException(status_code=404, detail="input_not_found")

    source_rows = (data_art.extracted_json or {}).get("rows") or []
    if not isinstance(source_rows, list):
        source_rows = []
    preview_rows = source_rows[:50]
    xsd_hint = xsd_art.extracted_json or {}
    expected_root = pick_expected_xsd_root(xsd_hint)
    expected_ns = str((xsd_hint or {}).get("target_namespace") or "").strip()
    xsd_text = str(xsd_art.extracted_text or "")[:12000]
    fca_text = ""
    if req.fca_artifact_id:
        fca = _find_active_artifact(db, req.project_id, req.fca_artifact_id)
        fca_text = (fca.extracted_text or "")[:4000] if fca else ""
    functional_spec_artifact_id = int(req.functional_spec_artifact_id or 0)
    if not functional_spec_artifact_id and workflow and workflow.functional_spec_artifact_id:
        functional_spec_artifact_id = int(workflow.functional_spec_artifact_id or 0)
    functional_spec_art = _find_active_artifact(db, req.project_id, functional_spec_artifact_id) if functional_spec_artifact_id else None
    if workflow and functional_spec_art:
        ensure_functional_spec_matches_workflow(workflow, functional_spec_art)

    contract_report_code = detect_contract_report_code(expected_root, xsd_text, fca_text)
    contract_metadata = None
    out = None
    
    # Try contract-based generation if report code is detected
    if contract_report_code and functional_spec_art:
        admin_contracts = load_admin_mapping_contracts(db, req.project_id, contract_report_code)
        mapping_contract = load_shared_mapping_contract(contract_report_code, artifacts=admin_contracts)
        
        if mapping_contract:
            try:
                xml_text, contract_metadata = render_contract_xml(
                    report_code=contract_report_code,
                    mapping_contract=mapping_contract,
                    source_rows=source_rows,
                    functional_spec=functional_spec_rows(functional_spec_art),
                )
                out = {
                    "summary": f"{contract_report_code} XML generated from shared mapping contract.",
                    "gap_fit_analysis": [],
                    "supporting_notes": [
                        "XML rendered using filing-specific mapping configuration.",
                        f"Functional specification artifact: {functional_spec_art.id}",
                        f"Source rows rendered: {len(source_rows)}",
                        (
                            f"Mapping contract artifact: {admin_contracts[0].id}"
                            if admin_contracts
                            else "Mapping contract source: filesystem fallback"
                        ),
                    ],
                    "next_steps": ["Run reviewer validation against XSD and business rules."],
                    "xml_report": xml_text,
                    "contract_generation": contract_metadata,
                }
            except (ValueError, KeyError) as exc:
                # Contract generation failed, fall back to LLM generation
                out = None

    if out is None:
        system_prompt = active_instruction(db, "rev_xml", AGENT_DEFAULT_PROMPTS["rev_xml"])
        user_prompt = (
            f"Input rows:\n{json.dumps(preview_rows)[:14000]}\n\n"
            f"XSD hints:\n{json.dumps(xsd_hint)[:6000]}\n\n"
            f"Required XML root element: {expected_root or 'unknown'}\n"
            f"Required target namespace: {expected_ns or 'unknown'}\n\n"
            f"Optional FCA context:\n{fca_text}"
        )
        if req.user_context and req.user_context.strip():
            user_prompt += f"\n\nOperator guidance:\n{req.user_context[:4000]}"

        request_id = f"xml-{uuid4()}"
        out = await ask_llm_json(system_prompt, user_prompt, request_id=request_id, model=req.model)
        
        # Validate LLM output structure
        if isinstance(out, dict) and out.get("xml_report"):
            validation_result = validate_reviewer_output(out)
            log_validation_result("REVIEWER", request_id, validation_result)
            
            if not validation_result.is_valid:
                # Add validation errors to output for debugging
                out["validation_errors"] = validation_result.errors
                out["validation_warnings"] = validation_result.warnings
        if not isinstance(out, dict) or not isinstance(out.get("xml_report"), str):
            xml_lines = ["<Report>"]
            for r in preview_rows[:20]:
                xml_lines.append("  <Row>")
                if isinstance(r, dict):
                    for k, v in r.items():
                        key = re.sub(r"[^A-Za-z0-9_]", "_", str(k))[:60] or "Field"
                        xml_lines.append(f"    <{key}>{str(v)}</{key}>")
                xml_lines.append("  </Row>")
            xml_lines.append("</Report>")
            out = {
                "summary": "Fallback XML generated.",
                "gap_fit_analysis": [],
                "supporting_notes": ["Generated without strict schema mapping."],
                "next_steps": ["Validate with domain rules."],
                "xml_report": "\n".join(xml_lines),
            }

    xml_text = out["xml_report"]
    xml_root = xml_root_local_name(xml_text)
    if expected_root and xml_root != expected_root:
        repaired_xml = await ask_llm_text(
            system_prompt="Return ONLY valid XML. No markdown, no prose. Use the exact required root element and namespace.",
            user_prompt=(
                f"Required root element: {expected_root}\n"
                f"Required target namespace: {expected_ns or 'none'}\n\n"
                f"XSD hints:\n{json.dumps(xsd_hint)[:5000]}\n\n"
                f"Input rows:\n{json.dumps(preview_rows)[:9000]}"
            ),
            request_id=f"xml-repair-{uuid4()}",
            model=req.model,
        )
        if repaired_xml and xml_root_local_name(repaired_xml) == expected_root:
            xml_text = repaired_xml
            out["xml_report"] = xml_text

    if expected_root == "PSD008-CreditAgreementSales" and not contract_metadata:
        xml_text = build_psd008_xml_from_rows(source_rows, expected_ns or "urn:fsa-gov-uk:MER:PSD008:1")
        out["xml_report"] = xml_text

    xsd_ok = False
    xsd_errors = []
    try:
        schema = xmlschema.XMLSchema(xsd_art.file_path)
        xsd_ok = schema.is_valid(xml_text)
        if not xsd_ok:
            xsd_errors = [str(e) for e in schema.iter_errors(xml_text)][:20]
    except Exception as exc:
        xsd_errors = [f"xsd_validation_exception: {exc}"]
    out["xsd_validation"] = {"pass": xsd_ok, "errors": xsd_errors}
    if contract_metadata:
        out["contract_generation"] = {
            **contract_metadata,
            "xsd_pass": xsd_ok,
            "functional_spec_artifact_id": functional_spec_artifact_id or None,
        }

    path = ARTIFACT_ROOT / req.project_id
    path.mkdir(parents=True, exist_ok=True)
    xml_filename = build_generated_artifact_filename(
        "generated_xml",
        extension="xml",
        workflow_name=workflow.name if workflow else req.project_id,
        workflow_id=workflow.id if workflow else req.workflow_id,
    )
    xml_file = path / xml_filename
    xml_file.write_text(xml_text, encoding="utf-8")

    artifact = Artifact(
        project_id=req.project_id,
        kind="generated_xml",
        filename=xml_file.name,
        display_name=build_generated_artifact_display_name(
            "generated_xml",
            workflow_name=workflow.name if workflow else None,
            workflow_id=workflow.id if workflow else req.workflow_id,
            project_id=req.project_id,
        ),
        content_type="application/xml",
        file_path=str(xml_file),
        extracted_text=xml_text,
        extracted_json=out,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)

    run = AnalysisRun(
        project_id=req.project_id,
        run_type="xml_generation",
        status="completed",
        input_json=_model_dump(req),
        output_json=out,
        output_artifact_id=artifact.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    if req.workflow_id:
        wf = workflow or (
            db.query(Workflow)
            .filter(Workflow.id == req.workflow_id, Workflow.project_id == req.project_id, Workflow.is_active.is_(True))
            .first()
        )
        if wf:
            wf.latest_report_xml_artifact_id = artifact.id
            db.add(
                WorkflowStageHistory(
                    workflow_id=wf.id,
                    project_id=wf.project_id,
                    from_stage=wf.current_stage,
                    to_stage=wf.current_stage,
                    action="report_xml_generated",
                    actor="system",
                    comment=f"Submission XML generated: artifact {artifact.id}",
                )
            )
            db.commit()
            
            # Log the XML generation
            log_workflow_action(
                db,
                workflow_id=req.workflow_id,
                project_id=req.project_id,
                action_type="xml_generation",
                action_category=f"{wf.current_stage}_ACTION",
                actor=wf.current_stage,
                description=f"XML report generated. XSD validation: {'PASS' if xsd_ok else 'FAILED'}",
                status="success" if xsd_ok else "warning",
                stage=wf.current_stage,
                details={
                    "run_id": run.id,
                    "artifact_id": artifact.id,
                    "xsd_pass": xsd_ok,
                    "xsd_error_count": len(xsd_errors),
                },
            )
            db.commit()

    return {
        "ok": True,
        "run_id": run.id,
        "artifact_id": artifact.id,
        "xsd_validation": out["xsd_validation"],
        "xml_report": xml_text,
    }


async def execute_xml_validation(req: Any, db: Session) -> dict[str, Any]:
    """Validate the workflow's current submission XML against schema and reviewer checks."""
    workflow = assert_workflow_stage_access(
        db,
        project_id=req.project_id,
        workflow_id=req.workflow_id,
        required_stage="REVIEWER",
    )
    xml_art = _find_active_artifact(db, req.project_id, req.report_xml_artifact_id)
    xsd_art = _find_active_artifact(db, req.project_id, req.xsd_artifact_id)
    if not xml_art or not xsd_art:
        raise HTTPException(status_code=404, detail="input_not_found")
    ensure_xml_artifact_matches_workflow(workflow, xml_art)

    xml_text = xml_art.extracted_text or ""
    if not xml_text.strip():
        xml_path = Path(xml_art.file_path)
        if xml_path.exists():
            xml_text = xml_path.read_text(encoding="utf-8")
    if not xml_text.strip():
        raise HTTPException(status_code=422, detail="empty_report_xml")

    xsd_text = str(xsd_art.extracted_text or "")[:12000]
    xsd_ok = False
    xsd_errors_raw = []
    try:
        schema = xmlschema.XMLSchema(xsd_art.file_path)
        xsd_ok = schema.is_valid(xml_text)
        if not xsd_ok:
            xsd_errors_raw = [str(e) for e in schema.iter_errors(xml_text)][:100]
    except Exception as exc:
        xsd_errors_raw = [f"xsd_validation_exception: {exc}"]

    fca_text = ""
    if req.fca_artifact_id:
        fca_art = _find_active_artifact(db, req.project_id, req.fca_artifact_id)
        fca_text = (fca_art.extracted_text or "")[:6000] if fca_art else ""

    data_model_json = {}
    if req.data_model_artifact_id:
        dm_art = _find_active_artifact(db, req.project_id, req.data_model_artifact_id)
        data_model_json = dm_art.extracted_json or {} if dm_art else {}

    data_art = None
    data_context = {"headers": [], "rows": [], "text_preview": ""}
    if req.data_artifact_id:
        data_art = _find_active_artifact(db, req.project_id, req.data_artifact_id)
        data_context = _data_artifact_context(data_art)

    functional_spec_art = None
    functional_spec_context = {"text": "", "rows": []}
    functional_spec_artifact_id = int(req.functional_spec_artifact_id or 0)
    if not functional_spec_artifact_id and workflow and workflow.functional_spec_artifact_id:
        functional_spec_artifact_id = int(workflow.functional_spec_artifact_id or 0)
    if functional_spec_artifact_id:
        functional_spec_art = _find_active_artifact(db, req.project_id, functional_spec_artifact_id)
        functional_spec_context = _functional_spec_context(functional_spec_art)
        ensure_functional_spec_matches_workflow(workflow, functional_spec_art)

    tag_summary = _extract_xml_tag_summary(xml_text)
    xml_path_summary = _extract_xml_path_summary(xml_text)
    report_code = detect_contract_report_code(xml_root_local_name(xml_text) or "", xsd_text, fca_text)
    required_specs = _required_specs_from_functional_spec_rows(functional_spec_context.get("rows", []))
    if not any(str(spec.get("xml_path") or "").strip() for spec in required_specs) and report_code:
        admin_contracts = load_admin_mapping_contracts(db, req.project_id, report_code)
        mapping_contract = load_shared_mapping_contract(report_code, artifacts=admin_contracts)
        if mapping_contract:
            required_specs = _required_specs_from_mapping_contract(mapping_contract)
    if not required_specs:
        psd_required_fields = _required_fields_from_psd_text(fca_text)
        required_specs = [
            {"label": field, "xml_path": "", "matching_column": "", "required": True, "source": "heuristic"}
            for field in psd_required_fields
        ]
    model_fields = _model_fields_from_json(data_model_json)
    rule_checks = _build_rule_checks_v2(
        xml_tags=tag_summary,
        xml_paths=xml_path_summary,
        required_specs=required_specs,
        model_fields=model_fields,
    )

    system_prompt = active_instruction(db, "rev_xml", AGENT_DEFAULT_PROMPTS["rev_xml"])
    user_prompt = (
        f"Uploaded XML tags:\n{json.dumps(tag_summary[:250])}\n\n"
        f"Uploaded XML paths:\n{json.dumps(xml_path_summary[:250])}\n\n"
        f"XSD errors:\n{json.dumps(xsd_errors_raw)[:8000]}\n\n"
        f"PSD requirement context:\n{fca_text[:6000]}\n\n"
        f"Functional specification rows:\n{json.dumps(functional_spec_context.get('rows', []), ensure_ascii=False)[:8000]}\n\n"
        f"Functional specification text:\n{str(functional_spec_context.get('text') or '')[:6000]}\n\n"
        f"Source data headers:\n{json.dumps(data_context.get('headers', []), ensure_ascii=False)[:4000]}\n\n"
        f"Source data preview rows:\n{json.dumps(data_context.get('rows', []), ensure_ascii=False)[:8000]}\n\n"
        f"Data model context:\n{json.dumps(data_model_json)[:8000]}\n\n"
        "Return JSON keys: overall_status, issues(array), suggestions(array), coverage_score(0-100), rationale."
    )
    if req.user_context and req.user_context.strip():
        user_prompt += f"\n\nReviewer guidance:\n{req.user_context[:4000]}"

    ai_review = await ask_llm_json(system_prompt, user_prompt, request_id=f"xml-validate-{uuid4()}", model=req.model)
    if not isinstance(ai_review, dict):
        ai_review = {
            "overall_status": "REVIEW_REQUIRED",
            "issues": ["AI review did not return structured output."],
            "suggestions": ["Retry validation with additional reviewer guidance."],
            "coverage_score": 0,
            "rationale": "Fallback response.",
        }
    ai_review = _normalize_ai_review(ai_review, rule_checks)

    xsd_error_details = _structure_xsd_errors(xsd_errors_raw)
    xsd_errors_compact = [str(e.get("message") or "XSD validation error").strip() for e in xsd_error_details][:20]
    display = _compact_validation_display(xsd_ok, rule_checks, xsd_error_details, ai_review)

    payload = {
        "xsd_validation": {
            "pass": xsd_ok,
            "errors": xsd_errors_compact,
            "error_count": len(xsd_error_details),
            "error_details": xsd_error_details,
        },
        "rule_checks": rule_checks,
        "ai_review": ai_review,
        "display": display,
        "analysis_meta": {
            "llm_used": True,
            "llm_input": {
                "xml_context": "tag_and_path_summary",
                "xml_tag_count": len(tag_summary),
                "xml_path_count": len(xml_path_summary),
                "xsd_errors_sent": len(xsd_errors_raw),
                "fca_text_chars": len(fca_text or ""),
                "fca_text_truncated": bool(fca_text and len(fca_text) >= 6000),
                "functional_spec_rows_sent": len(functional_spec_context.get("rows", [])),
                "functional_spec_text_chars": len(str(functional_spec_context.get("text") or "")),
                "source_data_headers_sent": len(data_context.get("headers", [])),
                "source_data_rows_sent": len(data_context.get("rows", [])),
                "data_model_context_chars": len(json.dumps(data_model_json)),
                "data_model_context_truncated": len(json.dumps(data_model_json)) >= 8000,
            },
        },
        "report_xml_artifact_id": xml_art.id,
        "xsd_artifact_id": xsd_art.id,
        "fca_artifact_id": req.fca_artifact_id,
        "data_artifact_id": req.data_artifact_id,
        "data_model_artifact_id": req.data_model_artifact_id,
        "functional_spec_artifact_id": functional_spec_artifact_id or None,
    }
    if not req.compact:
        payload["xsd_validation"]["errors"] = xsd_errors_raw[:20]
        payload["xsd_validation"]["error_details"] = xsd_error_details
        payload.pop("display", None)
    if req.include_raw:
        payload["xsd_validation"]["raw_errors"] = xsd_errors_raw[:50]

    run = AnalysisRun(
        project_id=req.project_id,
        run_type="xml_validation",
        status="completed",
        input_json=_model_dump(req),
        output_json=payload,
        output_artifact_id=xml_art.id,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    if req.workflow_id:
        wf = workflow or (
            db.query(Workflow)
            .filter(Workflow.id == req.workflow_id, Workflow.project_id == req.project_id, Workflow.is_active.is_(True))
            .first()
        )
        if wf:
            wf.latest_xml_run_id = run.id
            db.add(
                WorkflowStageHistory(
                    workflow_id=wf.id,
                    project_id=wf.project_id,
                    from_stage=wf.current_stage,
                    to_stage=wf.current_stage,
                    action="xml_validation_saved",
                    actor="reviewer.user",
                    comment=f"XML validation run saved: {run.id}",
                )
            )
            db.commit()
            gate = evaluate_stage_exit_gate(db, wf, settings.min_review_coverage_score)
            payload["gate_status"] = gate.as_dict()
            if isinstance(payload.get("display"), dict):
                payload["display"]["status"] = "PASS" if gate.passed else "REVIEW_REQUIRED"
                payload["display"]["summary"] = gate.message if not gate.passed else payload["display"].get("summary")
            run.output_json = payload
            db.add(run)
            db.commit()
            
            # Log the XML validation
            overall_status = display.get("status", "UNKNOWN")
            log_workflow_action(
                db,
                workflow_id=req.workflow_id,
                project_id=req.project_id,
                action_type="xml_validation",
                action_category="REVIEWER_ACTION",
                actor="REVIEWER",
                description=f"XML validation completed. Status: {overall_status}. Coverage: {ai_review.get('coverage_score', 0)}%",
                status="success" if overall_status == "PASS" else "warning",
                stage="REVIEWER",
                details={
                    "run_id": run.id,
                    "xsd_pass": xsd_ok,
                    "xsd_error_count": len(xsd_error_details),
                    "rule_checks_pass": rule_checks.get("passed"),
                    "coverage_score": ai_review.get("coverage_score"),
                    "overall_status": overall_status,
                    "issues_count": len(ai_review.get("issues", [])),
                },
            )
            db.commit()

    return {"ok": True, "run_id": run.id, **payload}
