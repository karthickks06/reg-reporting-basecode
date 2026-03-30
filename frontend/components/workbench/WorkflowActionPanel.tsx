import { useMemo, useState } from "react";
import { FileUploadZone } from "../FileUploadZone";
import { ActionIcon } from "./ActionIcon";
import { artifactOptionLabel } from "./artifactLabels";
import type { AgentTab, Artifact, UploadArtifactFn, WorkflowItem } from "./types";
import { SEND_BACK_REASON_OPTIONS } from "./workbenchConstants";
import { extractApiError } from "./utils";

type WorkflowActionPanelProps = {
  workflow: WorkflowItem | null;
  projectId: string;
  workflowComment: string;
  setWorkflowComment: (value: string) => void;
  sendBackReasonCode: string;
  setSendBackReasonCode: (value: string) => void;
  sendBackReasonDetail: string;
  setSendBackReasonDetail: (value: string) => void;
  workflowBusy: boolean;
  gapRunId: number | null;
  gapRows: Array<{ ref: string; field: string; status: string }>;
  gapDiagnostics: Record<string, any> | null;
  activeAgentTab: AgentTab;
  apiBase: string;
  fcaArtifactId: number | "";
  modelArtifactId: number | "";
  fcaArtifactName?: string;
  modelArtifactName?: string;
  functionalSpecName?: string;
  reportXmlArtifactId: number | "";
  reportXmlArtifactName?: string;
  setReportXmlArtifactId: (value: number | "") => void;
  reportXmlOptions: Artifact[];
  uploadArtifact: UploadArtifactFn;
  linkReportXml: () => Promise<void>;
  message: string;
  addToast?: (kind: "success" | "error", text: string) => void;
  saveFunctionalSpec: (format: "json" | "csv", autoAdvance?: boolean) => Promise<void>;
  updateBaGapWaivers?: (waivers: Record<string, any>, comment?: string) => Promise<void>;
  submitCurrentStage: () => Promise<any | null>;
  sendBackStage: () => Promise<void>;
  returnToHome: () => void;
};

export function WorkflowActionPanel({
  workflow,
  projectId,
  workflowComment,
  setWorkflowComment,
  sendBackReasonCode,
  setSendBackReasonCode,
  sendBackReasonDetail,
  setSendBackReasonDetail,
  workflowBusy,
  gapRunId,
  gapRows,
  gapDiagnostics,
  activeAgentTab,
  apiBase,
  fcaArtifactId,
  modelArtifactId,
  fcaArtifactName,
  modelArtifactName,
  functionalSpecName,
  reportXmlArtifactId,
  reportXmlArtifactName,
  setReportXmlArtifactId,
  reportXmlOptions,
  uploadArtifact,
  linkReportXml,
  message,
  saveFunctionalSpec,
  updateBaGapWaivers,
  submitCurrentStage,
  sendBackStage,
  returnToHome
}: WorkflowActionPanelProps) {
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [showArtifactsModal, setShowArtifactsModal] = useState(false);
  const [showWaiverModal, setShowWaiverModal] = useState(false);
  const [submitXmlFile, setSubmitXmlFile] = useState<File | null>(null);
  const [submitResult, setSubmitResult] = useState<any | null>(null);
  const [publishBusy, setPublishBusy] = useState<"" | "functional_spec" | "generated_sql" | "report_xml">("");
  const [publishMessage, setPublishMessage] = useState("");

  const stage = String(workflow?.current_stage || "");
  const sendBackValid = Boolean(sendBackReasonCode.trim() && sendBackReasonDetail.trim().length >= 10);
  const devCanSubmitWithSelection = stage === "DEV" && Boolean(reportXmlArtifactId || workflow?.latest_report_xml_artifact_id);
  const canSubmit =
    stage === "BA"
      ? Boolean(workflow?.functional_spec_artifact_id)
      : stage === "DEV"
        ? true
        : stage === "REVIEWER"
          ? Boolean(workflow?.latest_xml_run_id)
          : false;
  const gate = workflow?.quality_summary?.exit_gate_status;
  const gatePassed = gate ? Boolean((gate as any)?.passed ?? (gate as any)?.pass) : true;
  const gateCode = String((gate as any)?.code || "");
  const gateMetrics = ((gate as any)?.metrics || {}) as Record<string, any>;
  const degraded = Boolean((gate as any)?.metrics?.degraded_quality ?? gapDiagnostics?.degraded_quality);
  const degradedReasons = useMemo(() => {
    const arr = (gate as any)?.metrics?.degraded_reasons || gapDiagnostics?.degraded_reasons || [];
    return Array.isArray(arr) ? arr : [];
  }, [gate, gapDiagnostics]);
  const nextStage =
    stage === "BA" ? "DEV" : stage === "DEV" ? "REVIEWER" : stage === "REVIEWER" ? "COMPLETED" : "-";
  const isPendingForMe = Boolean(workflow?.pending_for_me);
  const openIssuesCount = Number(workflow?.quality_summary?.open_issues_count || 0);
  const submitDisabled = workflowBusy || !canSubmit || !(gatePassed || stage === "DEV") || !isPendingForMe;
  const confirmSubmitDisabled =
    workflowBusy ||
    (stage === "DEV" && !devCanSubmitWithSelection) ||
    (stage !== "DEV" && (!canSubmit || !gatePassed)) ||
    !isPendingForMe;

  const primaryActionLabel =
    stage === "BA" ? "Submit to DEV" : stage === "DEV" ? "Submit to Reviewer" : stage === "REVIEWER" ? "Complete Workflow" : "Submit";
  const ownershipLabel = isPendingForMe ? "Assigned to you" : "Waiting for assignee";
  const baWarningCount = Number(gateMetrics.unresolved_missing_rows || 0);
  const submitWithWarnings = stage === "BA" && gatePassed && gateCode === "gate_disabled" && baWarningCount > 0;
  const statusSummary = submitWithWarnings
    ? `${baWarningCount} unresolved field${baWarningCount === 1 ? "" : "s"} remain, but BA can still submit`
    : gatePassed
      ? "Ready for next stage"
      : openIssuesCount > 0
        ? `${openIssuesCount} issue${openIssuesCount === 1 ? "" : "s"} blocking exit`
        : "Exit checks still need review";
  const openRequiredActions = !gatePassed || openIssuesCount > 0 || Boolean(gate?.message) || degradedReasons.length > 0;
  const compactDeliverableSummary =
    stage === "BA"
      ? functionalSpecName || "Functional spec not saved yet"
      : stage === "DEV"
        ? reportXmlArtifactName || "Submission XML not linked yet"
        : reportXmlArtifactName || "Validated XML not available yet";
  const linkedArtifacts = [
    { label: "PSD Document", value: fcaArtifactName || (fcaArtifactId ? `Artifact ${fcaArtifactId}` : "Not linked") },
    { label: "Data Model", value: modelArtifactName || (modelArtifactId ? `Artifact ${modelArtifactId}` : "Not linked") },
    { label: "Mapping Spec", value: functionalSpecName || "Not saved yet" },
    { label: "Submission XML", value: reportXmlArtifactName || "Not linked" }
  ];
  const unresolvedGapRows = useMemo(
    () => gapRows.filter((row) => String(row.status || "").toLowerCase().includes("missing")),
    [gapRows]
  );
  const waivedRefs = useMemo(() => {
    const refs = workflow?.ba_gap_waivers_json?.refs;
    return Array.isArray(refs) ? refs : [];
  }, [workflow]);
  const nextActionHint =
    !isPendingForMe
      ? "This workflow is currently assigned to another owner."
      : stage === "BA" && !workflow?.functional_spec_artifact_id
        ? "Save the functional specification to unlock submission to DEV."
        : stage === "DEV" && !devCanSubmitWithSelection
          ? "Link the submission XML artifact before moving to Reviewer."
          : stage === "REVIEWER" && !workflow?.latest_xml_run_id
            ? "Run XML validation before completing the reviewer stage."
              : !gatePassed && stage !== "DEV"
                ? gate?.message || "Resolve the remaining exit issues before moving forward."
                : submitWithWarnings
                  ? `${baWarningCount} unresolved required fields remain. You can still submit, but DEV may send this back.`
                  : "Everything needed for this transition is in place.";

  function handleOpenSubmitConfirm() {
    if (submitDisabled) {
      return;
    }
    setShowSubmitConfirm(true);
  }

  async function publishToGitHub(artifactRole: "functional_spec" | "generated_sql" | "report_xml") {
    if (!workflow) return;
    setPublishBusy(artifactRole);
    setPublishMessage("");
    try {
      const response = await fetch(`${apiBase}/v1/integrations/github/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          workflow_id: workflow.id,
          artifact_role: artifactRole,
          actor: activeAgentTab === "ba" ? "ba.user" : activeAgentTab === "dev" ? "dev.user" : "reviewer.user",
          stage
        })
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(extractApiError(json, "Publish failed"));
      }
      setPublishMessage(`Published to GitHub: ${json.path}`);
    } catch (error) {
      setPublishMessage(String(error).replace(/^Error:\s*/, ""));
    } finally {
      setPublishBusy("");
    }
  }

  return (
    <section className="panel workflow-action-panel work-stage-panel">
      {activeAgentTab === "ba" ? (
        <>
          <div className="workflow-action-stage-transition">
            <div className="workflow-action-hero__summary">
              <div className="workflow-action-bar__eyebrow">Stage Transition</div>
              <div className="workflow-action-bar__title">{primaryActionLabel}</div>
              <div className="workflow-action-hero__meta">
                <span>{stage || "-"} to {nextStage}</span>
                <span>{statusSummary}</span>
              </div>
              <div className="workflow-action-bar__chips">
                <span className={`workflow-action-chip ${submitWithWarnings ? "warn" : gatePassed ? "good" : "warn"}`}>
                  {submitWithWarnings ? "Submit with warnings" : gatePassed ? "Gate passed" : "Gate blocked"}
                </span>
                <span className="workflow-action-chip">{ownershipLabel}</span>
                {openIssuesCount > 0 && <span className="workflow-action-chip warn">{openIssuesCount} open</span>}
                {submitWithWarnings && <span className="workflow-action-chip warn">{baWarningCount} unresolved</span>}
                {degraded && <span className="workflow-action-chip warn">Degraded quality</span>}
              </div>
            </div>
          </div>

          <div className="workflow-action-split-layout">
            <div className="workflow-action-split-left">
              <details className="workflow-action-section" open={openRequiredActions}>
                <summary className="workflow-action-section__summary">
                  <div>
                    <div className="workflow-action-section__title">Exit Check</div>
                    <div className="workflow-action-section__subtitle">Only the final blockers and quality signals for this transition.</div>
                  </div>
                  <span className={`panel-badge ${gatePassed ? "badge-teal" : "badge-amber"}`}>{gatePassed ? "Ready" : "Attention"}</span>
                </summary>
                <div className="workflow-action-section__body">
                  <div className="workflow-transition-brief">
                    <div className="workflow-transition-brief__item">
                      <span>Transition</span>
                      <strong>{stage || "-"} to {nextStage}</strong>
                    </div>
                    <div className="workflow-transition-brief__item">
                      <span>Owner</span>
                      <strong>{ownershipLabel}</strong>
                    </div>
                    <div className="workflow-transition-brief__item">
                      <span>Issues</span>
                      <strong>{openIssuesCount}</strong>
                    </div>
                  </div>
                  {gate?.message && <div className="project-message workflow-action-message">{gate.message}</div>}
                  {degradedReasons.length > 0 && <div className="project-message workflow-action-message">Degraded reasons: {degradedReasons.join(", ")}</div>}
                  {unresolvedGapRows.length > 0 && (
                    <div className="workflow-action-buttons workflow-action-buttons-compact workflow-support-actions">
                      <button
                        className="secondary-btn workflow-support-btn"
                        onClick={() => setShowWaiverModal(true)}
                        disabled={workflowBusy || !isPendingForMe}
                      >
                        Waive Remaining Gaps
                      </button>
                    </div>
                  )}
                  {waivedRefs.length > 0 && (
                    <div className="project-message workflow-action-message">Waived refs: {waivedRefs.join(", ")}</div>
                  )}
                </div>
              </details>

              <details className="workflow-action-section" open>
                <summary className="workflow-action-section__summary">
                  <div>
                    <div className="workflow-action-section__title">Deliverables</div>
                    <div className="workflow-action-section__subtitle">
                      Publish, download, or inspect the current handoff asset from here.
                    </div>
                  </div>
                </summary>
                <div className="workflow-action-section__body">
                  <div className="workflow-deliverable-highlight">
                    <span>Current handoff asset</span>
                    <strong>{compactDeliverableSummary}</strong>
                  </div>
                  {workflow?.functional_spec_artifact_id ? (
                    <div className="workflow-action-buttons workflow-action-buttons-compact workflow-support-actions">
                      <a
                        className="header-link-btn workflow-support-btn"
                        href={`${apiBase}/v1/workflows/${workflow.id}/functional-spec/download?format=json`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download JSON
                      </a>
                      <a
                        className="header-link-btn workflow-support-btn"
                        href={`${apiBase}/v1/workflows/${workflow.id}/functional-spec/download?format=csv`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Download CSV
                      </a>
                    </div>
                  ) : null}
                  {message && <div className="project-message workflow-action-message">{message}</div>}
                  {publishMessage && <div className="project-message workflow-action-message">{publishMessage}</div>}
                  <div className="workflow-action-buttons workflow-action-buttons-compact workflow-support-actions">
                    <button className="secondary-btn btn-with-icon workflow-support-btn" onClick={() => setShowArtifactsModal(true)}>
                      <ActionIcon name="artifacts" className="action-icon" />
                      View linked artifacts
                    </button>
                  </div>
                </div>
              </details>
            </div>

            <div className="workflow-action-split-right">
              <div className="workflow-action-right-panel">
                <button
                  className={`invoke-btn workflow-final-btn btn-with-icon ${submitDisabled ? "is-blocked" : ""}`}
                  onClick={handleOpenSubmitConfirm}
                  disabled={workflowBusy}
                  aria-disabled={submitDisabled}
                  title={submitDisabled ? nextActionHint : primaryActionLabel}
                >
                  <ActionIcon name="submit" className="action-icon" />
                  {primaryActionLabel}
                </button>
                <div className={`workflow-next-step ${submitDisabled ? "warn" : "ready"}`}>{nextActionHint}</div>
                {submitDisabled && isPendingForMe && (
                  <div className="workflow-submit-warning" role="alert">
                    <strong>Warning:</strong> {nextActionHint}
                  </div>
                )}

                <div className="workflow-action-group">
                  <div className="workflow-action-group__label">Prepare BA handoff artifact</div>
                  <div className="workflow-primary-actions workflow-primary-actions--ba">
                    <button className="secondary-btn workflow-save-btn" onClick={() => saveFunctionalSpec("json", false)} disabled={workflowBusy || !gapRunId}>
                      Save Spec JSON
                    </button>
                    <button className="secondary-btn workflow-save-btn" onClick={() => saveFunctionalSpec("csv", false)} disabled={workflowBusy || !gapRunId}>
                      Save Spec CSV
                    </button>
                    <button
                      className="secondary-btn workflow-save-btn workflow-save-btn--wide"
                      onClick={() => publishToGitHub("functional_spec")}
                      disabled={workflowBusy || !workflow?.functional_spec_artifact_id || publishBusy !== ""}
                    >
                      {publishBusy === "functional_spec" ? "Publishing..." : "Publish Spec"}
                    </button>
                  </div>
                </div>

                <div className="workflow-action-buttons workflow-action-buttons-compact workflow-support-actions">
                  <button className="secondary-btn btn-with-icon workflow-support-btn" onClick={() => setShowArtifactsModal(true)}>
                    <ActionIcon name="artifacts" className="action-icon" />
                    Artifacts
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="workflow-action-hero">
            <div className="workflow-action-hero__summary">
              <div className="workflow-action-bar__eyebrow">Stage Transition</div>
              <div className="workflow-action-bar__title">{primaryActionLabel}</div>
              <div className="workflow-action-hero__meta">
                <span>{stage || "-"} to {nextStage}</span>
                <span>{statusSummary}</span>
              </div>
              <div className="workflow-action-bar__chips">
                <span className={`workflow-action-chip ${submitWithWarnings ? "warn" : gatePassed ? "good" : "warn"}`}>
                  {submitWithWarnings ? "Submit with warnings" : gatePassed ? "Gate passed" : "Gate blocked"}
                </span>
                <span className="workflow-action-chip">{ownershipLabel}</span>
                {openIssuesCount > 0 && <span className="workflow-action-chip warn">{openIssuesCount} open</span>}
                {submitWithWarnings && <span className="workflow-action-chip warn">{baWarningCount} unresolved</span>}
                {degraded && <span className="workflow-action-chip warn">Degraded quality</span>}
              </div>
            </div>
            <div className="workflow-action-hero__actions">
              <button
                className={`invoke-btn workflow-final-btn btn-with-icon ${submitDisabled ? "is-blocked" : ""}`}
                onClick={handleOpenSubmitConfirm}
                disabled={workflowBusy}
                aria-disabled={submitDisabled}
                title={submitDisabled ? nextActionHint : primaryActionLabel}
              >
                <ActionIcon name="submit" className="action-icon" />
                {primaryActionLabel}
              </button>
              <div className={`workflow-next-step ${submitDisabled ? "warn" : "ready"}`}>{nextActionHint}</div>
              {submitDisabled && isPendingForMe && (
                <div className="workflow-submit-warning" role="alert">
                  <strong>Warning:</strong> {nextActionHint}
                </div>
              )}
              {activeAgentTab === "dev" && (
                <div className="workflow-action-group">
                  <div className="workflow-action-group__label">Publish DEV deliverables</div>
                  <div className="workflow-primary-actions">
                    <button
                      className="secondary-btn workflow-save-btn"
                      onClick={() => publishToGitHub("generated_sql")}
                      disabled={workflowBusy || !workflow?.latest_sql_run_id || publishBusy !== ""}
                    >
                      {publishBusy === "generated_sql" ? "Publishing SQL..." : "Publish SQL"}
                    </button>
                    <button
                      className="secondary-btn workflow-save-btn"
                      onClick={() => publishToGitHub("report_xml")}
                      disabled={workflowBusy || !workflow?.latest_report_xml_artifact_id || publishBusy !== ""}
                    >
                      {publishBusy === "report_xml" ? "Publishing XML..." : "Publish XML"}
                    </button>
                  </div>
                </div>
              )}
              {activeAgentTab === "rev" && (
                <div className="workflow-action-group">
                  <div className="workflow-action-group__label">Publish reviewer output</div>
                  <div className="workflow-primary-actions">
                    <button
                      className="secondary-btn workflow-save-btn workflow-save-btn--wide"
                      onClick={() => publishToGitHub("report_xml")}
                      disabled={workflowBusy || !workflow?.latest_report_xml_artifact_id || !gatePassed || publishBusy !== ""}
                      title={!gatePassed ? "XML can be published only when the review gate passes." : "Publish validated XML"}
                    >
                      {publishBusy === "report_xml" ? "Publishing XML..." : "Publish XML"}
                    </button>
                  </div>
                </div>
              )}
              <div className="workflow-action-buttons workflow-action-buttons-compact workflow-support-actions">
                <button
                  className="secondary-btn workflow-support-btn"
                  onClick={() => setShowSendBackModal(true)}
                  disabled={workflowBusy || !["DEV", "REVIEWER"].includes(String(workflow?.current_stage || ""))}
                >
                  Send Back
                </button>
                <button className="secondary-btn btn-with-icon workflow-support-btn" onClick={() => setShowArtifactsModal(true)}>
                  <ActionIcon name="artifacts" className="action-icon" />
                  Artifacts
                </button>
              </div>
            </div>
          </div>

          <div className="workflow-action-sections">
            <details className="workflow-action-section" open={openRequiredActions}>
              <summary className="workflow-action-section__summary">
                <div>
                  <div className="workflow-action-section__title">Exit Check</div>
                  <div className="workflow-action-section__subtitle">Only the final blockers and quality signals for this transition.</div>
                </div>
                <span className={`panel-badge ${gatePassed ? "badge-teal" : "badge-amber"}`}>{gatePassed ? "Ready" : "Attention"}</span>
              </summary>
              <div className="workflow-action-section__body">
                <div className="workflow-transition-brief">
                  <div className="workflow-transition-brief__item">
                    <span>Transition</span>
                    <strong>{stage || "-"} to {nextStage}</strong>
                  </div>
                  <div className="workflow-transition-brief__item">
                    <span>Owner</span>
                    <strong>{ownershipLabel}</strong>
                  </div>
                  <div className="workflow-transition-brief__item">
                    <span>Issues</span>
                    <strong>{openIssuesCount}</strong>
                  </div>
                </div>
                {gate?.message && <div className="project-message workflow-action-message">{gate.message}</div>}
                {degradedReasons.length > 0 && <div className="project-message workflow-action-message">Degraded reasons: {degradedReasons.join(", ")}</div>}
              </div>
            </details>

            <details className="workflow-action-section" open>
              <summary className="workflow-action-section__summary">
                <div>
                  <div className="workflow-action-section__title">Deliverables</div>
                  <div className="workflow-action-section__subtitle">
                    Publish, download, or inspect the current handoff asset from here.
                  </div>
                </div>
              </summary>
              <div className="workflow-action-section__body">
                <div className="workflow-deliverable-highlight">
                  <span>Current handoff asset</span>
                  <strong>{compactDeliverableSummary}</strong>
                </div>
                {message && <div className="project-message workflow-action-message">{message}</div>}
                {publishMessage && <div className="project-message workflow-action-message">{publishMessage}</div>}
                <div className="workflow-action-buttons workflow-action-buttons-compact workflow-support-actions">
                  <button className="secondary-btn btn-with-icon workflow-support-btn" onClick={() => setShowArtifactsModal(true)}>
                    <ActionIcon name="artifacts" className="action-icon" />
                    View linked artifacts
                  </button>
                </div>
              </div>
            </details>
          </div>
        </>
      )}

      {showSubmitConfirm && (
        <div className="modal-overlay">
          <div className="panel modal-panel submit-modal-panel workflow-action-modal">
            <div className="submit-confirm-title">Submit Workflow Transition</div>
            <div className="submit-confirm-text">
              This will move workflow <strong>{workflow?.name || "-"}</strong> from <strong>{stage || "-"}</strong> to <strong>{nextStage}</strong>.
            </div>
            {stage === "DEV" && (
              <>
                <FileUploadZone
                  label="Upload Submission XML"
                  description="Generated submission instance"
                  accept=".xml"
                  onFileSelect={setSubmitXmlFile}
                  currentFile={submitXmlFile}
                  onClear={() => setSubmitXmlFile(null)}
                  disabled={workflowBusy}
                />
                <div className="workflow-action-buttons">
                  <button
                    className="secondary-btn"
                    onClick={async () => {
                      await uploadArtifact("report_xml", submitXmlFile, (id: number) => setReportXmlArtifactId(id));
                      setSubmitXmlFile(null);
                    }}
                    disabled={workflowBusy || !submitXmlFile}
                  >
                    Upload XML Artifact
                  </button>
                </div>
                <div className="field">
                  <label>Submission XML Artifact</label>
                  <select value={String(reportXmlArtifactId)} onChange={(e) => setReportXmlArtifactId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">Select submission XML</option>
                    {reportXmlOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {artifactOptionLabel(a)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="project-message">For DEV stage, selected XML will be linked to workflow before submit.</div>
              </>
            )}
            <textarea
              value={workflowComment}
              onChange={(e) => setWorkflowComment(e.target.value)}
              placeholder="Submission comment (optional)"
            />
            <div className="submit-confirm-text">Gate status: {gatePassed ? "Passed" : "Blocked"}.</div>
            <div className="workflow-action-buttons">
              <button className="secondary-btn" onClick={() => setShowSubmitConfirm(false)} disabled={workflowBusy}>
                Cancel
              </button>
              <button
                className="invoke-btn btn-with-icon"
                onClick={async () => {
                  if (stage === "DEV" && reportXmlArtifactId) {
                    await linkReportXml();
                  }
                  const result = await submitCurrentStage();
                  if (result) {
                    setSubmitResult({
                      workflowName: workflow?.name || "-",
                      fromStage: stage || "-",
                      toStage: String(result?.current_stage || nextStage || "-"),
                      status: String(result?.status || ""),
                      submittedAt: new Date().toLocaleString("en-GB")
                    });
                  }
                  setShowSubmitConfirm(false);
                }}
                disabled={confirmSubmitDisabled}
              >
                <ActionIcon name="submit" className="action-icon" />
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}
      {submitResult && (
        <div className="modal-overlay">
          <div className="panel modal-panel submit-modal-panel workflow-action-modal">
            <div className="submit-confirm-title">Stage Submitted Successfully</div>
            <div className="workflow-readiness-meta">
              <span>Workflow: {submitResult.workflowName}</span>
              <span>From: {submitResult.fromStage}</span>
              <span>To: {submitResult.toStage}</span>
              <span>Status: {submitResult.status || "in_progress"}</span>
              <span>Timestamp: {submitResult.submittedAt}</span>
            </div>
            <div className="workflow-action-buttons">
              <button
                className="invoke-btn btn-with-icon"
                onClick={() => {
                  setSubmitResult(null);
                  returnToHome();
                }}
              >
                <ActionIcon name="back" className="action-icon" />
                Return to Workflow Home
              </button>
            </div>
          </div>
        </div>
      )}
      {showSendBackModal && (
        <div className="modal-overlay">
          <div className="panel modal-panel submit-modal-panel workflow-action-modal">
            <div className="submit-confirm-title">Send Back Workflow</div>
            <select value={sendBackReasonCode} onChange={(e) => setSendBackReasonCode(e.target.value)}>
              <option value="">Select send-back reason</option>
              {SEND_BACK_REASON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <textarea
              value={sendBackReasonDetail}
              onChange={(e) => setSendBackReasonDetail(e.target.value)}
              placeholder="Reason detail (minimum 10 characters)"
              rows={4}
            />
            <div className="project-message">
              Characters entered: {sendBackReasonDetail.trim().length} / 10 minimum
            </div>
            <textarea
              value={workflowComment}
              onChange={(e) => setWorkflowComment(e.target.value)}
              placeholder="Send back comment (optional)"
            />
            <div className="workflow-action-buttons">
              <button className="secondary-btn" onClick={() => setShowSendBackModal(false)} disabled={workflowBusy}>
                Cancel
              </button>
              <button
                className="header-btn"
                onClick={async () => {
                  await sendBackStage();
                  setShowSendBackModal(false);
                }}
                disabled={workflowBusy || !sendBackValid}
                title={
                  !sendBackReasonCode.trim()
                    ? "Please select a reason code"
                    : sendBackReasonDetail.trim().length < 10
                      ? `Reason detail too short (${sendBackReasonDetail.trim().length}/10 characters)`
                      : "Send back workflow to previous stage"
                }
              >
                Confirm Send Back
              </button>
            </div>
          </div>
        </div>
      )}
      {showArtifactsModal && (
        <div className="modal-overlay">
          <div className="panel modal-panel submit-modal-panel workflow-action-modal">
            <div className="submit-confirm-title">Workflow Artifacts</div>
            <div className="submit-confirm-text">These are the assets currently linked to this workflow.</div>
            <div className="workflow-artifact-list workflow-artifact-list-modal">
              {linkedArtifacts.map((artifact) => (
                <div className="workflow-artifact-item" key={`modal-${artifact.label}`}>
                  <span className="workflow-artifact-item__label">{artifact.label}</span>
                  <span className="workflow-artifact-item__value">{artifact.value}</span>
                </div>
              ))}
            </div>
            <div className="workflow-action-buttons">
              {fcaArtifactId ? (
                <a className="header-link-btn" href={`${apiBase}/v1/artifacts/${fcaArtifactId}/download`} target="_blank" rel="noopener noreferrer">
                  Download PSD
                </a>
              ) : null}
              {workflow?.functional_spec_artifact_id ? (
                <>
                  <a className="header-link-btn" href={`${apiBase}/v1/workflows/${workflow.id}/functional-spec/download?format=json`} target="_blank" rel="noopener noreferrer">
                    Download Mapping JSON
                  </a>
                  <a className="header-link-btn" href={`${apiBase}/v1/workflows/${workflow.id}/functional-spec/download?format=csv`} target="_blank" rel="noopener noreferrer">
                    Download Mapping CSV
                  </a>
                </>
              ) : null}
              {workflow?.latest_report_xml_artifact_id ? (
                <a className="header-link-btn" href={`${apiBase}/v1/artifacts/${workflow.latest_report_xml_artifact_id}/download`} target="_blank" rel="noopener noreferrer">
                  Download Submission XML
                </a>
              ) : null}
            </div>
            <div className="workflow-action-buttons">
              <button className="secondary-btn" onClick={() => setShowArtifactsModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showWaiverModal && (
        <div className="modal-overlay">
          <div className="panel modal-panel submit-modal-panel workflow-action-modal">
            <div className="submit-confirm-title">Waive Remaining BA Gaps</div>
            <div className="submit-confirm-text">
              Apply workflow-scoped waivers for the unresolved fields below so the BA handoff remains explicit and traceable.
            </div>
            <div className="workflow-artifact-list workflow-artifact-list-modal">
              {unresolvedGapRows.map((row) => (
                <div className="workflow-artifact-item" key={`waive-${row.ref}`}>
                  <span className="workflow-artifact-item__label">{row.ref}</span>
                  <span className="workflow-artifact-item__value">{row.field}</span>
                </div>
              ))}
            </div>
            <div className="workflow-action-buttons">
              <button className="secondary-btn" onClick={() => setShowWaiverModal(false)} disabled={workflowBusy}>
                Cancel
              </button>
              <button
                className="invoke-btn"
                onClick={async () => {
                  const refs = unresolvedGapRows.map((row) => row.ref).filter(Boolean);
                  const fields = unresolvedGapRows.map((row) => row.field).filter(Boolean);
                  await updateBaGapWaivers?.(
                    {
                      refs,
                      fields,
                      allow_degraded_quality: Boolean(workflow?.ba_gap_waivers_json?.allow_degraded_quality),
                    },
                    `Waived unresolved BA gaps: ${refs.join(", ")}`
                  );
                  setShowWaiverModal(false);
                }}
                disabled={workflowBusy || unresolvedGapRows.length === 0}
              >
                Confirm Waiver
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
