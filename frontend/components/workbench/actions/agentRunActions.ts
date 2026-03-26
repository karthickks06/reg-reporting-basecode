import { API_BASE, extractApiError, extractGapDiagnostics, extractGapRows, parseJson } from "../utils";
import type { UseWorkbenchActionsArgs } from "./types";
import { clearAgentOutputState, handleAgentError, validateWorkflowContext } from "./agentActionHelpers";

type AgentRunActionDeps = {
  loadWorkflows: (showToast?: boolean) => Promise<void>;
};

export function createAgentRunActions(args: UseWorkbenchActionsArgs, deps: AgentRunActionDeps) {
  async function runGap() {
    if (!args.fcaArtifactId || !args.modelArtifactId) return;
    
    const workflowId = args.activeWorkflowId;
    args.setBusy(true);
    args.setMessage("");
    clearAgentOutputState(args, "BA");
    
    try {
      const res = await fetch(`${API_BASE}/v1/gap-analysis/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          fca_artifact_id: Number(args.fcaArtifactId),
          data_model_artifact_id: Number(args.modelArtifactId),
          allow_fallback: true,
          user_context: args.baUserContext || undefined,
          workflow_id: workflowId || undefined
        })
      });
      
      const json = await parseJson(res);
      if (!res.ok) throw new Error(JSON.stringify(json));
      
      // Workflow validation: Only update state if still on same workflow
      if (!validateWorkflowContext(args, workflowId, "runGap")) {
        return;
      }
      
      const runId = Number(json.run_id);
      let rows = extractGapRows(json);
      let diagnostics = extractGapDiagnostics(json);
      
      if ((!rows || rows.length === 0) && runId) {
        const runRes = await fetch(`${API_BASE}/v1/gap-analysis/${runId}`);
        const runJson = await parseJson(runRes);
        
        // Re-validate after async operation
        if (!validateWorkflowContext(args, workflowId, "runGap-fetch")) {
          return;
        }
        
        if (runRes.ok) {
          rows = extractGapRows(runJson);
          diagnostics = extractGapDiagnostics(runJson);
        }
      }
      
      args.setGapRunId(runId || null);
      args.setGapRows(rows || []);
      args.setGapDiagnostics(diagnostics);
      await deps.loadWorkflows();
      args.addToast("success", `Requirement-to-Data Mapping completed. Rows: ${rows.length}`);
      args.pushAudit("success", `BA completed gap analysis with ${rows.length} rows.`);
    } catch (e) {
      handleAgentError(
        args,
        workflowId,
        `Gap analysis failed: ${String(e)}`,
        "Gap analysis failed.",
        "Gap analysis failed."
      );
      clearAgentOutputState(args, "BA");
    } finally {
      args.setBusy(false);
    }
  }

  async function runGapRemediation() {
    if (!args.gapRunId) return;
    
    const workflowId = args.activeWorkflowId;
    args.setBusy(true);
    args.setMessage("");
    
    try {
      const res = await fetch(`${API_BASE}/v1/gap-analysis/remediate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          base_gap_run_id: args.gapRunId,
          workflow_id: workflowId || undefined,
          allow_fallback: true,
          user_context: args.remediationUserContext || undefined,
          include_statuses: args.remediationStatuses,
          supplemental_artifact_ids: args.remediationArtifactIds,
          max_rows: 100
        })
      });
      
      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "Gap remediation failed"));
      
      // Workflow validation: Only update state if still on same workflow
      if (!validateWorkflowContext(args, workflowId, "runGapRemediation")) {
        return;
      }
      
      const runId = Number(json.run_id);
      const rows = extractGapRows(json);
      const diagnostics = extractGapDiagnostics(json);
      
      args.setGapRunId(runId || null);
      args.setGapRows(rows || []);
      args.setGapDiagnostics(diagnostics);
      await deps.loadWorkflows();
      args.addToast("success", `Remediation run completed. Updated rows: ${rows.length}`);
      args.pushAudit("success", `BA remediation run completed with ${rows.length} rows.`);
    } catch (e) {
      handleAgentError(
        args,
        workflowId,
        `Gap remediation failed: ${String(e)}`,
        "Gap remediation failed.",
        "Gap remediation failed."
      );
    } finally {
      args.setBusy(false);
    }
  }

  async function runCompare() {
    if (!args.compareBaselineId || !args.compareChangedId) return;
    args.setCompareBusy(true);
    args.setMessage("");
    try {
      const res = await fetch(`${API_BASE}/v1/psd/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          baseline_artifact_id: Number(args.compareBaselineId),
          changed_artifact_id: Number(args.compareChangedId),
          user_context: args.baUserContext || undefined
        })
      });
      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "PSD compare failed"));
      args.setCompareResult(json);
      args.addToast("success", "PSD version comparison completed.");
      args.pushAudit("success", "PSD version comparison completed.");
    } catch (e) {
      args.setMessage(`PSD compare failed: ${String(e)}`);
      args.addToast("error", "PSD compare failed.");
      args.pushAudit("warn", "PSD compare failed.");
    } finally {
      args.setCompareBusy(false);
    }
  }

  async function runSql() {
    if (!args.gapRunId || !args.modelArtifactId) return;
    
    const workflowId = args.activeWorkflowId;
    args.setBusy(true);
    args.setMessage("");
    clearAgentOutputState(args, "DEV");
    
    try {
      const res = await fetch(`${API_BASE}/v1/sql/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          gap_run_id: args.gapRunId,
          data_model_artifact_id: Number(args.modelArtifactId),
          user_context: args.devUserContext || undefined,
          workflow_id: workflowId || undefined
        })
      });
      
      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "SQL generation failed"));
      
      // Workflow validation: Only update state if still on same workflow
      if (!validateWorkflowContext(args, workflowId, "runSql")) {
        return;
      }
      
      args.setSqlRunId(json.run_id);
      args.setSqlScript(json.sql_script || "");
      await deps.loadWorkflows();
      args.addToast("success", "SQL generation completed.");
      args.pushAudit("success", "Developer generated SQL script.");
    } catch (e) {
      const err = String(e).replace(/^Error:\s*/, "");
      if (validateWorkflowContext(args, workflowId, "runSql-error")) {
        args.setMessage(`SQL generation failed: ${err}`);
        args.setSqlScript(`-- SQL generation failed\n-- ${err}`);
        args.addToast("error", `SQL generation failed: ${err}`);
        args.pushAudit("warn", "SQL generation failed.");
      }
    } finally {
      args.setBusy(false);
    }
  }

  async function linkReportXml() {
    if (!args.activeWorkflowId || !args.reportXmlArtifactId) return;
    args.setBusy(true);
    args.setMessage("");
    try {
      const res = await fetch(`${API_BASE}/v1/dev/report-xml/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: args.projectId, workflow_id: args.activeWorkflowId, report_xml_artifact_id: Number(args.reportXmlArtifactId), actor: "dev.user" })
      });
      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "Failed to save submission XML"));
      args.setReportXmlLinked(true);
      await deps.loadWorkflows();
      args.addToast("success", "Submission XML saved to workflow.");
      args.pushAudit("success", "Developer linked submission XML to workflow.");
    } catch (e) {
      const err = String(e).replace(/^Error:\s*/, "");
      args.setMessage(`Submission XML save failed: ${err}`);
      args.addToast("error", err);
      args.pushAudit("warn", "Submission XML save failed.");
    } finally {
      args.setBusy(false);
    }
  }

  async function runXmlValidation() {
    if (!args.reportXmlArtifactId || !args.xsdArtifactId || !args.fcaArtifactId || !args.modelArtifactId) return;
    
    const workflowId = args.activeWorkflowId;
    args.setBusy(true);
    args.setMessage("");
    clearAgentOutputState(args, "REVIEWER");
    
    try {
      const res = await fetch(`${API_BASE}/v1/xml/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          report_xml_artifact_id: Number(args.reportXmlArtifactId),
          xsd_artifact_id: Number(args.xsdArtifactId),
          fca_artifact_id: Number(args.fcaArtifactId),
          data_model_artifact_id: Number(args.modelArtifactId),
          user_context: args.revUserContext || undefined,
          workflow_id: workflowId || undefined,
          compact: true
        })
      });
      
      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "XML validation failed"));
      
      // Workflow validation: Only update state if still on same workflow
      if (!validateWorkflowContext(args, workflowId, "runXmlValidation")) {
        return;
      }
      
      args.setXmlRunId(json.run_id);
      const xsdPass = Boolean(json?.xsd_validation?.pass);
      const rulePass = Boolean(json?.rule_checks?.passed);
      const gatePassed =
        json?.gate_status?.passed ?? json?.gate_status?.pass ?? (json?.display?.status === "PASS" ? true : undefined);
      args.setXmlValidation({
        pass: typeof gatePassed === "boolean" ? gatePassed : xsdPass && rulePass,
        errors: Array.isArray(json?.xsd_validation?.errors) ? json.xsd_validation.errors : [],
        error_details: Array.isArray(json?.xsd_validation?.error_details) ? json.xsd_validation.error_details : [],
        display: json?.display || undefined,
        gate_status: json?.gate_status || undefined,
        ai_review: json?.ai_review || {},
        rule_checks: json?.rule_checks || {},
        analysis_meta: json?.analysis_meta || undefined
      });
      await deps.loadWorkflows();
      args.addToast("success", "XML validation completed.");
      args.pushAudit("success", "Reviewer completed report validation.");
    } catch (e) {
      handleAgentError(
        args,
        workflowId,
        `XML validation failed: ${String(e)}`,
        "XML validation failed.",
        "XML validation failed."
      );
      clearAgentOutputState(args, "REVIEWER");
    } finally {
      args.setBusy(false);
    }
  }

  return { runGap, runGapRemediation, runCompare, runSql, linkReportXml, runXmlValidation };
}
