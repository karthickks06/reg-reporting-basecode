import api from '@/utils/axios';
import { Workflow } from '@/types';

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || 'local-workspace';

const normalizeStage = (stage?: string): string | undefined => {
  const value = String(stage || '').trim().toLowerCase();
  const stageMap: Record<string, string> = {
    ba: 'business_analyst',
    business_analyst: 'business_analyst',
    dev: 'developer',
    developer: 'developer',
    reviewer: 'reviewer',
    analyst: 'reviewer',
    completed: 'reviewer',
    complete: 'reviewer',
  };
  return stageMap[value] || stage || undefined;
};

const normalizeStageStatus = (workflow: any): string => {
  if (workflow.stage_status) return workflow.stage_status;
  if (workflow.status === 'completed') return 'completed';
  if (workflow.status === 'cancelled') return 'cancelled';
  return 'in_progress';
};

const normalizeWorkflow = (workflow: any): Workflow => ({
  ...workflow,
  id: String(workflow.id),
  workflow_id: workflow.workflow_id || workflow.display_id || String(workflow.id),
  workflow_name: workflow.workflow_name || workflow.name || workflow.display_id || String(workflow.id),
  workflow_type: workflow.workflow_type || 'Complete',
  created_by: workflow.created_by || workflow.started_by || 'user',
  version: workflow.version || workflow.psd_version || '1.0',
  current_stage: normalizeStage(workflow.current_stage),
  stage_status: normalizeStageStatus(workflow),
  steps_completed: workflow.steps_completed || workflow.stage_progress?.steps_completed || workflow.current_step_index || 0,
  total_steps: workflow.total_steps || workflow.stage_progress?.total_steps || 0,
});

/**
 * Workflow Service - Manual Step Execution Only
 *
 * This service handles workflow CRUD and manual step-by-step execution.
 * All automatic session execution has been removed.
 */
export const workflowService = {
  // ============================================================================
  // Main Workflow CRUD
  // ============================================================================

  getAll: async (): Promise<Workflow[]> => {
    const response = await api.get<{ items: Workflow[] }>('/v1/workflows', {
      params: { project_id: PROJECT_ID },
    });
    return (response.data.items || []).map(normalizeWorkflow);
  },

  getById: async (id: string | number): Promise<Workflow> => {
    const response = await api.get<{ workflow: Workflow }>(`/v1/workflows/${id}`);
    const detail: any = response.data;
    const workflow = normalizeWorkflow(detail.workflow || detail);
    if (detail.history && Array.isArray(detail.history)) {
      workflow.history = detail.history.map((item: any) => ({
        ...item,
        details: item.details || item.details_json || {},
      }));
    }
    return workflow;
  },

  delete: async (id: string | number): Promise<void> => {
    await api.delete(`/api/workflows/${id}`);
  },

  getSteps: async (id: string | number): Promise<any[]> => {
    const response = await api.get<any[]>(`/api/workflows/${id}/steps`);
    return response.data;
  },

  // ============================================================================
  // Workflow Creation by Persona
  // ============================================================================

  createByPersona: async (data: { name: string; persona: string; version: string; description?: string }): Promise<any> => {
    // Use generic workflows endpoint
    const endpoint = '/v1/workflows';

    // Map persona to workflow_type format expected by backend
    const workflowTypeMap: Record<string, string> = {
      'business_analyst': 'Business Analyst',
      'developer': 'Developer',
      'reviewer': 'Reviewer',
      'complete': 'Complete',
      'Complete': 'Complete'
    };

    const payload = {
      project_id: PROJECT_ID,
      name: data.name,
      workflow_type: workflowTypeMap[data.persona] || 'Complete',
      description: data.description || '',
      psd_version: data.version || '1.0'
    };

    const response = await api.post(endpoint, payload);
    return normalizeWorkflow(response.data.workflow || response.data);
  },

  // ============================================================================
  // BA Workflow Step Execution (Manual)
  // ============================================================================

  executeDocumentParser: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/ba/workflows/${id}/steps/document-parser`, context || {});
    return response.data;
  },

  executeRegulatoryDiff: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/ba/workflows/${id}/steps/regulatory-diff`, context || {});
    return response.data;
  },

  executeDictionaryMapping: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/ba/workflows/${id}/steps/dictionary-mapping`, context || {});
    return response.data;
  },

  executeGapAnalysis: async (id: string, context?: any): Promise<any> => {
    const response = await api.post('/v1/gap-analysis/run', {
      project_id: PROJECT_ID,
      workflow_id: Number(id),
      ...context,
    });
    return response.data;
  },

  executeRequirementStructuring: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/ba/workflows/${id}/steps/requirement-structuring`, context || {});
    return response.data;
  },

  executeTestCaseGenerator: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/ba/workflows/${id}/steps/test-case-generator`, context || {});
    return response.data;
  },

  executeOntologyUpdate: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/ba/workflows/${id}/steps/ontology-update`, context || {});
    return response.data;
  },

  // BA Workflow Pause/Resume
  pauseBAWorkflow: async (id: string): Promise<any> => {
    const response = await api.post(`/api/ba/workflows/${id}/pause`);
    return response.data;
  },

  resumeBAWorkflow: async (id: string): Promise<any> => {
    const response = await api.post(`/api/ba/workflows/${id}/resume`);
    return response.data;
  },

  // ============================================================================
  // Developer Workflow Step Execution (Manual)
  // ============================================================================

  executeSchemaAnalyzer: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/developer/workflows/${id}/steps/schema-analyzer`, context || {});
    return response.data;
  },

  executeSQLGenerator: async (id: string, context?: any): Promise<any> => {
    const response = await api.post('/v1/sql/generate', {
      project_id: PROJECT_ID,
      workflow_id: Number(id),
      ...context,
    });
    return response.data;
  },

  executePythonETLGenerator: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/developer/workflows/${id}/steps/python-etl-generator`, context || {});
    return response.data;
  },

  executeLineageBuilder: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/developer/workflows/${id}/steps/lineage-builder`, context || {});
    return response.data;
  },

  executeDeterministicMapping: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/developer/workflows/${id}/steps/deterministic-mapping`, context || {});
    return response.data;
  },

  executeTestIntegration: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/developer/workflows/${id}/steps/test-integration`, context || {});
    return response.data;
  },

  // Developer Workflow Pause/Resume
  pauseDeveloperWorkflow: async (id: string): Promise<any> => {
    const response = await api.post(`/api/developer/workflows/${id}/pause`);
    return response.data;
  },

  resumeDeveloperWorkflow: async (id: string): Promise<any> => {
    const response = await api.post(`/api/developer/workflows/${id}/resume`);
    return response.data;
  },

  // ============================================================================
  // Analyst/Reviewer Workflow Step Execution (Manual)
  // ============================================================================

  executeValidation: async (id: string, context?: any): Promise<any> => {
    const response = await api.post('/v1/xml/validate', {
      project_id: PROJECT_ID,
      workflow_id: Number(id),
      ...context,
    });
    return response.data;
  },

  executeAnomalyDetection: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/analyst/workflows/${id}/steps/anomaly-detection`, context || {});
    return response.data;
  },

  executeVarianceExplanation: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/analyst/workflows/${id}/steps/variance-explanation`, context || {});
    return response.data;
  },

  executeCrossReportReconciliation: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/analyst/workflows/${id}/steps/cross-report-reconciliation`, context || {});
    return response.data;
  },

  executeAuditPackGenerator: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/analyst/workflows/${id}/steps/audit-pack-generator`, context || {});
    return response.data;
  },

  executePSDCSVGenerator: async (id: string, context?: any): Promise<any> => {
    const response = await api.post(`/api/analyst/workflows/${id}/steps/psd-csv-generator`, context || {});
    return response.data;
  },

  // Analyst/Reviewer Workflow Pause/Resume
  pauseReviewerWorkflow: async (id: string): Promise<any> => {
    const response = await api.post(`/api/analyst/workflows/${id}/pause`);
    return response.data;
  },

  resumeReviewerWorkflow: async (id: string): Promise<any> => {
    const response = await api.post(`/api/analyst/workflows/${id}/resume`);
    return response.data;
  },
};
