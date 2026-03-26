import { BATabWithJobs } from "./BATabWithJobs";
import { DeveloperTab } from "./DeveloperTab";
import { ReviewerTab } from "./ReviewerTab";
import { WorkbenchInsights } from "./WorkbenchInsights";
import { WorkflowActionPanel } from "./WorkflowActionPanel";
import type { JobStatus } from "../jobs/JobProgressCard";
import type { WorkbenchActions } from "./useWorkbenchActions";
import type { WorkbenchDerived } from "./useWorkbenchDerived";
import type { WorkbenchState } from "./useWorkbenchState";
import { CHAT_MODEL_OPTIONS } from "./workbenchConstants";
import { API_BASE } from "./utils";

type Props = {
  state: WorkbenchState;
  actions: WorkbenchActions;
  derived: WorkbenchDerived;
  currentWorkflowJobs: JobStatus[];
};

function buildXmlReport(state: WorkbenchState) {
  return JSON.stringify(
    state.xmlValidation?.display || {
      xsd_validation: {
        pass: state.xmlValidation?.pass,
        error_count: state.xmlValidation?.error_details?.length || state.xmlValidation?.errors?.length || 0,
        top_errors: (state.xmlValidation?.error_details || []).slice(0, 10)
      },
      rule_checks: state.xmlValidation?.rule_checks || {},
      ai_review: state.xmlValidation?.ai_review || {},
      analysis_meta: state.xmlValidation?.analysis_meta || {}
    },
    null,
    2
  );
}

export function WorkbenchStageContent({ state, actions, derived, currentWorkflowJobs }: Props) {
  const isReadOnly = !derived.currentWorkflow?.pending_for_me;
  const devActiveJobs = currentWorkflowJobs.filter(
    (job) => ["sql_generation", "xml_generation"].includes(String(job.job_type || "")) && (job.status === "pending" || job.status === "running")
  );
  const devActiveBackgroundJob = devActiveJobs[0]
    ? {
        jobType: devActiveJobs[0].job_type as "sql_generation" | "xml_generation",
        status: devActiveJobs[0].status as "pending" | "running",
        progressMessage: devActiveJobs[0].progress_message,
        progressPct: devActiveJobs[0].progress_pct
      }
    : null;
  const workflowDisplayId = derived.currentWorkflow?.display_id || (derived.currentWorkflow?.id ? `WF-${String(derived.currentWorkflow.id).padStart(6, "0")}` : "-");
  const stageName = state.activeAgentTab === "ba" ? "Business Analyst" : state.activeAgentTab === "dev" ? "Developer" : "Reviewer";
  const stageSubtitle =
    state.activeAgentTab === "ba"
      ? "Assess source coverage, confirm the mapping brief, and prepare the handoff."
      : state.activeAgentTab === "dev"
        ? "Generate delivery assets and prepare a review-ready package."
        : "Validate the submission package and confirm review checks are ready to close.";
  const stageSignalCards =
    state.activeAgentTab === "ba"
      ? [
          { label: "Inputs", value: derived.baReady ? "Ready" : "Required" },
          { label: "Analysis mode", value: state.baMode === "psd_model" ? "PSD vs Model" : "PSD Compare" },
          { label: "Access", value: isReadOnly ? "Read only" : "Assigned to you" }
        ]
      : state.activeAgentTab === "dev"
        ? [
            { label: "Inputs", value: derived.devReady ? "Approved" : "Needs setup" },
            { label: "SQL", value: state.sqlScript ? "Generated" : "Pending" },
            { label: "Reviewer handoff", value: derived.linkedReportXmlName || state.reportXmlArtifactId ? "XML linked" : "In progress" }
          ]
        : [
            { label: "Inputs", value: derived.revReady ? "Ready" : "Needs setup" },
            { label: "Validation", value: state.xmlValidation ? (state.xmlValidation.pass ? "Pass" : "Review") : "Pending" },
            { label: "Closeout", value: state.xmlValidation ? "Review stage active" : "Awaiting validation" }
          ];

  return (
    <>
      <section className="panel stage-content-shell">
        <div className="stage-content-shell__head">
          <div>
            <div className="stage-content-shell__eyebrow">{stageName} Stage</div>
            <h2 className="stage-content-shell__title">Stage Workspace</h2>
            <p className="stage-content-shell__subtitle">{stageSubtitle}</p>
          </div>
          <div className="stage-content-shell__meta">
            <span className="panel-badge badge-slate">{workflowDisplayId}</span>
            <span className={`panel-badge ${isReadOnly ? "badge-amber" : "badge-teal"}`}>{isReadOnly ? "Read Only" : "Editable"}</span>
          </div>
        </div>
        {isReadOnly && (
          <div className="project-message stage-content-shell__notice">
            This workflow is currently assigned to another owner. You can inspect outputs, but stage actions are restricted.
          </div>
        )}
        <div className="stage-content-shell__signals">
          {stageSignalCards.map((card) => (
            <div className="stage-content-shell__signal-card" key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className={`main-grid ${state.activeAgentTab === "ba" ? "main-grid-ba" : ""}`}>
        <div>
          {state.activeAgentTab === "ba" && (
            <BATabWithJobs
              busy={state.busy}
              projectId={state.projectId}
              activeWorkflowId={state.activeWorkflowId}
              baReady={derived.baReady}
              gapRunId={state.gapRunId}
              hasFunctionalSpec={Boolean(derived.currentWorkflow?.functional_spec_artifact_id)}
              baMode={state.baMode}
              baUserContext={state.baUserContext}
              gapRows={state.gapRows}
              gapDiagnostics={state.gapDiagnostics}
              remediationStatuses={state.remediationStatuses}
              remediationArtifactIds={state.remediationArtifactIds}
              remediationUserContext={state.remediationUserContext}
              fcaArtifactId={state.fcaArtifactId}
              modelArtifactId={state.modelArtifactId}
              compareBaselineId={state.compareBaselineId}
              compareChangedId={state.compareChangedId}
              compareBusy={state.compareBusy}
              fcaOptions={derived.fcaOptions}
              modelOptions={derived.modelOptions}
              baFcaFile={state.baFcaFile}
              pendingForMe={Boolean(derived.currentWorkflow?.pending_for_me)}
              setBaMode={state.setBaMode}
              setBaUserContext={state.setBaUserContext}
              setRemediationStatuses={state.setRemediationStatuses}
              setRemediationArtifactIds={state.setRemediationArtifactIds}
              setRemediationUserContext={state.setRemediationUserContext}
              setFcaArtifactId={state.setFcaArtifactId}
              setModelArtifactId={state.setModelArtifactId}
              setCompareBaselineId={state.setCompareBaselineId}
              setCompareChangedId={state.setCompareChangedId}
              setBaFcaFile={state.setBaFcaFile}
              runGap={actions.runGap}
              runGapRemediation={actions.runGapRemediation}
              runCompare={actions.runCompare}
              onGapRunCompleted={actions.handleGapRowUpdate}
              uploadArtifact={actions.uploadArtifact}
              supplementalArtifactOptions={state.artifacts.filter((artifact) =>
                ["data", "data_model", "fca"].includes(String(artifact.kind || "").toLowerCase())
              )}
              showJobNotifications={true}
              showInlineJobPanels={false}
              addToast={state.addToast}
            />
          )}
          {state.activeAgentTab === "dev" && (
            <DeveloperTab
              busy={state.busy}
              isBackgroundJobRunning={devActiveJobs.length > 0}
              activeBackgroundJob={devActiveBackgroundJob}
              devReady={derived.devReady}
              devXmlReady={derived.devXmlReady}
              gapRunId={state.gapRunId}
              sqlRunId={state.sqlRunId}
              xmlRunId={state.xmlRunId || derived.currentWorkflow?.latest_xml_run_id || null}
              devUserContext={state.devUserContext}
              modelArtifactId={state.modelArtifactId}
              dataArtifactId={state.dataArtifactId}
              xsdArtifactId={state.xsdArtifactId}
              fcaArtifactId={state.fcaArtifactId}
              fcaArtifactName={derived.selectedFcaName}
              modelArtifactName={derived.selectedModelName}
              dataArtifactName={derived.selectedDataName}
              xsdArtifactName={derived.selectedXsdName}
              functionalSpecName={derived.functionalSpecName}
              reportXmlArtifactName={derived.linkedReportXmlName || derived.selectedReportXmlName}
              modelOptions={derived.modelOptions}
              dataOptions={derived.dataOptions}
              xsdOptions={derived.xsdOptions}
              devDataFile={state.devDataFile}
              readOnly={isReadOnly}
              setDevUserContext={state.setDevUserContext}
              setModelArtifactId={state.setModelArtifactId}
              setDataArtifactId={state.setDataArtifactId}
              setXsdArtifactId={state.setXsdArtifactId}
              setDevDataFile={state.setDevDataFile}
              runSql={actions.runSql}
              runXmlGeneration={actions.runXmlGeneration}
              uploadArtifact={actions.uploadArtifact}
              addToast={state.addToast}
            />
          )}
          {state.activeAgentTab === "rev" && (
            <ReviewerTab
              busy={state.busy}
              revReady={derived.revReady}
              xmlRunId={state.xmlRunId}
              xmlValidation={state.xmlValidation}
              revUserContext={state.revUserContext}
              reportXmlArtifactId={state.reportXmlArtifactId}
              xsdArtifactId={state.xsdArtifactId}
              fcaArtifactId={state.fcaArtifactId}
              dataArtifactId={state.dataArtifactId}
              modelArtifactId={state.modelArtifactId}
              reportXmlOptions={derived.reportXmlOptions}
              xsdOptions={derived.xsdOptions}
              fcaOptions={derived.fcaOptions}
              dataOptions={derived.dataOptions}
              reportXmlArtifactName={derived.selectedReportXmlName}
              xsdArtifactName={derived.selectedXsdName}
              fcaArtifactName={derived.selectedFcaName}
              dataArtifactName={derived.selectedDataName}
              modelArtifactName={derived.selectedModelName}
              functionalSpecName={derived.functionalSpecName}
              revXsdFile={state.revXsdFile}
              setRevUserContext={state.setRevUserContext}
              setReportXmlArtifactId={state.setReportXmlArtifactId}
              setXsdArtifactId={state.setXsdArtifactId}
              setFcaArtifactId={state.setFcaArtifactId}
              setDataArtifactId={state.setDataArtifactId}
              setModelArtifactId={state.setModelArtifactId}
              setRevXsdFile={state.setRevXsdFile}
              modelOptions={derived.modelOptions}
              runXmlValidation={actions.runXmlValidation}
              uploadArtifact={actions.uploadArtifact}
              readOnly={isReadOnly}
            />
          )}
        </div>

        <WorkbenchInsights
          activeWorkflowId={state.activeWorkflowId}
          activeAgentTab={state.activeAgentTab}
          baMode={state.baMode}
          activeOutputTitle={derived.activeOutputTitle}
          gapRows={state.gapRows}
          uploadCount={derived.uploadCount}
          validationCount={derived.validationCount}
          reportCount={derived.reportCount}
          pendingCount={derived.pendingCount}
          gapRunId={state.gapRunId}
          gapRowsCount={state.gapRows.length}
          modelArtifactId={state.modelArtifactId}
          compareBaselineId={state.compareBaselineId}
          compareChangedId={state.compareChangedId}
          compareBaselineName={derived.compareBaselineName}
          compareChangedName={derived.compareChangedName}
          compareResult={state.compareResult}
          sqlScript={state.sqlScript}
          xmlReport={buildXmlReport(state)}
          reportXmlPreview={state.reportXmlPreview}
          xmlValidation={state.xmlValidation}
          auditTrail={state.auditTrail}
          chatInput={state.chatInput}
          chatBusy={state.chatBusy}
          chatIncludeAll={state.chatIncludeAll}
          chatModel={state.chatModel}
          chatModelOptions={CHAT_MODEL_OPTIONS}
          chatResponse={state.chatResponse}
          chatHistory={state.chatHistory}
          setChatInput={state.setChatInput}
          setChatIncludeAll={state.setChatIncludeAll}
          setChatModel={state.setChatModel}
          clearChatHistory={() => state.setChatHistory([])}
          runContextChat={actions.runContextChat}
          apiBase={API_BASE}
          showSecondaryInsights={false}
          onGapRowUpdate={actions.handleGapRowUpdate}
          readOnly={isReadOnly}
          actionPanel={
            <WorkflowActionPanel
              workflow={derived.currentWorkflow}
              projectId={state.projectId}
              workflowComment={state.workflowComment}
              setWorkflowComment={state.setWorkflowComment}
              sendBackReasonCode={state.sendBackReasonCode}
              setSendBackReasonCode={state.setSendBackReasonCode}
              sendBackReasonDetail={state.sendBackReasonDetail}
              setSendBackReasonDetail={state.setSendBackReasonDetail}
              workflowBusy={state.workflowBusy}
              gapRunId={state.gapRunId}
              gapRows={state.gapRows}
              gapDiagnostics={state.gapDiagnostics}
              activeAgentTab={state.activeAgentTab}
              apiBase={API_BASE}
              fcaArtifactId={state.fcaArtifactId}
              modelArtifactId={state.modelArtifactId}
              fcaArtifactName={derived.selectedFcaName}
              modelArtifactName={derived.selectedModelName}
              functionalSpecName={derived.functionalSpecName}
              reportXmlArtifactId={state.reportXmlArtifactId}
              reportXmlArtifactName={derived.linkedReportXmlName || derived.selectedReportXmlName}
              setReportXmlArtifactId={state.setReportXmlArtifactId}
              reportXmlOptions={derived.reportXmlOptions}
              uploadArtifact={actions.uploadArtifact}
              linkReportXml={actions.linkReportXml}
              message={state.message}
              addToast={state.addToast}
              saveFunctionalSpec={actions.saveFunctionalSpec}
              updateBaGapWaivers={actions.updateBaGapWaivers}
              submitCurrentStage={actions.submitCurrentStage}
              sendBackStage={actions.sendBackStage}
              returnToHome={() => state.setActiveWorkflowId(null)}
            />
          }
        />
      </section>
    </>
  );
}
