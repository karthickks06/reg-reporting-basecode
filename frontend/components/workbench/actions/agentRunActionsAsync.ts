import { API_BASE, extractApiError, parseJson } from "../utils";
import type { UseWorkbenchActionsArgs } from "./types";
import { ensureWorkflowEditable, handleAgentError, validateWorkflowContext } from "./agentActionHelpers";

type AgentRunActionDeps = {
  loadWorkflows: (showToast?: boolean) => Promise<void>;
  loadArtifacts: (showToast?: boolean) => Promise<void>;
  submitJob?: (jobData: any) => Promise<string>; // For submitting jobs via hook
};

export function createAgentRunActionsAsync(args: UseWorkbenchActionsArgs, deps: AgentRunActionDeps) {
  async function runGap() {
    if (!args.fcaArtifactId || !args.modelArtifactId) return;
    if (!ensureWorkflowEditable(args, "Gap analysis")) return;
    
    const workflowId = args.activeWorkflowId;
    args.setMessage("");
    
    try {
      const res = await fetch(`${API_BASE}/ba/gap-analysis/async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          fca_artifact_id: Number(args.fcaArtifactId),
          data_model_artifact_id: Number(args.modelArtifactId),
          allow_fallback: true,
          user_context: args.baUserContext || undefined,
          workflow_id: workflowId || undefined,
          actor: "BA"
        })
      });
      
      const json = await parseJson(res);
      if (!res.ok) throw new Error(JSON.stringify(json));
      
      // Workflow validation
      if (!validateWorkflowContext(args, workflowId, "runGap")) {
        return;
      }
      
      const jobId = json.job_id;
      args.addToast("success", `Gap analysis job submitted (ID: ${jobId}). Processing in background...`);
      args.pushAudit("success", `BA started gap analysis job ${jobId}.`);
      
      // The job progress will be tracked by the useJobs hook
      // Results will be loaded when job completes
      
    } catch (e) {
      handleAgentError(
        args,
        workflowId,
        `Gap analysis submission failed: ${String(e)}`,
        "Gap analysis submission failed.",
        "Gap analysis submission failed."
      );
    }
  }

  async function runGapRemediation() {
    if (!args.gapRunId) return;
    if (!ensureWorkflowEditable(args, "Gap remediation")) return;
    
    const workflowId = args.activeWorkflowId;
    args.setMessage("");
    
    try {
      const res = await fetch(`${API_BASE}/ba/gap-analysis/remediate/async`, {
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
          max_rows: 100,
          actor: "BA"
        })
      });
      
      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "Gap remediation failed"));
      
      if (!validateWorkflowContext(args, workflowId, "runGapRemediation")) {
        return;
      }
      
      const jobId = json.job_id;
      args.addToast("success", `Remediation job submitted (ID: ${jobId}). Processing in background...`);
      args.pushAudit("success", `BA started remediation job ${jobId}.`);
      
    } catch (e) {
      handleAgentError(
        args,
        workflowId,
        `Gap remediation submission failed: ${String(e)}`,
        "Gap remediation submission failed.",
        "Gap remediation submission failed."
      );
    }
  }

  async function runCompare() {
    if (!args.compareBaselineId || !args.compareChangedId) return;
    if (!ensureWorkflowEditable(args, "PSD comparison")) return;
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
    if (!ensureWorkflowEditable(args, "SQL generation")) return;
    
    const workflowId = args.activeWorkflowId;
    args.setMessage("");
    
    try {
      const res = await fetch(`${API_BASE}/dev/sql/generate/async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          gap_run_id: args.gapRunId,
          data_model_artifact_id: Number(args.modelArtifactId),
          user_context: args.devUserContext || undefined,
          workflow_id: workflowId || undefined,
          actor: "DEV"
        })
      });
      
      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "SQL generation failed"));
      
      if (!validateWorkflowContext(args, workflowId, "runSql")) {
        return;
      }
      
      const jobId = json.job_id;
      args.addToast("success", `SQL generation job submitted (ID: ${jobId}). Processing in background...`);
      args.pushAudit("success", `Developer started SQL generation job ${jobId}.`);
      
    } catch (e) {
      const err = String(e).replace(/^Error:\s*/, "");
      if (validateWorkflowContext(args, workflowId, "runSql-error")) {
        args.setMessage(`SQL generation submission failed: ${err}`);
        args.addToast("error", `SQL generation submission failed: ${err}`);
        args.pushAudit("warn", "SQL generation submission failed.");
      }
    }
  }

  async function linkReportXml() {
    if (!args.activeWorkflowId || !args.reportXmlArtifactId) return;
    if (!ensureWorkflowEditable(args, "Submission XML linking")) return;
    args.setBusy(true);
    args.setMessage("");
    try {
      const res = await fetch(`${API_BASE}/v1/dev/report-xml/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          project_id: args.projectId, 
          workflow_id: args.activeWorkflowId, 
          report_xml_artifact_id: Number(args.reportXmlArtifactId), 
          actor: "dev.user" 
        })
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
    if (!args.reportXmlArtifactId || !args.xsdArtifactId || !args.fcaArtifactId || !args.modelArtifactId || !args.dataArtifactId) return;
    if (!ensureWorkflowEditable(args, "XML validation")) return;
    
    const workflowId = args.activeWorkflowId;
    args.setMessage("");
    
    try {
      const res = await fetch(`${API_BASE}/reviewer/xml/validate/async`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: args.projectId,
          report_xml_artifact_id: Number(args.reportXmlArtifactId),
          xsd_artifact_id: Number(args.xsdArtifactId),
          fca_artifact_id: Number(args.fcaArtifactId),
          data_artifact_id: Number(args.dataArtifactId),
          data_model_artifact_id: Number(args.modelArtifactId),
          functional_spec_artifact_id: args.currentWorkflow?.functional_spec_artifact_id || undefined,
          user_context: args.revUserContext || undefined,
          workflow_id: workflowId || undefined,
          compact: true,
          actor: "REVIEWER"
        })
      });
      
      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "XML validation failed"));
      
      if (!validateWorkflowContext(args, workflowId, "runXmlValidation")) {
        return;
      }
      
      const jobId = json.job_id;
      args.addToast("success", `XML validation job submitted (ID: ${jobId}). Processing in background...`);
      args.pushAudit("success", `Reviewer started XML validation job ${jobId}.`);
      
    } catch (e) {
      handleAgentError(
        args,
        workflowId,
        `XML validation submission failed: ${String(e)}`,
        "XML validation submission failed.",
        "XML validation submission failed."
      );
    }
  }

  async function runXmlGeneration() {
    // Only require the mandatory fields: data_artifact_id and xsd_artifact_id
    if (!args.dataArtifactId || !args.xsdArtifactId) return;
    if (!ensureWorkflowEditable(args, "XML generation")) return;

    const workflowId = args.activeWorkflowId;
    args.setMessage("");

    try {
      const payload: any = {
        project_id: args.projectId,
        data_artifact_id: Number(args.dataArtifactId),
        xsd_artifact_id: Number(args.xsdArtifactId),
        user_context: args.devUserContext || undefined,
        workflow_id: workflowId || undefined
      };
      
      // Only include optional fields if they have valid values
      if (args.fcaArtifactId) {
        payload.fca_artifact_id = Number(args.fcaArtifactId);
      }
      if (args.currentWorkflow?.functional_spec_artifact_id) {
        payload.functional_spec_artifact_id = args.currentWorkflow.functional_spec_artifact_id;
      }

      const res = await fetch(`${API_BASE}/v1/dev/report-xml/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await parseJson(res);
      if (!res.ok) throw new Error(extractApiError(json, "XML generation failed"));

      if (!validateWorkflowContext(args, workflowId, "runXmlGeneration")) {
        return;
      }

      args.setXmlRunId(Number(json.run_id || ""));
      args.setReportXmlArtifactId(Number(json.artifact_id || ""));
      args.setReportXmlLinked(Boolean(json.artifact_id));
      await deps.loadArtifacts();
      await deps.loadWorkflows();
      args.addToast("success", "Submission XML generated and linked to workflow.");
      args.pushAudit("success", "Developer generated submission XML.");
    } catch (e) {
      handleAgentError(
        args,
        workflowId,
        `XML generation failed: ${String(e)}`,
        "XML generation failed.",
        "XML generation failed."
      );
    }
  }

  return { runGap, runGapRemediation, runCompare, runSql, runXmlGeneration, linkReportXml, runXmlValidation };
}
