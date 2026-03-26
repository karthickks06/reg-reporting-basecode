import type {
  AdminWorkflowItem,
  ArtifactItem,
  AuditItem,
  GitHubIntegrationConfig,
  InstructionHistoryItem,
  InstructionItem
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:18000";

export type HeaderFactory = () => Record<string, string>;

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

export async function fetchArtifacts(projectId: string, adminHeaders: HeaderFactory): Promise<ArtifactItem[]> {
  const json = await fetchJson(
    `${API_BASE}/v1/admin/artifacts?project_id=${encodeURIComponent(projectId)}&include_deleted=true`,
    { headers: adminHeaders() }
  );
  return json.items || [];
}

export async function fetchInstructions(adminHeaders: HeaderFactory): Promise<InstructionItem[]> {
  const json = await fetchJson(`${API_BASE}/v1/admin/instructions`, { headers: adminHeaders() });
  return json.items || [];
}

export async function fetchInstructionHistory(agentKey: string, adminHeaders: HeaderFactory): Promise<InstructionHistoryItem[]> {
  const json = await fetchJson(
    `${API_BASE}/v1/admin/instructions/${encodeURIComponent(agentKey)}/history?limit=15`,
    { headers: adminHeaders() }
  );
  return (json.items || []).map((x: any) => ({ version: x.version, updated_by: x.updated_by, created_at: x.created_at }));
}

export async function fetchAudit(adminHeaders: HeaderFactory): Promise<AuditItem[]> {
  const json = await fetchJson(`${API_BASE}/v1/admin/audit-logs?limit=80`, { headers: adminHeaders() });
  return json.items || [];
}

export async function fetchWorkflows(projectId: string, adminHeaders: HeaderFactory): Promise<AdminWorkflowItem[]> {
  const json = await fetchJson(
    `${API_BASE}/v1/admin/workflows?project_id=${encodeURIComponent(projectId)}&include_inactive=true&limit=500`,
    { headers: adminHeaders() }
  );
  return json.items || [];
}

export async function deleteArtifact(
  id: number,
  projectId: string,
  actor: string,
  hardDelete: boolean,
  adminHeaders: HeaderFactory
): Promise<void> {
  await fetchJson(
    `${API_BASE}/v1/artifacts/${id}?project_id=${encodeURIComponent(projectId)}&actor=${encodeURIComponent(actor)}&hard_delete=${hardDelete}`,
    { method: "DELETE", headers: adminHeaders() }
  );
}

export async function restoreArtifact(id: number, projectId: string, actor: string, adminHeaders: HeaderFactory): Promise<void> {
  await fetchJson(
    `${API_BASE}/v1/admin/artifacts/${id}/restore?project_id=${encodeURIComponent(projectId)}&actor=${encodeURIComponent(actor)}`,
    { method: "POST", headers: adminHeaders() }
  );
}

export async function deleteWorkflow(
  workflowId: number,
  projectId: string,
  actor: string,
  hardDelete: boolean,
  adminHeaders: HeaderFactory
): Promise<void> {
  await fetchJson(
    `${API_BASE}/v1/admin/workflows/${workflowId}?project_id=${encodeURIComponent(projectId)}&actor=${encodeURIComponent(actor)}&hard_delete=${hardDelete}`,
    { method: "DELETE", headers: adminHeaders() }
  );
}

export async function saveInstruction(
  selectedAgent: string,
  instructionText: string,
  actor: string,
  adminHeaders: HeaderFactory
): Promise<{ version: number }> {
  return await fetchJson(`${API_BASE}/v1/admin/instructions/${encodeURIComponent(selectedAgent)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ instruction: instructionText, updated_by: actor || "admin" })
  });
}

export async function uploadDataModel(projectId: string, file: File, adminHeaders: HeaderFactory): Promise<{ filename: string }> {
  const fd = new FormData();
  fd.append("project_id", projectId);
  fd.append("kind", "data_model");
  fd.append("file", file);
  return await fetchJson(`${API_BASE}/v1/files/upload`, {
    method: "POST",
    headers: adminHeaders(),
    body: fd
  });
}

export async function uploadMappingContract(projectId: string, file: File, adminHeaders: HeaderFactory): Promise<{ filename: string }> {
  const fd = new FormData();
  fd.append("project_id", projectId);
  fd.append("kind", "mapping_contract");
  fd.append("file", file);
  return await fetchJson(`${API_BASE}/v1/files/upload`, {
    method: "POST",
    headers: adminHeaders(),
    body: fd
  });
}

export async function uploadXsd(projectId: string, file: File, adminHeaders: HeaderFactory): Promise<{ filename: string }> {
  const fd = new FormData();
  fd.append("project_id", projectId);
  fd.append("kind", "xsd");
  fd.append("file", file);
  return await fetchJson(`${API_BASE}/v1/files/upload`, {
    method: "POST",
    headers: adminHeaders(),
    body: fd
  });
}

export async function fetchGitHubIntegration(projectId: string, adminHeaders: HeaderFactory): Promise<GitHubIntegrationConfig> {
  const json = await fetchJson(
    `${API_BASE}/v1/admin/integrations/github?project_id=${encodeURIComponent(projectId)}`,
    { headers: adminHeaders() }
  );
  return json.config;
}

export async function saveGitHubIntegration(
  input: {
    project_id: string;
    repo_url: string;
    branch: string;
    base_path: string;
    enabled: boolean;
    updated_by: string;
    token?: string;
  },
  adminHeaders: HeaderFactory
): Promise<GitHubIntegrationConfig> {
  const json = await fetchJson(`${API_BASE}/v1/admin/integrations/github`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify(input)
  });
  return json.config;
}
