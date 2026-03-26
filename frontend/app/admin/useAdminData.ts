import { useEffect, useMemo, useState } from "react";

import { DEFAULT_PROJECT_ID } from "../../components/workbench/projectOptions";
import {
  deleteArtifact,
  deleteWorkflow,
  fetchArtifacts,
  fetchAudit,
  fetchGitHubIntegration,
  fetchInstructionHistory,
  fetchInstructions,
  fetchWorkflows,
  restoreArtifact,
  saveGitHubIntegration,
  saveInstruction,
  uploadDataModel,
  uploadMappingContract,
  uploadXsd
} from "./adminApi";
import type {
  AdminWorkflowItem,
  ArtifactItem,
  AuditItem,
  GitHubIntegrationConfig,
  InstructionHistoryItem,
  InstructionItem
} from "./types";

export function useAdminData() {
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [adminKey, setAdminKey] = useState("");
  const [actor, setActor] = useState("admin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [instructions, setInstructions] = useState<InstructionItem[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("ba_gap");
  const [instructionText, setInstructionText] = useState("");
  const [history, setHistory] = useState<InstructionHistoryItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [workflows, setWorkflows] = useState<AdminWorkflowItem[]>([]);
  const [githubConfig, setGitHubConfig] = useState<GitHubIntegrationConfig>({
    enabled: false,
    repo_url: "",
    branch: "main",
    base_path: "",
    token_configured: false
  });
  const [githubTokenInput, setGitHubTokenInput] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState<"all" | "active" | "inactive">("active");
  const [workflowSearch, setWorkflowSearch] = useState("");
  const [dataModelFile, setDataModelFile] = useState<File | null>(null);
  const [mappingContractFile, setMappingContractFile] = useState<File | null>(null);
  const [xsdFile, setXsdFile] = useState<File | null>(null);

  const selectedInstruction = useMemo(() => instructions.find((i) => i.agent_key === selectedAgent), [instructions, selectedAgent]);
  const dataModelArtifacts = useMemo(() => artifacts.filter((a) => a.kind === "data_model" && !a.is_deleted), [artifacts]);
  const mappingContractArtifacts = useMemo(() => artifacts.filter((a) => a.kind === "mapping_contract" && !a.is_deleted), [artifacts]);
  const xsdArtifacts = useMemo(() => artifacts.filter((a) => a.kind === "xsd" && !a.is_deleted), [artifacts]);
  const filteredWorkflows = useMemo(() => {
    const search = workflowSearch.trim().toLowerCase();
    return workflows.filter((workflow) => {
      if (workflowFilter === "active" && !workflow.is_active) return false;
      if (workflowFilter === "inactive" && workflow.is_active) return false;
      if (!search) return true;
      const bucket = `${workflow.id} ${workflow.name || ""} ${workflow.status || ""} ${workflow.current_stage || ""} ${workflow.current_assignee || ""}`;
      return bucket.toLowerCase().includes(search);
    });
  }, [workflows, workflowFilter, workflowSearch]);
  const activeWorkflowCount = useMemo(() => workflows.filter((workflow) => workflow.is_active).length, [workflows]);
  const inactiveWorkflowCount = useMemo(() => workflows.filter((workflow) => !workflow.is_active).length, [workflows]);

  function adminHeaders() {
    const headers: Record<string, string> = {};
    if (adminKey.trim()) headers["x-admin-key"] = adminKey.trim();
    return headers;
  }

  async function loadArtifacts() {
    setArtifacts(await fetchArtifacts(projectId, adminHeaders));
  }

  async function loadInstructions() {
    const items = await fetchInstructions(adminHeaders);
    setInstructions(items);
    const current = items.find((i) => i.agent_key === selectedAgent) || items[0];
    if (current) {
      setSelectedAgent(current.agent_key);
      setInstructionText(current.current_instruction || "");
    }
  }

  async function loadHistory(agentKey: string) {
    setHistory(await fetchInstructionHistory(agentKey, adminHeaders));
  }

  async function loadAudit() {
    setAudit(await fetchAudit(adminHeaders));
  }

  async function loadWorkflows() {
    setWorkflows(await fetchWorkflows(projectId, adminHeaders));
  }

  async function loadGitHubConfig() {
    setGitHubConfig(await fetchGitHubIntegration(projectId, adminHeaders));
    setGitHubTokenInput("");
  }

  async function refreshAll() {
    setBusy(true);
    setMessage("");
    try {
      await Promise.all([loadArtifacts(), loadInstructions(), loadHistory(selectedAgent), loadAudit(), loadWorkflows(), loadGitHubConfig()]);
      setMessage("Admin data refreshed.");
    } catch (e) {
      setMessage(`Refresh failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function softDeleteArtifact(id: number) {
    setBusy(true);
    setMessage("");
    try {
      await deleteArtifact(id, projectId, actor, false, adminHeaders);
      await loadArtifacts();
      await loadAudit();
      setMessage(`Artifact ${id} soft-deleted.`);
    } catch (e) {
      setMessage(`Delete failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function hardDeleteArtifact(id: number) {
    setBusy(true);
    setMessage("");
    try {
      await deleteArtifact(id, projectId, actor, true, adminHeaders);
      await loadArtifacts();
      await loadAudit();
      setMessage(`Artifact ${id} hard-deleted.`);
    } catch (e) {
      setMessage(`Hard delete failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function restoreDeletedArtifact(id: number) {
    setBusy(true);
    setMessage("");
    try {
      await restoreArtifact(id, projectId, actor, adminHeaders);
      await loadArtifacts();
      await loadAudit();
      setMessage(`Artifact ${id} restored.`);
    } catch (e) {
      setMessage(`Restore failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeWorkflow(workflowId: number, hardDelete = false) {
    const confirmed = window.confirm(
      hardDelete
        ? "Permanently delete this workflow and stage history? This action cannot be undone."
        : "Archive this workflow? It will no longer appear in active user queues."
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteWorkflow(workflowId, projectId, actor, hardDelete, adminHeaders);
      await Promise.all([loadWorkflows(), loadAudit()]);
      setMessage(hardDelete ? `Workflow ${workflowId} permanently deleted.` : `Workflow ${workflowId} archived.`);
    } catch (e) {
      setMessage(`Workflow delete failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshWorkflowSection() {
    setBusy(true);
    setMessage("");
    try {
      await loadWorkflows();
      setMessage("Workflow list refreshed.");
    } catch (e) {
      setMessage(`Workflow refresh failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function persistInstruction() {
    setBusy(true);
    setMessage("");
    try {
      const json = await saveInstruction(selectedAgent, instructionText, actor, adminHeaders);
      await loadInstructions();
      await loadHistory(selectedAgent);
      await loadAudit();
      setMessage(`Instruction updated for ${selectedAgent} (v${json.version}).`);
    } catch (e) {
      setMessage(`Instruction save failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadDataModelFile() {
    if (!dataModelFile) return;
    setBusy(true);
    setMessage("");
    try {
      const json = await uploadDataModel(projectId, dataModelFile, adminHeaders);
      setDataModelFile(null);
      await loadArtifacts();
      setMessage(`Data model uploaded: ${json.filename}`);
    } catch (e) {
      setMessage(`Data model upload failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadMappingContractFile() {
    if (!mappingContractFile) return;
    setBusy(true);
    setMessage("");
    try {
      const json = await uploadMappingContract(projectId, mappingContractFile, adminHeaders);
      setMappingContractFile(null);
      await loadArtifacts();
      setMessage(`Mapping contract uploaded: ${json.filename}`);
    } catch (e) {
      setMessage(`Mapping contract upload failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function uploadXsdFile() {
    if (!xsdFile) return;
    setBusy(true);
    setMessage("");
    try {
      const json = await uploadXsd(projectId, xsdFile, adminHeaders);
      setXsdFile(null);
      await loadArtifacts();
      setMessage(`XSD schema uploaded: ${json.filename}`);
    } catch (e) {
      setMessage(`XSD schema upload failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function persistGitHubConfig() {
    setBusy(true);
    setMessage("");
    try {
      await saveGitHubIntegration(
        {
          project_id: projectId,
          repo_url: githubConfig.repo_url,
          branch: githubConfig.branch || "main",
          base_path: githubConfig.base_path || "",
          enabled: githubConfig.enabled,
          updated_by: actor || "admin",
          token: githubTokenInput.trim() || undefined
        },
        adminHeaders
      );
      await loadGitHubConfig();
      setGitHubTokenInput("");
      await loadAudit();
      setMessage("GitHub integration updated.");
    } catch (e) {
      setMessage(`GitHub integration save failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return {
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
    workflows,
    githubConfig,
    setGitHubConfig,
    githubTokenInput,
    setGitHubTokenInput,
    workflowFilter,
    setWorkflowFilter,
    workflowSearch,
    setWorkflowSearch,
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
    persistGitHubConfig
  };
}
