"""Helpers for embedding persistence and hybrid candidate retrieval."""

import hashlib
import math
import re
from typing import Any

from sqlalchemy.orm import Session

from app.config import settings
from app.models import RagChunk
from app.services.vector_store import query_rag_chunks, upsert_rag_chunk


def _norm(text: str) -> str:
    """Normalize text for tolerant comparisons."""
    return re.sub(r"\s+", " ", str(text or "").strip())


def _tokens(text: str) -> list[str]:
    """Split text into comparison tokens."""
    return [t for t in re.findall(r"[a-z0-9]+", _norm(text).lower()) if len(t) > 2]


def _token_overlap(a: str, b: str) -> float:
    """Measure token overlap between normalized text values."""
    aa = set(_tokens(a))
    bb = set(_tokens(b))
    if not aa or not bb:
        return 0.0
    return len(aa & bb) / max(1, len(aa))


def _vector_dim() -> int:
    """Return the configured embedding vector dimension."""
    dim = int(getattr(settings, "embedding_dim", 768) or 768)
    return max(64, dim)


def _is_noise_candidate(text: str) -> bool:
    """Return whether the candidate should be ignored as noisy metadata."""
    value = _norm(text)
    if not value:
        return True
    lower = value.lower()
    if lower in {
        "table",
        "number of attributes",
        "notes",
        "column name",
        "data type",
        "pk/fk",
        "nullable (y/n)",
        "nullable",
        "psd008 field ref",
        "psd field ref",
        "description",
        "source system",
        "(general)",
    }:
        return True
    if lower.startswith("example added field:"):
        return True
    if re.fullmatch(r"\d+", value):
        return True
    if ":" in value:
        left, right = [part.strip() for part in value.split(":", 1)]
        if not left or not right:
            return True
        if re.fullmatch(r"\d+", right):
            return True
        return False
    if re.fullmatch(r"(bridge|dim|fact|stg|tbl|map)_[a-z0-9_]+", lower):
        return True
    return False


def hashed_embedding(text: str, dim: int | None = None) -> list[float]:
    """
    Lightweight deterministic embedding for local POC.
    Uses signed hashing over token trigrams into fixed-size vector.
    """
    n = dim or _vector_dim()
    vec = [0.0] * n
    toks = _tokens(text)
    grams: list[str] = []
    for tok in toks:
        if len(tok) <= 3:
            grams.append(tok)
            continue
        grams.extend(tok[i : i + 3] for i in range(0, len(tok) - 2))
    if not grams:
        return vec

    for g in grams:
        h = hashlib.sha256(g.encode("utf-8")).digest()
        idx = int.from_bytes(h[:4], "little", signed=False) % n
        sign = 1.0 if (h[4] % 2 == 0) else -1.0
        vec[idx] += sign

    norm = math.sqrt(sum(v * v for v in vec))
    if norm <= 0:
        return vec
    return [v / norm for v in vec]


def embedding_for_text(text: str) -> list[float]:
    """Return the deterministic embedding used by the local vector pipeline."""
    return hashed_embedding(text, _vector_dim())


def _dm_source_ref(dm_artifact_id: int, field: str) -> str:
    """Build a source reference for a data-model field candidate."""
    digest = hashlib.sha1(_norm(field).lower().encode("utf-8")).hexdigest()[:20]
    return f"dmf:{dm_artifact_id}:{digest}"


def _fca_source_ref(fca_artifact_id: int, ref: str) -> str:
    """Build a source reference for a functional requirement chunk."""
    safe_ref = re.sub(r"[^a-zA-Z0-9]+", "_", _norm(ref))[:80] or "na"
    return f"fcaf:{fca_artifact_id}:{safe_ref}"


def backfill_missing_embeddings(
    db: Session,
    *,
    project_id: str | None = None,
    source_ref_prefix: str | None = None,
    batch_size: int | None = None,
) -> int:
    """Sync existing RAG rows into the configured vector store."""
    query = db.query(RagChunk)
    if project_id:
        query = query.filter(RagChunk.project_id == project_id)
    if source_ref_prefix:
        query = query.filter(RagChunk.source_ref.like(f"{source_ref_prefix}%"))

    rows = query.order_by(RagChunk.id.asc()).limit(max(1, int(batch_size or 5000))).all()
    updated = 0
    for row in rows:
        text_value = _norm(row.chunk_text or "")
        if not text_value:
            continue
        if upsert_rag_chunk(
            project_id=str(row.project_id),
            source_ref=str(row.source_ref),
            text=text_value,
            embedding=embedding_for_text(text_value),
            metadata=row.chunk_metadata or {},
        ):
            updated += 1
    return updated


def sync_model_field_vectors(db: Session, project_id: str, dm_artifact_id: int, model_fields: list[str]) -> int:
    """Persist model-field lookup rows so BA matching can reuse normalized field candidates."""
    prefix = f"dmf:{dm_artifact_id}:"
    existing = (
        db.query(RagChunk)
        .filter(RagChunk.project_id == project_id, RagChunk.source_ref.like(f"{prefix}%"))
        .all()
    )
    existing_rows = {str(r.source_ref): r for r in existing}
    inserted_or_updated = 0
    for field in model_fields:
        field_txt = _norm(field)
        if not field_txt:
            continue
        sref = _dm_source_ref(dm_artifact_id, field_txt)
        existing_row = existing_rows.get(sref)
        if existing_row:
            if upsert_rag_chunk(
                project_id=project_id,
                source_ref=sref,
                text=field_txt,
                embedding=embedding_for_text(field_txt),
                metadata=existing_row.chunk_metadata or {},
            ):
                inserted_or_updated += 1
            continue
        metadata = {
            "kind": "model_field_candidate",
            "artifact_id": dm_artifact_id,
            "field": field_txt,
        }
        db.add(
            RagChunk(
                project_id=project_id,
                source_ref=sref,
                chunk_text=field_txt,
                chunk_metadata=metadata,
            )
        )
        upsert_rag_chunk(
            project_id=project_id,
            source_ref=sref,
            text=field_txt,
            embedding=embedding_for_text(field_txt),
            metadata=metadata,
        )
        inserted_or_updated += 1
    return inserted_or_updated


def sync_required_field_vectors(
    db: Session,
    project_id: str,
    fca_artifact_id: int,
    required_fields: list[dict[str, str]],
) -> int:
    """Persist FCA-required-field lookup rows to support repeatable shortlist generation."""
    prefix = f"fcaf:{fca_artifact_id}:"
    existing = (
        db.query(RagChunk)
        .filter(RagChunk.project_id == project_id, RagChunk.source_ref.like(f"{prefix}%"))
        .all()
    )
    existing_rows = {str(r.source_ref): r for r in existing}
    inserted_or_updated = 0
    for req in required_fields:
        ref = _norm(req.get("ref") or "")
        field = _norm(req.get("field") or "")
        if not ref or not field:
            continue
        sref = _fca_source_ref(fca_artifact_id, ref)
        existing_row = existing_rows.get(sref)
        if existing_row:
            if upsert_rag_chunk(
                project_id=project_id,
                source_ref=sref,
                text=field,
                embedding=embedding_for_text(field),
                metadata=existing_row.chunk_metadata or {},
            ):
                inserted_or_updated += 1
            continue
        metadata = {
            "kind": "fca_required_field",
            "artifact_id": fca_artifact_id,
            "ref": ref,
            "field": field,
        }
        db.add(
            RagChunk(
                project_id=project_id,
                source_ref=sref,
                chunk_text=field,
                chunk_metadata=metadata,
            )
        )
        upsert_rag_chunk(
            project_id=project_id,
            source_ref=sref,
            text=field,
            embedding=embedding_for_text(field),
            metadata=metadata,
        )
        inserted_or_updated += 1
    return inserted_or_updated


def build_candidate_map(
    db: Session,
    project_id: str,
    fca_artifact_id: int,
    dm_artifact_id: int,
    required_fields: list[dict[str, str]],
    model_fields: list[str],
    top_k: int = 8,
) -> dict[str, list[str]]:
    """
    Build the best candidate model fields for each required FCA reference.

    The function first attempts Chroma ordering when embeddings are present,
    then falls back to lexical token overlap so the workflow remains usable if
    vector operators are unavailable.
    """
    top_k = max(1, min(20, int(top_k)))
    model_prefix = f"dmf:{dm_artifact_id}:"
    backfill_missing_embeddings(
        db,
        project_id=project_id,
        source_ref_prefix=model_prefix,
        batch_size=max(500, top_k * max(len(required_fields), 1)),
    )
    model_rows = (
        db.query(RagChunk)
        .filter(
            RagChunk.project_id == project_id,
            RagChunk.source_ref.like(f"{model_prefix}%"),
        )
        .all()
    )
    if not model_rows:
        # Last-resort fallback when vectors were not persisted.
        return {str(r.get("ref") or ""): model_fields[:top_k] for r in required_fields}

    out: dict[str, list[str]] = {}
    for req in required_fields:
        ref = _norm(req.get("ref") or "")
        field = _norm(req.get("field") or "")
        if not ref or not field:
            continue
        scored: list[tuple[float, str]] = []
        ranked = query_rag_chunks(
            project_id=project_id,
            query_embedding=embedding_for_text(field),
            limit=max(top_k * 3, top_k),
            source_ref_prefix=model_prefix,
        )
        for rr in ranked:
            cand = str((rr.get("metadata") or {}).get("field") or rr.get("text") or "").strip()
            if not cand or _is_noise_candidate(cand):
                continue
            overlap = _token_overlap(field, cand)
            scored.append((0.7 + 0.3 * overlap, cand))

        if not scored:
            for rr in model_rows:
                cand = str((rr.chunk_metadata or {}).get("field") or rr.chunk_text or "").strip()
                if not cand or _is_noise_candidate(cand):
                    continue
                overlap = _token_overlap(field, cand)
                if overlap <= 0:
                    continue
                scored.append((overlap, cand))

        # Deduplicate and keep highest scores.
        scored.sort(key=lambda x: x[0], reverse=True)
        seen: set[str] = set()
        picks: list[str] = []
        for _, cand in scored:
            key = cand.lower()
            if key in seen:
                continue
            seen.add(key)
            picks.append(cand)
            if len(picks) >= top_k:
                break
        if not picks:
            picks = model_fields[:top_k]
        out[ref] = picks
    return out


def search_rag_chunks(
    db: Session,
    *,
    project_id: str,
    query_text: str,
    limit: int = 5,
    source_ref_prefix: str | None = None,
) -> list[dict[str, Any]]:
    """Search rag chunks using Chroma first and lexical overlap as a compatibility fallback."""
    normalized_query = _norm(query_text)
    if not normalized_query:
        return []

    limit = max(1, min(30, int(limit)))
    backfill_missing_embeddings(
        db,
        project_id=project_id,
        source_ref_prefix=source_ref_prefix,
        batch_size=max(300, limit * 20),
    )

    base_query = db.query(RagChunk).filter(RagChunk.project_id == project_id)
    if source_ref_prefix:
        base_query = base_query.filter(RagChunk.source_ref.like(f"{source_ref_prefix}%"))

    results: list[dict[str, Any]] = []
    ranked = query_rag_chunks(
        project_id=project_id,
        query_embedding=embedding_for_text(normalized_query),
        limit=limit,
        source_ref_prefix=source_ref_prefix,
    )
    if ranked:
        created_at_by_ref = {
            str(row.source_ref): row.created_at.isoformat() if row.created_at else None
            for row in base_query.filter(RagChunk.source_ref.in_([str(r.get("source_ref")) for r in ranked])).all()
        }
        for rr in ranked:
            rr["text"] = str(rr.get("text") or "")[:1200]
            rr["created_at"] = created_at_by_ref.get(str(rr.get("source_ref") or ""))
        return ranked

    rows = base_query.order_by(RagChunk.id.desc()).limit(max(300, limit * 20)).all()
    scored: list[tuple[float, RagChunk]] = []
    for row in rows:
        text_value = str(row.chunk_text or "").strip()
        if not text_value:
            continue
        overlap = _token_overlap(normalized_query, text_value)
        if overlap <= 0:
            overlap = sum(1 for tok in _tokens(normalized_query) if tok in text_value.lower())
        if overlap > 0:
            scored.append((float(overlap), row))

    scored.sort(key=lambda item: item[0], reverse=True)
    for score, row in scored[:limit]:
        results.append(
            {
                "id": row.id,
                "source_ref": row.source_ref,
                "text": str(row.chunk_text or "")[:1200],
                "metadata": row.chunk_metadata or {},
                "score": round(float(score), 6),
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "strategy": "lexical",
            }
        )
    return results


def enrich_rows_with_candidates(rows: list[dict[str, Any]], candidate_map: dict[str, list[str]]) -> list[dict[str, Any]]:
    """Attach shortlist hints to BA result rows without changing the original row order."""
    out: list[dict[str, Any]] = []
    for row in rows or []:
        rr = dict(row)
        ref = _norm(str(rr.get("ref") or ""))
        picks = candidate_map.get(ref) or []
        if picks:
            evidence = str(rr.get("evidence") or "").strip()
            hint = f" Candidate shortlist: {', '.join(picks[:5])}."
            rr["evidence"] = (evidence + hint).strip()
        out.append(rr)
    return out
