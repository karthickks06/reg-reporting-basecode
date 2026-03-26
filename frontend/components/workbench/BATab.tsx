import { useRef, useState } from "react";
import { FileUploadZone } from "../FileUploadZone";
import { StatusBadge } from "../StatusBadge";
import { artifactOptionLabel } from "./artifactLabels";
import type { Artifact, BAAnalysisMode, GapDiagnostics, GapRow, UploadArtifactFn } from "./types";

type BATabProps = {
  busy: boolean;
  isBackgroundJobRunning?: boolean;
  activeBackgroundJob?: {
    jobType: "gap_analysis" | "gap_remediation";
    status: "pending" | "running";
    progressMessage?: string | null;
    progressPct?: number;
  } | null;
  baReady: boolean;
  gapRunId: number | null;
  hasFunctionalSpec: boolean;
  baMode: BAAnalysisMode;
  baUserContext: string;
  gapRows: GapRow[];
  gapDiagnostics: GapDiagnostics | null;
  remediationStatuses: string[];
  remediationArtifactIds: number[];
  remediationUserContext: string;
  fcaArtifactId: number | "";
  modelArtifactId: number | "";
  compareBaselineId: number | "";
  compareChangedId: number | "";
  compareBusy: boolean;
  fcaOptions: Artifact[];
  modelOptions: Artifact[];
  baFcaFile: File | null;
  pendingForMe: boolean;
  setBaMode: (mode: BAAnalysisMode) => void;
  setBaUserContext: (value: string) => void;
  setRemediationStatuses: (value: string[]) => void;
  setRemediationArtifactIds: (value: number[]) => void;
  setRemediationUserContext: (value: string) => void;
  setFcaArtifactId: (value: number | "") => void;
  setModelArtifactId: (value: number | "") => void;
  setCompareBaselineId: (value: number | "") => void;
  setCompareChangedId: (value: number | "") => void;
  setBaFcaFile: (file: File | null) => void;
  runGap: () => Promise<void>;
  runGapRemediation: () => Promise<void>;
  runCompare: () => Promise<void>;
  uploadArtifact: UploadArtifactFn;
  supplementalArtifactOptions: Artifact[];
  addToast?: (kind: "success" | "error", text: string) => void;
};

export function BATab({
  busy,
  isBackgroundJobRunning = false,
  activeBackgroundJob = null,
  baReady,
  gapRunId,
  hasFunctionalSpec,
  baMode,
  baUserContext,
  gapRows,
  gapDiagnostics,
  remediationStatuses,
  remediationArtifactIds,
  remediationUserContext,
  fcaArtifactId,
  modelArtifactId,
  compareBaselineId,
  compareChangedId,
  compareBusy,
  fcaOptions,
  modelOptions,
  baFcaFile,
  pendingForMe,
  setBaMode,
  setBaUserContext,
  setRemediationStatuses,
  setRemediationArtifactIds,
  setRemediationUserContext,
  setFcaArtifactId,
  setModelArtifactId,
  setCompareBaselineId,
  setCompareChangedId,
  setBaFcaFile,
  runGap,
  runGapRemediation,
  runCompare,
  uploadArtifact,
  supplementalArtifactOptions,
  addToast
}: BATabProps) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRemediationModal, setShowRemediationModal] = useState(false);
  const lastLockToastAtRef = useRef(0);
  const compareReady = Boolean(compareBaselineId && compareChangedId);
  const unresolvedRows = gapRows.filter((r) => {
    const s = String(r.status || "").toLowerCase();
    return s.includes("missing") || s.includes("partial");
  });
  const isReadOnly = !pendingForMe;
  const remediationReady = Boolean(hasFunctionalSpec && gapRunId && unresolvedRows.length > 0);
  const degraded = Boolean(gapDiagnostics?.degraded_quality);
  const activeJobLabel = activeBackgroundJob?.jobType === "gap_remediation" ? "Gap remediation" : "Gap analysis";
  const activeJobDetail = activeBackgroundJob?.progressMessage?.trim() || (activeBackgroundJob?.status === "pending" ? "Queued and waiting to start." : "Processing in the background.");
  const toggleStatus = (status: string, checked: boolean) => {
    const next = new Set(remediationStatuses);
    if (checked) next.add(status);
    else next.delete(status);
    setRemediationStatuses(Array.from(next));
  };
  const toggleArtifact = (artifactId: number, checked: boolean) => {
    const next = new Set(remediationArtifactIds);
    if (checked) next.add(artifactId);
    else next.delete(artifactId);
    setRemediationArtifactIds(Array.from(next));
  };
  const formBusy = busy || isReadOnly;
  const actionBusy = busy || isReadOnly;
  const statusBusy = busy || isBackgroundJobRunning;
  const showRunningLock = isBackgroundJobRunning && !isReadOnly;
  const workspaceStatus = isBackgroundJobRunning ? "running" : gapRunId ? "done" : baReady ? "ready" : "idle";
  const workspaceStatusLabel = isBackgroundJobRunning
    ? "Analysis running"
    : gapRunId
    ? "Mapping ready"
    : baReady
    ? "Ready to run"
    : "Select required inputs";

  const notifyLockedInteraction = () => {
    if (!showRunningLock) return;
    const now = Date.now();
    if (now - lastLockToastAtRef.current < 1800) return;
    lastLockToastAtRef.current = now;
    addToast?.("error", `${activeJobLabel} is ${activeBackgroundJob?.status === "pending" ? "queued" : "running"} for this workflow. ${activeJobDetail}`);
  };
  return (
    <section className="panel agent-panel-full work-stage-panel">
      <div className="agent-head">
        <div className="agent-head__copy">
          <div className="agent-head__eyebrow">Workspace</div>
          <h2>Business Analyst Workspace</h2>
          <p className="agent-head__subtitle">Prepare inputs, set guidance, and launch mapping from one place.</p>
        </div>
        <StatusBadge className="agent-head__status" status={workspaceStatus} size="lg">
          {workspaceStatusLabel}
        </StatusBadge>
      </div>
      {isReadOnly && <p className="stage-note">This workflow is assigned to another stage owner. BA inputs are read-only.</p>}
      {showRunningLock && (
        <div className="job-inline-alert warn">
          <span className="job-inline-alert__icon">!</span>
          <div>
            <strong>{activeJobLabel} is {activeBackgroundJob?.status === "pending" ? "queued" : "running"}</strong>
            <p className="error-details">
              {activeJobDetail} Selections are temporarily locked for this workflow and will unlock automatically when the job completes.
            </p>
          </div>
        </div>
      )}
      <div className={`stage-lock-shell ${showRunningLock ? "locked" : ""}`}>
        <div className="stage-topbar">
          <div className="stage-quick-stats">
            <span className="panel-badge badge-slate">Mode: {baMode === "psd_model" ? "PSD vs Model" : "PSD vs PSD"}</span>
            <span className="panel-badge badge-slate">Gap Run: {gapRunId || "-"}</span>
            <span className={`panel-badge ${unresolvedRows.length > 0 ? "badge-amber" : "badge-teal"}`}>Unresolved: {unresolvedRows.length}</span>
          </div>
          <div className="mode-switch">
            <button className={`mode-btn ${baMode === "psd_model" ? "active" : ""}`} onClick={() => setBaMode("psd_model")} disabled={formBusy}>
              PSD vs Data Model
            </button>
            <button className={`mode-btn ${baMode === "psd_psd" ? "active" : ""}`} onClick={() => setBaMode("psd_psd")} disabled={formBusy}>
              Compare PSD Versions
            </button>
          </div>
        </div>

        {baMode === "psd_model" ? (
          <>
            <div className="stage-step">
              <div className="step-title">Step 1 - Required Inputs</div>
              <div className="form-grid form-grid-two">
                <div className="field">
                  <label>1. PSD Document</label>
                  <select value={String(fcaArtifactId)} onChange={(e) => setFcaArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={formBusy}>
                    <option value="">Select PSD document</option>
                    {fcaOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {artifactOptionLabel(a)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>2. Logical Data Model</label>
                  <select value={String(modelArtifactId)} onChange={(e) => setModelArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={formBusy}>
                    <option value="">Select data model</option>
                    {modelOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {artifactOptionLabel(a)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="stage-actions-row">
                <button className="secondary-btn" onClick={() => setShowUploadModal(true)} disabled={formBusy}>
                  Upload PSD Document
                </button>
              </div>
              <p className="stage-note">Data models are managed in Admin Console.</p>
            </div>

            <div className="stage-step">
              <div className="step-title">Step 2 - Guidance (Optional)</div>
              <div className="form-grid form-grid-two">
                <div className="field">
                  <label>LLM Model</label>
                  <div className="stat">GPT-4.1 (Azure OpenAI)</div>
                </div>
                <div className="field context-field">
                  <label>Analyst guidance</label>
                  <textarea
                    value={baUserContext}
                    onChange={(e) => setBaUserContext(e.target.value)}
                    placeholder="Example: prioritize canonical ledger attributes and highlight unmapped mandatory fields."
                    disabled={formBusy}
                  />
                </div>
              </div>
            </div>

            <div className="stage-step">
              <div className="step-title">Step 3 - Run Requirement-to-Data Mapping</div>
              <div className="stage-actions-row">
                <button className="invoke-btn" onClick={runGap} disabled={actionBusy || !baReady}>
                  Run Requirement-to-Data Mapping
                </button>
                {hasFunctionalSpec && (
                  <button className="remediation-cta-btn btn-with-icon" onClick={() => setShowRemediationModal(true)} disabled={actionBusy || !gapRunId}>
                    Open Remediation Studio
                  </button>
                )}
              </div>
              {!hasFunctionalSpec ? (
                <p className="stage-note">Save the functional specification first to unlock remediation.</p>
              ) : !remediationReady ? (
                <p className="stage-note">Run mapping first to enable remediation.</p>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="stage-step">
              <div className="step-title">Step 1 - Select PSD Versions</div>
              <div className="form-grid form-grid-two">
                <div className="field">
                  <label>1. Baseline PSD</label>
                  <select value={String(compareBaselineId)} onChange={(e) => setCompareBaselineId(e.target.value ? Number(e.target.value) : "")} disabled={formBusy}>
                    <option value="">Select baseline PSD</option>
                    {fcaOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {artifactOptionLabel(a)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>2. New PSD Version</label>
                  <select value={String(compareChangedId)} onChange={(e) => setCompareChangedId(e.target.value ? Number(e.target.value) : "")} disabled={formBusy}>
                    <option value="">Select updated PSD</option>
                    {fcaOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {artifactOptionLabel(a)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="stage-step">
              <div className="step-title">Step 2 - Compare For Reuse</div>
              <div className="stage-actions-row">
                <button className="invoke-btn" onClick={runCompare} disabled={actionBusy || compareBusy || !compareReady}>
                  Compare PSD Versions
                </button>
              </div>
              <p className="stage-note">Use compare insights to prepare the next mapping revision.</p>
            </div>
          </>
        )}
        {showRunningLock ? (
          <div
            className="stage-lock-overlay"
            role="button"
            tabIndex={0}
            aria-label="BA controls are locked while analysis runs"
            onClick={notifyLockedInteraction}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                notifyLockedInteraction();
              }
            }}
          />
        ) : null}
      </div>

      {showUploadModal && (
        <div className="modal-overlay">
          <div className="panel modal-panel submit-modal-panel stage-modal">
            <div className="submit-confirm-title">Upload PSD Document</div>
            <div className="upload-pair-grid">
              <div className="upload-pair">
                <FileUploadZone
                  label="Upload PSD"
                  description="Regulatory source document"
                  accept=".pdf,.docx,.txt"
                  onFileSelect={setBaFcaFile}
                  currentFile={baFcaFile}
                  onClear={() => setBaFcaFile(null)}
                  disabled={formBusy}
                />
              </div>
            </div>
            <div className="workflow-action-buttons">
              <button className="secondary-btn" onClick={() => setShowUploadModal(false)} disabled={statusBusy}>
                Cancel
              </button>
              <button
                className="invoke-btn"
                onClick={async () => {
                  await uploadArtifact("fca", baFcaFile, setFcaArtifactId);
                  setBaFcaFile(null);
                  setShowUploadModal(false);
                }}
                disabled={formBusy || !baFcaFile}
              >
                Upload And Use
              </button>
            </div>
          </div>
        </div>
      )}

      {showRemediationModal && (
        <div className="modal-overlay">
          <div className="panel modal-panel submit-modal-panel stage-modal">
            <div className="submit-confirm-title">Remediation Studio</div>
            <div className="remediation-headline">
              <span>Latest Run: {gapRunId || "-"}</span>
              <span>Unresolved Rows: {unresolvedRows.length}</span>
              <span className={degraded ? "badge-amber panel-badge" : "badge-slate panel-badge"}>
                {degraded ? "Degraded LLM quality" : "Stable quality"}
              </span>
            </div>
            <div className="remediation-grid">
              <div className="field remediation-card">
                <label>Target statuses</label>
                <p className="remediation-card__hint">Choose which unresolved rows should be reconsidered in this pass.</p>
                <div className="remediation-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={remediationStatuses.includes("Missing")}
                      onChange={(e) => toggleStatus("Missing", e.target.checked)}
                      disabled={formBusy}
                    />
                    Missing
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={remediationStatuses.includes("Partial Match")}
                      onChange={(e) => toggleStatus("Partial Match", e.target.checked)}
                      disabled={formBusy}
                    />
                    Partial Match
                  </label>
                </div>
              </div>
              <div className="field remediation-card">
                <label>Supplemental artifacts (optional)</label>
                <p className="remediation-card__hint">Add supporting documents if the primary PSD and data model need extra context.</p>
                <div className="remediation-artifact-list">
                  {supplementalArtifactOptions.map((a) => (
                    <label key={a.id}>
                      <input
                        type="checkbox"
                        checked={remediationArtifactIds.includes(a.id)}
                        onChange={(e) => toggleArtifact(a.id, e.target.checked)}
                        disabled={formBusy}
                      />
                      {artifactOptionLabel(a)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field context-field remediation-card remediation-card--wide">
                <label>Remediation guidance</label>
                <p className="remediation-card__hint">Give the agent a precise instruction about how to resolve the selected rows.</p>
                <textarea
                  value={remediationUserContext}
                  onChange={(e) => setRemediationUserContext(e.target.value)}
                  placeholder="Example: use uploaded pricing annex for fee fields; keep canonical table.column naming."
                  disabled={formBusy}
                />
              </div>
            </div>
            <div className="run-row">
              <button
                className="invoke-btn"
                onClick={async () => {
                  await runGapRemediation();
                  setShowRemediationModal(false);
                }}
                disabled={actionBusy || !remediationReady}
              >
                Run Targeted Remediation
              </button>
            </div>
            <div className="workflow-action-buttons">
              <button className="secondary-btn" onClick={() => setShowRemediationModal(false)} disabled={statusBusy}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
