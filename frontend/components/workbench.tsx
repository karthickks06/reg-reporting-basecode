"use client";

import { useEffect, useRef } from "react";

import { PersonaLogin } from "./workbench/PersonaLogin";
import { WorkbenchDashboard } from "./workbench/WorkbenchDashboard";
import { WorkflowHome } from "./workbench/WorkflowHome";
import { useWorkbenchActions } from "./workbench/useWorkbenchActions";
import { useWorkbenchDerived } from "./workbench/useWorkbenchDerived";
import { useWorkbenchState } from "./workbench/useWorkbenchState";
import { PERSONA_TO_TAB } from "./workbench/workbenchConstants";
import { useJobs } from "../hooks/useJobs";

export function Workbench() {
  const state = useWorkbenchState();
  const assignmentSnapshotRef = useRef<Map<number, boolean>>(new Map());
  const assignmentBaselineReadyRef = useRef(false);
  const { jobs: projectJobs } = useJobs({
    actor: state.persona || undefined,
    projectId: state.projectId
  });
  const derived = useWorkbenchDerived({
    artifacts: state.artifacts,
    workflows: state.workflows,
    activeWorkflowId: state.activeWorkflowId,
    persona: state.persona,
    baMode: state.baMode,
    activeAgentTab: state.activeAgentTab,
    fcaArtifactId: state.fcaArtifactId,
    modelArtifactId: state.modelArtifactId,
    dataArtifactId: state.dataArtifactId,
    reportXmlArtifactId: state.reportXmlArtifactId,
    xsdArtifactId: state.xsdArtifactId,
    compareBaselineId: state.compareBaselineId,
    compareChangedId: state.compareChangedId,
    gapRunId: state.gapRunId,
    gapRows: state.gapRows,
    sqlRunId: state.sqlRunId,
    xmlRunId: state.xmlRunId,
    reportXmlLinked: state.reportXmlLinked
  });

  const actions = useWorkbenchActions({
    persona: state.persona,
    projectId: state.projectId,
    currentWorkflow: derived.currentWorkflow || null,
    activeWorkflowId: state.activeWorkflowId,
    workflowName: state.workflowName,
    workflowPsdVersion: state.workflowPsdVersion,
    workflowComment: state.workflowComment,
    sendBackReasonCode: state.sendBackReasonCode,
    sendBackReasonDetail: state.sendBackReasonDetail,
    baUserContext: state.baUserContext,
    devUserContext: state.devUserContext,
    revUserContext: state.revUserContext,
    chatInput: state.chatInput,
    chatIncludeAll: state.chatIncludeAll,
    chatModel: state.chatModel,
    fcaArtifactId: state.fcaArtifactId,
    modelArtifactId: state.modelArtifactId,
    dataArtifactId: state.dataArtifactId,
    reportXmlArtifactId: state.reportXmlArtifactId,
    xsdArtifactId: state.xsdArtifactId,
    compareBaselineId: state.compareBaselineId,
    compareChangedId: state.compareChangedId,
    gapRunId: state.gapRunId,
    gapDiagnostics: state.gapDiagnostics,
    remediationStatuses: state.remediationStatuses,
    remediationArtifactIds: state.remediationArtifactIds,
    remediationUserContext: state.remediationUserContext,
    setBackendUp: state.setBackendUp,
    setBackendStatusText: state.setBackendStatusText,
    setLlmUp: state.setLlmUp,
    setArtifacts: state.setArtifacts,
    setWorkflows: state.setWorkflows,
    setWorkflowName: state.setWorkflowName,
    setWorkflowPsdVersion: state.setWorkflowPsdVersion,
    setWorkflowNameError: state.setWorkflowNameError,
    setWorkflowComment: state.setWorkflowComment,
    setWorkflowBusy: state.setWorkflowBusy,
    setBusy: state.setBusy,
    setMessage: state.setMessage,
    setFcaArtifactId: state.setFcaArtifactId,
    setModelArtifactId: state.setModelArtifactId,
    setDataArtifactId: state.setDataArtifactId,
    setXsdArtifactId: state.setXsdArtifactId,
    setSendBackReasonCode: state.setSendBackReasonCode,
    setSendBackReasonDetail: state.setSendBackReasonDetail,
    setGapRunId: state.setGapRunId,
    setGapRows: state.setGapRows,
    setGapDiagnostics: state.setGapDiagnostics,
    setSqlRunId: state.setSqlRunId,
    setSqlScript: state.setSqlScript,
    setXmlRunId: state.setXmlRunId,
    setXmlValidation: state.setXmlValidation,
    setCompareResult: state.setCompareResult,
    setCompareBusy: state.setCompareBusy,
    setReportXmlLinked: state.setReportXmlLinked,
    setReportXmlPreview: state.setReportXmlPreview,
    setReportXmlArtifactId: state.setReportXmlArtifactId,
    setRemediationStatuses: state.setRemediationStatuses,
    setRemediationArtifactIds: state.setRemediationArtifactIds,
    setRemediationUserContext: state.setRemediationUserContext,
    setActiveWorkflowId: state.setActiveWorkflowId,
    setActiveAgentTab: state.setActiveAgentTab,
    setChatInput: state.setChatInput,
    setChatBusy: state.setChatBusy,
    setChatResponse: state.setChatResponse,
    setChatHistory: state.setChatHistory,
    addToast: state.addToast,
    pushAudit: state.pushAudit
  });

  useEffect(() => {
    actions.refreshServiceHealth();
    const timer = setInterval(actions.refreshServiceHealth, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    actions.loadArtifacts();
  }, [state.projectId]);

  useEffect(() => {
    if (!state.persona) return;
    state.setActiveAgentTab(PERSONA_TO_TAB[state.persona]);
    actions.loadWorkflows();
    state.pushAudit("info", `Persona session started: ${state.persona}`);
  }, [state.persona, state.projectId]);

  useEffect(() => {
    assignmentSnapshotRef.current = new Map();
    assignmentBaselineReadyRef.current = false;
  }, [state.persona, state.projectId]);

  useEffect(() => {
    if (!state.persona) return;

    const timer = setInterval(() => {
      void actions.loadWorkflows();
    }, 15000);

    return () => clearInterval(timer);
  }, [state.persona, state.projectId]);

  useEffect(() => {
    if (!state.persona || !state.workflows.length) return;

    const previous = assignmentSnapshotRef.current;
    const next = new Map<number, boolean>();

    state.workflows.forEach((workflow) => {
      const isPending = Boolean(workflow.pending_for_me);
      next.set(workflow.id, isPending);

      if (!assignmentBaselineReadyRef.current) return;

      const wasPending = previous.get(workflow.id) ?? false;
      if (!wasPending && isPending) {
        const workflowLabel = workflow.name ? `${workflow.name}` : `Workflow ${workflow.id}`;
        state.addToast("success", `${workflowLabel} is now assigned to you in ${workflow.current_stage}.`);
        state.pushAudit("info", `Workflow ${workflow.id} assigned to ${state.persona} in ${workflow.current_stage}.`);
      }
    });

    assignmentSnapshotRef.current = next;
    assignmentBaselineReadyRef.current = true;
  }, [state.workflows, state.persona]);

  // Auto-reopen active workflow after workflows are loaded (e.g., on page refresh)
  useEffect(() => {
    if (!state.activeWorkflowId || !state.workflows.length) return;

    const activeWf = state.workflows.find((w) => w.id === state.activeWorkflowId);
    if (activeWf && !state.gapRunId && activeWf.latest_gap_run_id) {
      actions.openWorkflow(activeWf);
    }
  }, [state.workflows, state.activeWorkflowId]);

  if (derived.showLogin) {
    return (
      <div className="dashboard-shell regai-wrap">
        <div className="toast-stack" role="status" aria-live="polite">{state.toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
        <PersonaLogin onSelectPersona={state.setPersona} />
      </div>
    );
  }

  if (derived.showWorkflowHome && state.persona) {
    return (
      <div className="dashboard-shell regai-wrap">
        <div className="toast-stack" role="status" aria-live="polite">{state.toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
        <WorkflowHome
          persona={state.persona}
          projectId={state.projectId}
          setProjectId={state.setProjectId}
          backendUp={state.backendUp}
          backendStatusText={state.backendStatusText}
          llmUp={state.llmUp}
          projectJobs={projectJobs}
          workflows={state.workflows}
          notifications={state.notifications}
          markNotificationRead={state.markNotificationRead}
          markAllNotificationsRead={state.markAllNotificationsRead}
          clearNotifications={state.clearNotifications}
          workflowBusy={state.workflowBusy}
          workflowName={state.workflowName}
          workflowPsdVersion={state.workflowPsdVersion}
          workflowNameError={state.workflowNameError}
          setWorkflowName={(value) => {
            state.setWorkflowName(value);
            if (state.workflowNameError) state.setWorkflowNameError("");
          }}
          setWorkflowPsdVersion={state.setWorkflowPsdVersion}
          createWorkflow={actions.createWorkflow}
          createWorkflowVersion={actions.createWorkflowVersion}
          openWorkflow={actions.openWorkflow}
          switchRole={() => {
            state.setPersona("");
            state.setActiveWorkflowId(null);
          }}
        />
      </div>
    );
  }

  return <WorkbenchDashboard state={state} actions={actions} derived={derived} projectJobs={projectJobs} />;
}
