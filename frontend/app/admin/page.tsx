"use client";

import { useState } from "react";
import { useAdminData } from "./useAdminData";
import { AppShell } from "../../components/workbench/AppShell";
import { ActionIcon } from "../../components/workbench/ActionIcon";
import GateConfigCard, { GateConfig } from "../../components/admin/GateConfigCard";
import { WorkflowLogsBrowser } from "../../components/admin/WorkflowLogsBrowser";
import { SystemAuditLogsViewer } from "../../components/admin/SystemAuditLogsViewer";
import { WorkflowLogsDownloader } from "../../components/admin/WorkflowLogsDownloader";
import { fetchGateConfigs, updateGateConfig, resetGateConfig } from "./gateConfigApi";
import { projectLabel, projectOptionsWithCurrent } from "../../components/workbench/projectOptions";
import "./admin.css";

type AdminSection = "overview" | "workflows" | "artifacts" | "gates" | "instructions" | "audit" | "logs" | "config";

export default function AdminPage() {
  const {
    projectId,
    setProjectId,
    adminKey,
    setAdminKey,
    actor,
    setActor,
    busy,
    message,
    artifacts,
    instructions,
    selectedAgent,
    setSelectedAgent,
    instructionText,
    setInstructionText,
    history,
    audit,
    workflowFilter,
    setWorkflowFilter,
    workflowSearch,
    setWorkflowSearch,
    githubConfig,
    setGitHubConfig,
    githubTokenInput,
    setGitHubTokenInput,
    dataModelFile,
    setDataModelFile,
    mappingContractFile,
    setMappingContractFile,
    xsdFile,
    setXsdFile,
    selectedInstruction,
    dataModelArtifacts,
    mappingContractArtifacts,
    xsdArtifacts,
    filteredWorkflows,
    activeWorkflowCount,
    inactiveWorkflowCount,
    adminHeaders,
    loadHistory,
    refreshAll,
    softDeleteArtifact,
    hardDeleteArtifact,
    restoreDeletedArtifact,
    removeWorkflow,
    refreshWorkflowSection,
    persistInstruction,
    uploadDataModelFile,
    uploadMappingContractFile,
    uploadXsdFile,
    persistGitHubConfig,
  } = useAdminData();

  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const [gateConfigs, setGateConfigs] = useState<GateConfig[]>([]);
  const [gateBusy, setGateBusy] = useState(false);
  const projectOptions = projectOptionsWithCurrent(projectId);
  const savedRepoName = (() => {
    const raw = String(githubConfig.repo_url || "").trim();
    if (!raw) return "";
    const parts = raw.split("/").filter(Boolean);
    return parts[parts.length - 1] || raw;
  })();

  const loadGateConfigs = async () => {
    if (!projectId) return;
    setGateBusy(true);
    try {
      const res = await fetchGateConfigs(projectId, adminKey);
      if (res.ok && res.items) {
        setGateConfigs(res.items);
      }
    } catch (err) {
      console.error("Failed to load gate configs:", err);
    } finally {
      setGateBusy(false);
    }
  };

  const handleGateUpdate = async (stage: string, updates: Partial<GateConfig>) => {
    if (!projectId) return;
    setGateBusy(true);
    try {
      const res = await updateGateConfig(projectId, stage, updates, adminKey, actor);
      if (res.ok) {
        await loadGateConfigs();
      }
    } catch (err) {
      console.error("Failed to update gate config:", err);
    } finally {
      setGateBusy(false);
    }
  };

  const handleGateReset = async (stage: string) => {
    if (!projectId) return;
    setGateBusy(true);
    try {
      const res = await resetGateConfig(projectId, stage, adminKey, actor);
      if (res.ok) {
        await loadGateConfigs();
      }
    } catch (err) {
      console.error("Failed to reset gate config:", err);
    } finally {
      setGateBusy(false);
    }
  };

  const handleSectionChange = (section: AdminSection) => {
    setActiveSection(section);
    if (section === "gates" && gateConfigs.length === 0 && projectId) {
      loadGateConfigs();
    }
  };

  return (
    <AppShell
      title="Admin Console"
      subtitle="Manage workflows, artifacts, instructions, and stage gates from one place."
      backLabel="Back to Workbench"
      onBack={() => {
        window.location.href = "/";
      }}
      stageLabel="Admin"
      navItems={[
        { key: "workbench", label: "Workbench", icon: "home", href: "/" },
        { 
          key: "admin", 
          label: "Admin", 
          icon: "admin", 
          active: true,
          subItems: [
            { key: "overview", label: "Overview", icon: "analytics", active: activeSection === "overview", onClick: () => handleSectionChange("overview") },
            { key: "workflows", label: "Workflows", icon: "workflow", active: activeSection === "workflows", onClick: () => handleSectionChange("workflows"), badge: filteredWorkflows.length },
            { key: "artifacts", label: "Artifacts", icon: "artifacts", active: activeSection === "artifacts", onClick: () => handleSectionChange("artifacts"), badge: artifacts.length },
            { key: "gates", label: "Gate Configuration", icon: "admin", active: activeSection === "gates", onClick: () => handleSectionChange("gates") },
            { key: "config", label: "Workspace Configuration", icon: "admin", active: activeSection === "config", onClick: () => handleSectionChange("config") },
            { key: "instructions", label: "Agent Instructions", icon: "reviewer", active: activeSection === "instructions", onClick: () => handleSectionChange("instructions") },
            { key: "audit", label: "Audit Log", icon: "activity", active: activeSection === "audit", onClick: () => handleSectionChange("audit"), badge: audit.length },
            { key: "logs", label: "Logs & Audit Trail", icon: "jobs", active: activeSection === "logs", onClick: () => handleSectionChange("logs") }
          ]
        },
        { key: "analytics", label: "Analytics", icon: "analytics", href: "/analytics" }
      ]}
    >
      <div className="dashboard-shell regai-wrap admin-shell">
      {activeSection === "config" && (
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title">Workspace Configuration</div>
            <span className="panel-badge badge-slate">Admin Settings</span>
          </div>
          <div className="workflow-panel-eyebrow">Command Inputs</div>
          <div className="admin-controls">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="x-admin-key (if configured)" />
            <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="actor name" />
            <button className="header-btn" onClick={refreshAll} disabled={busy}>
              {busy ? "Loading..." : "Refresh All"}
            </button>
          </div>
          {message && <div className="project-message">{message}</div>}
          <div className="admin-meta">Configure your workspace settings, project ID, admin credentials, and actor name for administrative operations.</div>
        </section>
      )}

      {activeSection === "overview" && (
        <div className="admin-overview">
          <div className="admin-stats-grid">
            <div className="admin-stat-card">
              <div className="admin-stat-card__icon"><ActionIcon name="workflow" className="action-icon" /></div>
              <div className="stat-value">{activeWorkflowCount}</div>
              <div className="stat-label">Active Workflows</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__icon"><ActionIcon name="warning" className="action-icon" /></div>
              <div className="stat-value">{inactiveWorkflowCount}</div>
              <div className="stat-label">Inactive Workflows</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__icon"><ActionIcon name="artifacts" className="action-icon" /></div>
              <div className="stat-value">{artifacts.filter((a) => !a.is_deleted).length}</div>
              <div className="stat-label">Active Artifacts</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__icon"><ActionIcon name="dev" className="action-icon" /></div>
              <div className="stat-value">{dataModelArtifacts.length}</div>
              <div className="stat-label">Data Models</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__icon"><ActionIcon name="artifacts" className="action-icon" /></div>
              <div className="stat-value">{mappingContractArtifacts.length}</div>
              <div className="stat-label">Mapping Contracts</div>
            </div>
            <div className="admin-stat-card">
              <div className="admin-stat-card__icon"><ActionIcon name="reviewer" className="action-icon" /></div>
              <div className="stat-value">{xsdArtifacts.length}</div>
              <div className="stat-label">XSD Schemas</div>
            </div>
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Data Model Library</div>
                <div className="admin-meta">Only admin uploads and maintains data model artifacts used by BA and DEV workflows.</div>
              </div>
              <span className="panel-badge badge-slate">{dataModelArtifacts.length}</span>
            </div>
            <div className="admin-controls">
              <input type="file" accept=".xlsx,.xls,.json" onChange={(e) => setDataModelFile(e.target.files?.[0] || null)} />
              <button className="header-btn" onClick={uploadDataModelFile} disabled={busy || !dataModelFile}>
                Upload Data Model
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">Mapping Contract Library</div>
                <div className="admin-meta">Admin uploads report-specific mapping contracts that DEV XML generation resolves by report code.</div>
              </div>
              <span className="panel-badge badge-slate">{mappingContractArtifacts.length}</span>
            </div>
            <div className="admin-controls">
              <input type="file" accept=".json" onChange={(e) => setMappingContractFile(e.target.files?.[0] || null)} />
              <button className="header-btn" onClick={uploadMappingContractFile} disabled={busy || !mappingContractFile}>
                Upload Mapping Contract
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">XSD Schema Library</div>
                <div className="admin-meta">Admin uploads XSD schemas used for XML package preparation in the Developer stage.</div>
              </div>
              <span className="panel-badge badge-slate">{xsdArtifacts.length}</span>
            </div>
            <div className="admin-controls">
              <input type="file" accept=".xsd" onChange={(e) => setXsdFile(e.target.files?.[0] || null)} />
              <button className="header-btn" onClick={uploadXsdFile} disabled={busy || !xsdFile}>
                Upload XSD Schema
              </button>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="panel-title">GitHub Artifact Publishing</div>
                <div className="admin-meta">One repository is supported for now. BA, DEV, and Reviewer publish approved artifacts to that target.</div>
              </div>
              <span className={`panel-badge ${githubConfig.enabled ? "badge-teal" : "badge-slate"}`}>
                {githubConfig.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="admin-list">
              <div className="admin-row">
                <div>
                  <div>{savedRepoName || "No repository saved yet"}</div>
                  <div className="admin-meta">Repository URL: {githubConfig.repo_url || "-"}</div>
                  <div className="admin-meta">Branch: {githubConfig.branch || "-"}</div>
                  <div className="admin-meta">Folder path: {githubConfig.base_path || "Repo root"}</div>
                  <div className="admin-meta">Token: {githubConfig.token_configured ? githubConfig.token_masked || "Configured" : "Not configured"}</div>
                </div>
                <div className="admin-actions">
                  <span className={`panel-badge ${githubConfig.enabled ? "badge-teal" : "badge-slate"}`}>
                    {githubConfig.enabled ? "Publishing active" : "Publishing disabled"}
                  </span>
                </div>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void persistGitHubConfig();
              }}
            >
              <div className="admin-controls">
                <input
                  value={githubConfig.repo_url}
                  onChange={(e) => setGitHubConfig({ ...githubConfig, repo_url: e.target.value })}
                  placeholder="Repository URL, e.g. https://github.com/org/repo"
                />
                <input
                  value={githubConfig.branch}
                  onChange={(e) => setGitHubConfig({ ...githubConfig, branch: e.target.value })}
                  placeholder="Branch, e.g. main"
                />
                <input
                  value={githubConfig.base_path}
                  onChange={(e) => setGitHubConfig({ ...githubConfig, base_path: e.target.value })}
                  placeholder="Repository folder path (optional), e.g. local-workspace/workflows"
                />
              </div>
              <div className="admin-controls">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={githubTokenInput}
                  onChange={(e) => setGitHubTokenInput(e.target.value)}
                  placeholder={githubConfig.token_configured ? `Update token (${githubConfig.token_masked || "configured"})` : "GitHub fine-grained PAT"}
                />
                <label className="admin-inline-meta">
                  <input
                    type="checkbox"
                    checked={githubConfig.enabled}
                    onChange={(e) => setGitHubConfig({ ...githubConfig, enabled: e.target.checked })}
                  />
                  Enable publishing
                </label>
                <button className="header-btn" type="submit" disabled={busy || !projectId || !githubConfig.repo_url.trim()}>
                  Save GitHub Config
                </button>
              </div>
            </form>
            <div className="admin-meta">
              Token required: GitHub fine-grained personal access token with repository <strong>Contents: Read and write</strong> permission.
              {githubConfig.updated_at ? ` Last updated ${githubConfig.updated_at}` : ""}
            </div>
            <div className="admin-meta">Leave the repository folder path blank to publish directly to the repo root.</div>
          </section>
        </div>
      )}

      {activeSection === "workflows" && (
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title">Workflow Management</div>
            <span className="panel-badge badge-slate">{filteredWorkflows.length}</span>
          </div>
          <div className="admin-controls">
            <select value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value as "all" | "active" | "inactive")}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <input value={workflowSearch} onChange={(e) => setWorkflowSearch(e.target.value)} placeholder="Search by id, name, stage, status" />
            <button className="header-btn" onClick={refreshWorkflowSection} disabled={busy}>
              Refresh Workflows
            </button>
            <span className="admin-meta">active={activeWorkflowCount} | inactive={inactiveWorkflowCount}</span>
          </div>
          <div className="admin-list">
            {filteredWorkflows.length === 0 && <div className="admin-empty">No workflows found.</div>}
            {filteredWorkflows.map((workflow) => (
              <div className="admin-row" key={workflow.id}>
                <div>
                  <div>
                    #{workflow.id} - {workflow.name}
                  </div>
                  <div className="admin-meta">
                    stage={workflow.current_stage} | status={workflow.status} | active={workflow.is_active ? "yes" : "no"} | assignee=
                    {workflow.current_assignee || "-"}
                  </div>
                  <div className="admin-meta">psd={workflow.psd_version || "-"} | updated_at={workflow.updated_at || "-"}</div>
                </div>
                <div className="admin-actions">
                  {workflow.is_active && (
                    <button className="secondary-btn" onClick={() => removeWorkflow(workflow.id)} disabled={busy}>
                      Archive
                    </button>
                  )}
                  <button className="secondary-btn" onClick={() => removeWorkflow(workflow.id, true)} disabled={busy}>
                    Hard Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection === "artifacts" && (
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title">Artifacts</div>
            <span className="panel-badge badge-slate">{artifacts.length}</span>
          </div>
          <div className="admin-list">
            {artifacts.length === 0 && <div className="admin-empty">No artifacts found.</div>}
            {artifacts.map((a) => (
              <div className="admin-row" key={a.id}>
                <div>
                  <div>
                    #{a.id} - {a.filename}
                  </div>
                  <div className="admin-meta">
                    {a.kind} | {a.is_deleted ? `Deleted by ${a.deleted_by || "-"} at ${a.deleted_at || "-"}` : "Active"}
                  </div>
                </div>
                <div className="admin-actions">
                  {!a.is_deleted ? (
                    <button className="secondary-btn" onClick={() => softDeleteArtifact(a.id)} disabled={busy}>
                      Soft Delete
                    </button>
                  ) : (
                    <button className="secondary-btn" onClick={() => restoreDeletedArtifact(a.id)} disabled={busy}>
                      Restore
                    </button>
                  )}
                  <button className="secondary-btn" onClick={() => hardDeleteArtifact(a.id)} disabled={busy}>
                    Hard Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection === "gates" && (
        <div className="admin-gates-section">
          <div className="panel-header">
            <div className="panel-title">Workflow Stage Gate Configuration</div>
            <button className="header-btn" onClick={loadGateConfigs} disabled={gateBusy || !projectId}>
              Refresh Gates
            </button>
          </div>
          <div className="gate-cards-grid">
            {gateConfigs.map((config) => (
              <GateConfigCard
                key={config.stage}
                config={config}
                onUpdate={handleGateUpdate}
                onReset={handleGateReset}
                busy={gateBusy}
              />
            ))}
            {gateConfigs.length === 0 && !gateBusy && (
              <div className="admin-empty">No gate configurations loaded. Enter project ID and click Refresh Gates.</div>
            )}
          </div>
        </div>
      )}

      {activeSection === "instructions" && (
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title">Agent Instructions</div>
            <span className="panel-badge badge-slate">{selectedAgent}</span>
          </div>
          <div className="admin-controls">
            <select
              value={selectedAgent}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedAgent(value);
                const selected = instructions.find((x) => x.agent_key === value);
                setInstructionText(selected?.current_instruction || "");
                loadHistory(value);
              }}
            >
              {instructions.map((i) => (
                <option key={i.agent_key} value={i.agent_key}>
                  {i.agent_key}
                </option>
              ))}
            </select>
            <span className="admin-meta">Current version: {selectedInstruction?.version ?? 0}</span>
          </div>
          <textarea className="admin-instruction-text" value={instructionText} onChange={(e) => setInstructionText(e.target.value)} />
          <div className="admin-controls">
            <button className="header-btn" onClick={persistInstruction} disabled={busy || !instructionText.trim()}>
              Save New Version
            </button>
          </div>
          <div className="admin-history">
            {history.length === 0 && <div className="admin-empty">No history.</div>}
            {history.map((h, idx) => (
              <div className="admin-history-item" key={`${h.version}-${idx}`}>
                <div>v{h.version}</div>
                <div className="admin-meta">
                  {h.updated_by || "admin"} | {h.created_at || "-"}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection === "audit" && (
        <section className="panel">
          <div className="panel-header">
            <div className="panel-title">Admin Audit Log</div>
            <span className="panel-badge badge-slate">{audit.length}</span>
          </div>
          <div className="admin-list">
            {audit.length === 0 && <div className="admin-empty">No audit logs.</div>}
            {audit.map((a) => (
              <div className="admin-row" key={a.id}>
                <div>
                  <div>
                    {a.action} | {a.target_type} | {a.target_id || "-"}
                  </div>
                  <div className="admin-meta">
                    actor={a.actor || "-"} | project={a.project_id || "-"} | at={a.created_at || "-"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeSection === "logs" && (
        <div className="admin-logs-section">
          <section className="panel admin-logs-workflow-panel">
            <div className="panel-header">
              <div className="panel-title">Workflow Logs</div>
              <div className="admin-meta">View, filter, and download logs for any workflow</div>
            </div>
            <WorkflowLogsBrowser projectId={projectId} adminHeaders={adminHeaders} />
          </section>

          <WorkflowLogsDownloader projectId={projectId} />

          <section className="panel">
            <div className="panel-header">
              <div className="panel-title">System Audit Trail</div>
              <div className="admin-meta">System-wide audit logs (admin only)</div>
            </div>
            <SystemAuditLogsViewer />
          </section>
        </div>
      )}
      </div>
    </AppShell>
  );
}
