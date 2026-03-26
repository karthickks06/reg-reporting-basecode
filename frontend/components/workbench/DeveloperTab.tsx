import { useRef } from "react";

import { FileUploadZone } from "../FileUploadZone";
import { StatusBadge } from "../StatusBadge";
import { artifactOptionLabel } from "./artifactLabels";
import type { Artifact } from "./types";

type DeveloperTabProps = {
  busy: boolean;
  isBackgroundJobRunning?: boolean;
  activeBackgroundJob?: {
    jobType: "sql_generation" | "xml_generation";
    status: "pending" | "running";
    progressMessage?: string | null;
    progressPct?: number;
  } | null;
  devReady: boolean;
  devXmlReady: boolean;
  gapRunId: number | null;
  sqlRunId: number | null;
  xmlRunId?: number | null;
  devUserContext: string;
  modelArtifactId: number | "";
  dataArtifactId: number | "";
  xsdArtifactId: number | "";
  fcaArtifactId: number | "";
  fcaArtifactName?: string;
  modelArtifactName?: string;
  dataArtifactName?: string;
  xsdArtifactName?: string;
  functionalSpecName?: string;
  reportXmlArtifactName?: string;
  modelOptions: Artifact[];
  dataOptions: Artifact[];
  xsdOptions: Artifact[];
  devDataFile: File | null;
  readOnly?: boolean;
  setDevUserContext: (value: string) => void;
  setModelArtifactId: (value: number | "") => void;
  setDataArtifactId: (value: number | "") => void;
  setXsdArtifactId: (value: number | "") => void;
  setDevDataFile: (file: File | null) => void;
  runSql: () => Promise<void>;
  runXmlGeneration: () => Promise<void>;
  uploadArtifact: (kind: "data", file: File | null, onSelect?: (id: number) => void) => Promise<void>;
  addToast?: (kind: "success" | "error", text: string) => void;
};

export function DeveloperTab({
  busy,
  isBackgroundJobRunning = false,
  activeBackgroundJob = null,
  devReady,
  devXmlReady,
  gapRunId,
  sqlRunId,
  xmlRunId = null,
  devUserContext,
  modelArtifactId,
  dataArtifactId,
  xsdArtifactId,
  fcaArtifactId,
  fcaArtifactName,
  modelArtifactName,
  dataArtifactName,
  xsdArtifactName,
  functionalSpecName,
  reportXmlArtifactName,
  modelOptions,
  dataOptions,
  xsdOptions,
  devDataFile,
  readOnly = false,
  setDevUserContext,
  setModelArtifactId,
  setDataArtifactId,
  setXsdArtifactId,
  setDevDataFile,
  runSql
  ,
  runXmlGeneration,
  uploadArtifact,
  addToast
}: DeveloperTabProps) {
  const lastLockToastAtRef = useRef(0);
  const step1Complete = Boolean(functionalSpecName && modelArtifactId);
  const step2Complete = Boolean(sqlRunId);
  const showStep2 = step1Complete;
  const showStep3 = step2Complete;
  const formBusy = busy || isBackgroundJobRunning || readOnly;
  const xmlReady = Boolean(devXmlReady && reportXmlArtifactName);
  const showRunningLock = isBackgroundJobRunning && !readOnly;
  const activeJobLabel = activeBackgroundJob?.jobType === "xml_generation" ? "XML generation" : "SQL generation";
  const activeJobDetail =
    activeBackgroundJob?.progressMessage?.trim() ||
    (activeBackgroundJob?.status === "pending" ? "Queued and waiting to start." : "Processing in the background.");
  const workspaceStatus = isBackgroundJobRunning ? "running" : xmlReady ? "done" : sqlRunId ? "ready" : devReady ? "ready" : "idle";
  const workspaceStatusLabel = isBackgroundJobRunning
    ? `${activeJobLabel} ${activeBackgroundJob?.status === "pending" ? "queued" : "running"}`
    : xmlReady
    ? "XML package ready"
    : sqlRunId
    ? "SQL extraction ready"
    : devReady
    ? "Ready for SQL generation"
    : "Awaiting approved specification";

  const notifyLockedInteraction = () => {
    if (!showRunningLock) return;
    const now = Date.now();
    if (now - lastLockToastAtRef.current < 1800) return;
    lastLockToastAtRef.current = now;
    addToast?.(
      "error",
      `${activeJobLabel} is ${activeBackgroundJob?.status === "pending" ? "queued" : "running"} for this workflow. ${activeJobDetail}`
    );
  };

  return (
    <section className="panel agent-panel-full work-stage-panel">
      <section className="stage-persona-hero stage-persona-hero--dev">
        <div className="stage-persona-hero__copy">
          <div className="workflow-panel-eyebrow">Developer Stage</div>
          <h3>Build the reviewer-ready delivery package</h3>
          <p>Use the approved mapping, generate SQL, then prepare the submission XML package for reviewer handoff.</p>
        </div>
        <div className="stage-persona-hero__status">
          <StatusBadge status={workspaceStatus}>
            {workspaceStatusLabel}
          </StatusBadge>
        </div>
        <div className="stage-persona-hero__signals">
          <div className="stage-persona-signal">
            <span>Spec</span>
            <strong>{functionalSpecName ? "Approved" : "Pending"}</strong>
          </div>
          <div className="stage-persona-signal">
            <span>Source Data</span>
            <strong>{xmlReady ? "Used in XML" : dataArtifactName ? "Selected" : "Needed"}</strong>
          </div>
          <div className="stage-persona-signal">
            <span>Progress</span>
            <strong>{xmlReady ? "Reviewer handoff ready" : showStep3 ? "Step 3 unlocked" : showStep2 ? "Step 2 active" : "Step 1 active"}</strong>
          </div>
        </div>
      </section>
      {readOnly && <p className="stage-note">This workflow is no longer assigned to DEV. Developer actions are locked.</p>}
      {showRunningLock && (
        <div className="job-inline-alert warn">
          <span className="job-inline-alert__icon">!</span>
          <div>
            <strong>{activeJobLabel} is {activeBackgroundJob?.status === "pending" ? "queued" : "running"}</strong>
            <p className="error-details">
              {activeJobDetail} Inputs and actions are temporarily locked for this workflow and will unlock automatically when the job completes.
            </p>
          </div>
        </div>
      )}
      {xmlReady && (
        <div className="job-inline-alert success">
          <span className="job-inline-alert__icon">OK</span>
          <div>
            <strong>Submission XML generated and linked</strong>
            <p className="error-details">
              {reportXmlArtifactName}
              {xmlRunId ? ` | XML run ${xmlRunId}` : ""}. The reviewer handoff package is ready for submission.
            </p>
          </div>
        </div>
      )}

      <div className={`stage-lock-shell ${showRunningLock ? "locked" : ""}`} onClickCapture={notifyLockedInteraction}>
      <div className="stage-step">
        <div className="step-title">Step 1 - Approved Inputs</div>
        <div className="form-grid form-grid-two">
          <div className="field">
            <label>Approved Mapping Specification</label>
            <div className="stat">{functionalSpecName || "Not yet saved by BA"}</div>
            <p className="stage-note">Gap analysis run: {gapRunId ? `Run ${gapRunId}` : "Not available"}</p>
          </div>
          <div className="field">
            <label>Data Model</label>
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
        <div className="workflow-transition-brief">
          <div className="workflow-transition-brief__item">
            <span>Gap run</span>
            <strong>{gapRunId ? `Run ${gapRunId}` : "-"}</strong>
          </div>
          <div className="workflow-transition-brief__item">
            <span>PSD</span>
            <strong>{fcaArtifactName || "Missing"}</strong>
          </div>
          <div className="workflow-transition-brief__item">
            <span>Model</span>
            <strong>{modelArtifactName || "Missing"}</strong>
          </div>
        </div>
      </div>

      {showStep2 ? (
        <div className="stage-step">
          <div className="step-title">Step 2 - Generate SQL</div>
          <div className="form-grid form-grid-two">
            <div className="field">
              <label>LLM Model</label>
              <div className="stat">GPT-4.1 (Azure OpenAI)</div>
            </div>
            <div className="field context-field">
              <label>Developer guidance</label>
              <textarea
                value={devUserContext}
                onChange={(e) => setDevUserContext(e.target.value)}
                placeholder="Example: use reusable CTEs and align aliases with regulatory target fields."
                disabled={formBusy}
              />
            </div>
          </div>
          <div className="stage-actions-row">
            <button className="invoke-btn" onClick={runSql} disabled={formBusy || !devReady}>
              {sqlRunId ? "Regenerate SQL Extraction Script" : "Generate SQL Extraction Script"}
            </button>
          </div>
          <p className="stage-note">Generate SQL first, validate it manually in the database, then use the result set to prepare the XML package.</p>
        </div>
      ) : (
        <div className="stage-step">
          <div className="step-title">Step 2 - Generate SQL</div>
          <div className="project-message">
            Complete Step 1 by confirming the approved mapping specification and linked data model to unlock SQL generation.
          </div>
        </div>
      )}

      {showStep3 ? (
        <div className="stage-step">
          <div className="step-title">Step 3 - Prepare XML Package</div>
          <div className="form-grid form-grid-two">
            <div className="field">
              <label>Source Data (CSV)</label>
              <select value={String(dataArtifactId)} onChange={(e) => setDataArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={formBusy}>
                <option value="">Select CSV / source data</option>
                {dataOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {artifactOptionLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>XSD Schema</label>
              <select value={String(xsdArtifactId)} onChange={(e) => setXsdArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={formBusy}>
                <option value="">Select XSD schema</option>
                {xsdOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {artifactOptionLabel(a)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <details className="advanced-block" open={!dataArtifactId}>
            <summary>Upload CSV data (optional)</summary>
            <div className="upload-pair-grid">
              <div className="upload-pair">
                <FileUploadZone
                  label="Upload CSV Data"
                  description="Query output or extracted report rows"
                  accept=".csv,.xlsx,.xls,.json"
                  onFileSelect={setDevDataFile}
                  currentFile={devDataFile}
                  onClear={() => setDevDataFile(null)}
                  disabled={formBusy}
                />
                <button
                  className="secondary-btn"
                  onClick={async () => {
                    await uploadArtifact("data", devDataFile, setDataArtifactId);
                    setDevDataFile(null);
                  }}
                  disabled={formBusy || !devDataFile}
                >
                  Upload Source Data
                </button>
              </div>
            </div>
          </details>
          <div className="workflow-transition-brief">
            <div className="workflow-transition-brief__item">
              <span>Source data</span>
              <strong>{dataArtifactName || (xmlReady ? "Included in linked package" : "Missing")}</strong>
            </div>
            <div className="workflow-transition-brief__item">
              <span>XSD</span>
              <strong>{xsdArtifactName || (xmlReady ? "Included in linked package" : "Missing")}</strong>
            </div>
            <div className="workflow-transition-brief__item">
              <span>{xmlReady ? "Submission XML" : "Functional spec"}</span>
              <strong>{xmlReady ? reportXmlArtifactName : functionalSpecName || "Missing"}</strong>
            </div>
          </div>
          <div className="stage-actions-row">
            <button className="invoke-btn" onClick={runXmlGeneration} disabled={formBusy || !devXmlReady}>
              {xmlReady ? "Regenerate Submission XML" : "Generate Submission XML"}
            </button>
          </div>
          <p className="stage-note">
            For PSD008 workflows, XML generation uses the approved functional specification, source data, XSD, and shared
            contract mapping. DEV can regenerate XML multiple times until the output is ready for reviewer handoff.
          </p>
        </div>
      ) : (
        <div className="stage-step">
          <div className="step-title">Step 3 - Prepare XML Package</div>
          <div className="project-message">
            Generate SQL first. Step 3 appears after a SQL run is available for this workflow.
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
