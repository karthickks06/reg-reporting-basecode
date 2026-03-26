import { FileUploadZone } from "../FileUploadZone";
import { StatusBadge } from "../StatusBadge";
import { ActionIcon } from "./ActionIcon";
import { artifactOptionLabel } from "./artifactLabels";
import type { Artifact, UploadArtifactFn, XmlValidationState } from "./types";
import { API_BASE } from "./utils";

type ReviewerTabProps = {
  busy: boolean;
  revReady: boolean;
  xmlRunId: number | null;
  xmlValidation: XmlValidationState | null;
  revUserContext: string;
  reportXmlArtifactId: number | "";
  xsdArtifactId: number | "";
  fcaArtifactId: number | "";
  dataArtifactId: number | "";
  modelArtifactId: number | "";
  reportXmlOptions: Artifact[];
  xsdOptions: Artifact[];
  fcaOptions: Artifact[];
  dataOptions: Artifact[];
  reportXmlArtifactName?: string;
  xsdArtifactName?: string;
  fcaArtifactName?: string;
  dataArtifactName?: string;
  modelArtifactName?: string;
  functionalSpecName?: string;
  revXsdFile: File | null;
  setRevUserContext: (value: string) => void;
  setReportXmlArtifactId: (value: number | "") => void;
  setXsdArtifactId: (value: number | "") => void;
  setFcaArtifactId: (value: number | "") => void;
  setDataArtifactId: (value: number | "") => void;
  setModelArtifactId: (value: number | "") => void;
  setRevXsdFile: (file: File | null) => void;
  modelOptions: Artifact[];
  runXmlValidation: () => Promise<void>;
  uploadArtifact: UploadArtifactFn;
  readOnly?: boolean;
};

export function ReviewerTab({
  busy,
  revReady,
  xmlRunId,
  xmlValidation,
  revUserContext,
  reportXmlArtifactId,
  xsdArtifactId,
  fcaArtifactId,
  dataArtifactId,
  modelArtifactId,
  reportXmlOptions,
  xsdOptions,
  fcaOptions,
  dataOptions,
  reportXmlArtifactName,
  xsdArtifactName,
  fcaArtifactName,
  dataArtifactName,
  modelArtifactName,
  functionalSpecName,
  revXsdFile,
  setRevUserContext,
  setReportXmlArtifactId,
  setXsdArtifactId,
  setFcaArtifactId,
  setDataArtifactId,
  setModelArtifactId,
  setRevXsdFile,
  modelOptions,
  runXmlValidation,
  uploadArtifact,
  readOnly = false
}: ReviewerTabProps) {
  const step1Complete = Boolean(
    reportXmlArtifactId &&
    xsdArtifactId &&
    fcaArtifactId &&
    dataArtifactId &&
    modelArtifactId &&
    functionalSpecName
  );
  const step2Complete = Boolean(step1Complete && revUserContext.trim());
  const showStep2 = step1Complete;
  const showStep3 = showStep2;

  return (
    <section className="panel agent-panel-full work-stage-panel">
      <section className="stage-persona-hero stage-persona-hero--review">
        <div className="stage-persona-hero__copy">
          <div className="workflow-panel-eyebrow">Reviewer Stage</div>
          <h3>Validate the submission package with confidence</h3>
          <p>Bring together the XML instance, schema, PSD, and data model so the final review reflects both structural and business-rule quality.</p>
        </div>
        <div className="stage-persona-hero__status">
          <StatusBadge status={busy && revReady ? "running" : xmlRunId ? "done" : revReady ? "ready" : "idle"}>
            {xmlRunId ? "Validation completed" : revReady ? "Ready for validation" : "Select required validation artifacts"}
          </StatusBadge>
        </div>
        <div className="stage-persona-hero__signals">
          <div className="stage-persona-signal">
            <span>Inputs</span>
            <strong>{step1Complete ? "Ready" : "Needed"}</strong>
          </div>
          <div className="stage-persona-signal">
            <span>Validation</span>
            <strong>{xmlValidation ? (xmlValidation.pass ? "Pass" : "Issues found") : "Pending"}</strong>
          </div>
          <div className="stage-persona-signal">
            <span>Progress</span>
            <strong>{xmlRunId ? "Validation completed" : showStep3 ? "Step 3 active" : showStep2 ? "Step 2 active" : "Step 1 active"}</strong>
          </div>
        </div>
      </section>
      {readOnly && <p className="stage-note">This workflow is no longer assigned to Reviewer. Reviewer actions are locked.</p>}

      <div className="stage-step">
        <div className="step-title">Step 1 - Validation Inputs</div>
        <div className="form-grid form-grid-two">
          <div className="field">
            <label>Submission XML Instance</label>
            <select value={String(reportXmlArtifactId)} onChange={(e) => setReportXmlArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={busy || readOnly}>
              <option value="">Select submission XML</option>
              {reportXmlOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {artifactOptionLabel(a)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>XSD</label>
            <select value={String(xsdArtifactId)} onChange={(e) => setXsdArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={busy || readOnly}>
              <option value="">Select XSD</option>
              {xsdOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {artifactOptionLabel(a)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <div className="field">
            <label>PSD Document</label>
            <select value={String(fcaArtifactId)} onChange={(e) => setFcaArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={busy || readOnly}>
              <option value="">Select PSD</option>
              {fcaOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {artifactOptionLabel(a)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Source Data (CSV)</label>
            <select value={String(dataArtifactId)} onChange={(e) => setDataArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={busy || readOnly}>
              <option value="">Select source data</option>
              {dataOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {artifactOptionLabel(a)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid form-grid-two">
          <div className="field">
            <label>Data Model</label>
            <select value={String(modelArtifactId)} onChange={(e) => setModelArtifactId(e.target.value ? Number(e.target.value) : "")} disabled={busy || readOnly}>
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
            <span>XML</span>
            <strong>{reportXmlArtifactName || "Missing"}</strong>
          </div>
          <div className="workflow-transition-brief__item">
            <span>Review bundle</span>
            <strong>{step1Complete ? "Ready" : "Select all required artifacts"}</strong>
          </div>
          <div className="workflow-transition-brief__item">
            <span>Functional spec</span>
            <strong>{functionalSpecName || "Missing"}</strong>
          </div>
        </div>
      </div>

      {showStep2 ? (
        <div className="stage-step">
          <div className="step-title">Step 2 - Review Guidance</div>
          <details className="advanced-block">
            <summary>Upload XSD (optional)</summary>
            <div className="upload-pair-grid">
              <div className="upload-pair">
                <FileUploadZone
                  label="Upload XSD"
                  description="Validation schema"
                  accept=".xsd,.xml"
                  onFileSelect={setRevXsdFile}
                  currentFile={revXsdFile}
                  onClear={() => setRevXsdFile(null)}
                  disabled={busy || readOnly}
                />
                <button
                  className="secondary-btn"
                  onClick={async () => {
                    await uploadArtifact("xsd", revXsdFile, setXsdArtifactId);
                    setRevXsdFile(null);
                  }}
                  disabled={busy || !revXsdFile || readOnly}
                >
                  Upload XSD
                </button>
              </div>
            </div>
          </details>
          <div className="form-grid form-grid-two">
            <div className="field">
              <label>LLM Model</label>
              <div className="stat">GPT-4.1 (Azure OpenAI)</div>
            </div>
            <div className="field context-field">
              <label>Reviewer guidance</label>
              <textarea
                value={revUserContext}
                onChange={(e) => setRevUserContext(e.target.value)}
                placeholder="Example: focus on mandatory PSD fields and datatype mismatches."
                disabled={busy || readOnly}
              />
            </div>
          </div>
          <div className="stage-note">Set review guidance before launching the AI-assisted XML validation pass.</div>
        </div>
      ) : (
        <div className="stage-step">
          <div className="step-title">Step 2 - Review Guidance</div>
          <div className="project-message">
            Complete Step 1 by selecting the XML, XSD, PSD, source data, and data model inputs to unlock reviewer guidance.
          </div>
        </div>
      )}

      {showStep3 ? (
        <div className="stage-step">
          <div className="step-title">Step 3 - Run Validation</div>
          <div className="stage-actions-row">
            <button className="invoke-btn btn-with-icon" onClick={runXmlValidation} disabled={busy || !revReady || readOnly}>
              <ActionIcon name="submit" className="action-icon" />
              {xmlRunId ? "Run Validation Again" : "Validate Submission XML"}
            </button>
          </div>
          {xmlRunId && (
            <div className="stage-actions-row">
              <a className="header-link-btn" href={`${API_BASE}/v1/xml/validation/${xmlRunId}/report?format=json`} target="_blank" rel="noopener noreferrer">
                Download Validation JSON
              </a>
              <a className="header-link-btn" href={`${API_BASE}/v1/xml/validation/${xmlRunId}/report?format=csv`} target="_blank" rel="noopener noreferrer">
                Download Validation CSV
              </a>
            </div>
          )}
          {!revReady && xmlRunId && (
            <p className="stage-note">Retry is disabled because one or more required artifacts are not selected. Select XML, XSD, PSD, source data, and data model. Functional spec must also exist on the workflow.</p>
          )}
          <p className="stage-note">Validation uses XML, XSD, PSD, source data, data model, and the saved functional specification to assess coverage and output quality.</p>
        </div>
      ) : (
        <div className="stage-step">
          <div className="step-title">Step 3 - Run Validation</div>
          <div className="project-message">
            Complete Step 2 first. Validation becomes available after the reviewer inputs and guidance are ready.
          </div>
        </div>
      )}

    </section>
  );
}
