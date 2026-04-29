/**
 * Unified Workflow Service
 *
 * Consolidates common workflow operations across BA, Developer, and Analyst workflows.
 * Reduces code duplication by providing reusable service methods.
 */

import axios from '@/utils/axios';

export type WorkflowType = 'business_analyst' | 'developer' | 'analyst';

interface WorkflowCreateParams {
  workflow_name: string;
  description?: string;
  version?: string;
}

interface StepExecutionParams {
  [key: string]: any;
}

class UnifiedWorkflowService {
  private getBaseUrl(workflowType: WorkflowType): string {
    const urls: Record<WorkflowType, string> = {
      'business_analyst': '/ba-workflows',
      'developer': '/developer-workflows',
      'analyst': '/analyst-workflows'
    };
    return urls[workflowType];
  }

  // ============================================================================
  // Workflow Management
  // ============================================================================

  async createWorkflow(
    workflowType: WorkflowType,
    params: WorkflowCreateParams
  ) {
    const baseUrl = this.getBaseUrl(workflowType);
    const response = await axios.post(`${baseUrl}/create`, params);
    return response.data;
  }

  async getWorkflow(workflowType: WorkflowType, workflowId: string) {
    const baseUrl = this.getBaseUrl(workflowType);
    const response = await axios.get(`${baseUrl}/${workflowId}`);
    return response.data;
  }

  async listWorkflows(workflowType: WorkflowType, skip = 0, limit = 100) {
    const baseUrl = this.getBaseUrl(workflowType);
    const response = await axios.get(`${baseUrl}/`, { params: { skip, limit } });
    return response.data;
  }

  async deleteWorkflow(workflowType: WorkflowType, workflowId: string) {
    const baseUrl = this.getBaseUrl(workflowType);
    const response = await axios.delete(`${baseUrl}/${workflowId}`);
    return response.data;
  }

  // ============================================================================
  // Step Execution
  // ============================================================================

  async executeStep(
    workflowType: WorkflowType,
    workflowId: string,
    stepName: string,
    params: StepExecutionParams
  ) {
    const baseUrl = this.getBaseUrl(workflowType);
    const endpoint = this.getStepEndpoint(stepName);
    const response = await axios.post(
      `${baseUrl}/${workflowId}${endpoint}`,
      params
    );
    return response.data;
  }

  private getStepEndpoint(stepName: string): string {
    const endpointMap: Record<string, string> = {
      // BA Workflow Steps
      'Select Documents': '/step1-document-parser',
      'Comparison': '/step2-regulatory-diff',
      'Field Mapping': '/step3-dictionary-mapping',
      'Functional Specification': '/step4-gap-analysis',
      'Test Case Generator': '/step6-test-case-generator',
      'Ontology Update': '/step7-ontology-update',

      // Developer Workflow Steps
      'Schema Analyzer': '/step1-schema-analyzer',
      'SQL Generator': '/step2-sql-generator',
      'Python ETL Generator': '/step3-python-etl-generator',
      'Deterministic Mapping': '/step4-deterministic-mapping',
      'Test Integration': '/step5-test-integration',

      // Analyst Workflow Steps
      'Validation': '/step1-validation',
      'Anomaly Detection': '/step2-anomaly-detection',
      'Variance Explanation': '/step3-variance-explanation',
      'Cross-Report Reconciliation': '/step4-cross-report-reconciliation',
      'Audit Pack Generator': '/step5-audit-pack-generator',
      'PSD CSV Generator': '/step6-psd-csv-generator'
    };

    return endpointMap[stepName] || '/step';
  }

  // ============================================================================
  // Results Retrieval
  // ============================================================================

  async getStepResult(
    workflowType: WorkflowType,
    workflowId: string,
    stepName: string
  ) {
    const baseUrl = this.getBaseUrl(workflowType);
    const endpoint = this.getStepResultEndpoint(stepName);
    const response = await axios.get(`${baseUrl}/${workflowId}${endpoint}`);
    return response.data;
  }

  private getStepResultEndpoint(stepName: string): string {
    const endpointMap: Record<string, string> = {
      // BA Workflow Results
      'Select Documents': '/parsed-results',
      'Comparison': '/comparison-results',
      'Field Mapping': '/dictionary-mapping-results',
      'Functional Specification': '/gap-analysis-results',
      'Test Case Generator': '/test-case-results',
      'Ontology Update': '/ontology-results',

      // Developer Workflow Results
      'Schema Analyzer': '/schema-analysis-results',
      'SQL Generator': '/sql-generation-results',
      'Python ETL Generator': '/etl-generation-results',
      'Deterministic Mapping': '/xsd-xml-results',
      'Test Integration': '/test-integration-results',

      // Analyst Workflow Results
      'Validation': '/validation-results',
      'Anomaly Detection': '/anomaly-detection-results',
      'Variance Explanation': '/variance-explanation-results',
      'Cross-Report Reconciliation': '/reconciliation-results',
      'Audit Pack Generator': '/audit-pack-results',
      'PSD CSV Generator': '/psd-csv-results'
    };

    return endpointMap[stepName] || '/results';
  }

  async getWorkflowHistory(workflowType: WorkflowType, workflowId: string) {
    const baseUrl = this.getBaseUrl(workflowType);
    const response = await axios.get(`${baseUrl}/${workflowId}/history`);
    return response.data;
  }

  // ============================================================================
  // Report Operations (BA Workflow specific)
  // ============================================================================

  async downloadGapAnalysisReport(workflowId: string) {
    const response = await axios.get(
      `/ba-workflows/${workflowId}/gap-analysis/download`,
      { responseType: 'blob' }
    );
    return response.data;
  }

  async publishReport(workflowId: string, title: string, description: string) {
    const response = await axios.post(
      `/ba-workflows/${workflowId}/gap-analysis/publish`,
      { title, description }
    );
    return response.data;
  }

  // ============================================================================
  // Workflow Assignment (Review/Submit)
  // ============================================================================

  async submitWorkflow(
    workflowId: string,
    action: 'complete' | 'return',
    params: {
      comments?: string;
      assigned_to_user_id?: string;
      return_to_stage?: string;
    }
  ) {
    const response = await axios.post(`/api/workflows/${workflowId}/stages/${action === 'return' ? 'return' : 'submit'}`, params);
    return response.data;
  }

  async getWorkflowAssignments(userId: string, status?: string) {
    const response = await axios.get('/api/workflow-assignments/my-assignments', {
      params: { user_id: userId, status }
    });
    return response.data;
  }

  // ============================================================================
  // Resume Workflow
  // ============================================================================

  async resumeWorkflow(
    workflowType: WorkflowType,
    workflowId: string,
    fromStep: number
  ) {
    const baseUrl = this.getBaseUrl(workflowType);
    const response = await axios.post(`${baseUrl}/${workflowId}/resume`, {
      from_step: fromStep
    });
    return response.data;
  }
}

export const unifiedWorkflowService = new UnifiedWorkflowService();
export default unifiedWorkflowService;
