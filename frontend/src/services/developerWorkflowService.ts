/**
 * Developer Workflow Service
 *
 * API service layer for Developer workflow management.
 * Handles end-to-end development workflows: schema analysis, SQL generation, ETL creation, and lineage mapping.
 */

import axios from '@/utils/axios';

const BASE_URL = '/developer-workflows';

// ============================================================================
// Types
// ============================================================================

export interface DeveloperWorkflowCreate {
  session_name: string;
  description?: string;
  requirements: string[];
  source_schemas: Record<string, any>[];
  target_schemas: Record<string, any>[];
  llm_config_id: string;
  validation_mode?: 'strict' | 'permissive';
}

export interface DeveloperWorkflowSession {
  id: string;
  session_name: string;
  description?: string;
  requirements: string[];
  source_schemas: Record<string, any>[];
  target_schemas: Record<string, any>[];
  llm_config_id: string;
  validation_mode: string;
  status: 'pending' | 'analyzing' | 'generating_sql' | 'creating_etl' | 'mapping_lineage' | 'completed' | 'failed';
  progress_percentage: number;
  current_step?: string;
  steps_completed: number;
  total_steps: number;
  tokens_used: number;
  started_at?: string;
  completed_at?: string;
  execution_time_ms?: number;
  error_message?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DeveloperWorkflowStatus {
  session_id: string;
  status: string;
  progress_percentage: number;
  current_step?: string;
  steps_completed: number;
  total_steps: number;
  tokens_used: number;
  started_at?: string;
  completed_at?: string;
  execution_time_ms?: number;
  error_message?: string;
}

export interface SchemaAnalysisResult {
  source_tables_count: number;
  target_tables_count: number;
  total_columns: number;
  data_types_identified: string[];
  relationships_found: number;
  complexity_score?: number;
  recommendations?: string[];
}

export interface SQLArtifact {
  name: string;
  type: string;
  query: string;
  description?: string;
}

export interface ETLArtifact {
  name: string;
  type: string;
  code: string;
  language: string;
  description?: string;
}

export interface LineageNode {
  id: string;
  name: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface LineageRelationship {
  source: string;
  target: string;
  type: string;
  metadata?: Record<string, any>;
}

export interface LineageGraph {
  nodes: LineageNode[];
  relationships: LineageRelationship[];
  metadata?: Record<string, any>;
}

export interface Mapping {
  source_field: string;
  target_field: string;
  transformation?: string;
  validation_rule?: string;
}

export interface TestIntegrationResult {
  test_cases_generated: number;
  coverage_percentage?: number;
  critical_paths_tested: number;
  recommendations?: string[];
}

export interface ExecutionSummary {
  total_artifacts_created: number;
  sql_queries_generated: number;
  etl_pipelines_created: number;
  mappings_count: number;
  lineage_nodes_count: number;
  test_coverage: number;
}

export interface DeveloperWorkflowResults {
  session_id: string;
  schema_analysis: SchemaAnalysisResult;
  sql_artifacts: SQLArtifact[];
  etl_artifacts: ETLArtifact[];
  lineage_graph: LineageGraph;
  mappings: Mapping[];
  test_integration: TestIntegrationResult;
  execution_summary: ExecutionSummary;
  created_at: string;
}

export interface DeveloperWorkflowExecuteResponse {
  session_id: string;
  status: string;
  message: string;
}

// ============================================================================
// Service
// ============================================================================

/**
 * Developer Workflow Service
 *
 * Provides methods for interacting with Developer workflow API endpoints.
 */
export const developerWorkflowService = {
  /**
   * Create a simple Developer workflow (unified creation)
   *
   * @param data - Simple workflow creation data
   * @returns Created workflow
   */
  createSimpleWorkflow: async (data: {
    workflow_name: string;
    description?: string;
    version?: string;
  }): Promise<{ id: string; workflow_name: string; status: string }> => {
    const response = await axios.post(`${BASE_URL}/simple`, data);
    return response.data;
  },

  /**
   * Create a new Developer workflow session
   *
   * @param data - Session creation data
   * @returns Created session
   */
  createSession: async (data: DeveloperWorkflowCreate): Promise<DeveloperWorkflowSession> => {
    const response = await axios.post<DeveloperWorkflowSession>(`${BASE_URL}/sessions`, data);
    return response.data;
  },

  /**
   * Get Developer workflow session by ID
   *
   * @param sessionId - Session UUID
   * @returns Session details
   */
  getSession: async (sessionId: string): Promise<DeveloperWorkflowSession> => {
    const response = await axios.get<DeveloperWorkflowSession>(`${BASE_URL}/sessions/${sessionId}`);
    return response.data;
  },

  /**
   * List Developer workflow sessions
   *
   * @param params - Query parameters
   * @returns List of sessions
   */
  listSessions: async (params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<DeveloperWorkflowSession[]> => {
    const response = await axios.get<DeveloperWorkflowSession[]>(`${BASE_URL}/sessions`, { params });
    return response.data;
  },

  /**
   * Delete Developer workflow session
   *
   * @param sessionId - Session UUID
   */
  deleteSession: async (sessionId: string): Promise<void> => {
    await axios.delete(`${BASE_URL}/sessions/${sessionId}`);
  },

  /**
   * Execute Developer workflow
   *
   * Starts workflow execution in background.
   * Use getStatus() to poll for progress.
   *
   * @param sessionId - Session UUID
   * @returns Execution response
   */
  executeWorkflow: async (sessionId: string): Promise<DeveloperWorkflowExecuteResponse> => {
    const response = await axios.post<DeveloperWorkflowExecuteResponse>(
      `${BASE_URL}/sessions/${sessionId}/execute`
    );
    return response.data;
  },

  /**
   * Get workflow execution status
   *
   * Poll this endpoint to track workflow progress.
   *
   * @param sessionId - Session UUID
   * @returns Status with progress
   */
  getStatus: async (sessionId: string): Promise<DeveloperWorkflowStatus> => {
    const response = await axios.get<DeveloperWorkflowStatus>(`${BASE_URL}/sessions/${sessionId}/status`);
    return response.data;
  },

  /**
   * Get complete workflow results
   *
   * Returns all results: schema analysis, SQL artifacts, ETL pipelines, lineage, mappings, and tests.
   *
   * @param sessionId - Session UUID
   * @returns Complete results
   */
  getResults: async (sessionId: string): Promise<DeveloperWorkflowResults> => {
    const response = await axios.get<DeveloperWorkflowResults>(
      `${BASE_URL}/sessions/${sessionId}/results`
    );
    return response.data;
  },

  /**
   * Download SQL artifacts as a zip file
   *
   * @param sessionId - Session UUID
   * @returns Blob for download
   */
  downloadSQLArtifacts: async (sessionId: string): Promise<Blob> => {
    const response = await axios.get(`${BASE_URL}/sessions/${sessionId}/artifacts/sql`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Download ETL artifacts as a zip file
   *
   * @param sessionId - Session UUID
   * @returns Blob for download
   */
  downloadETLArtifacts: async (sessionId: string): Promise<Blob> => {
    const response = await axios.get(`${BASE_URL}/sessions/${sessionId}/artifacts/etl`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Download lineage graph as JSON
   *
   * @param sessionId - Session UUID
   * @returns Blob for download
   */
  downloadLineageGraph: async (sessionId: string): Promise<Blob> => {
    const response = await axios.get(`${BASE_URL}/sessions/${sessionId}/artifacts/lineage`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Download mappings as JSON
   *
   * @param sessionId - Session UUID
   * @returns Blob for download
   */
  downloadMappings: async (sessionId: string): Promise<Blob> => {
    const response = await axios.get(`${BASE_URL}/sessions/${sessionId}/artifacts/mappings`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /**
   * Poll workflow status until completion
   *
   * Utility method that polls status every 3 seconds until workflow completes.
   *
   * @param sessionId - Session UUID
   * @param onProgress - Callback for progress updates
   * @returns Final status
   */
  pollUntilComplete: async (
    sessionId: string,
    onProgress?: (status: DeveloperWorkflowStatus) => void
  ): Promise<DeveloperWorkflowStatus> => {
    const poll = async (): Promise<DeveloperWorkflowStatus> => {
      const status = await developerWorkflowService.getStatus(sessionId);

      if (onProgress) {
        onProgress(status);
      }

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      // Wait 3 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return poll();
    };

    return poll();
  },

  // ============================================================================
  // CSV Upload & Validation
  // ============================================================================

  /**
   * Upload CSV file (actual or expected data)
   *
   * @param workflowId - Workflow UUID
   * @param file - CSV file to upload
   * @param fileType - 'actual' or 'expected'
   * @param description - Optional file description
   * @returns Upload result with metadata
   */
  uploadCSVFile: async (
    workflowId: string,
    file: File,
    fileType: 'actual' | 'expected',
    description?: string
  ): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', fileType);
    if (description) formData.append('description', description);

    const response = await axios.post(
      `/api/developer/workflows/${workflowId}/upload-csv`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    );
    return response.data;
  },

  /**
   * List all CSV files for a workflow
   *
   * @param workflowId - Workflow UUID
   * @returns List of CSV files with metadata
   */
  listCSVFiles: async (workflowId: string): Promise<any[]> => {
    const response = await axios.get(`/api/developer/workflows/${workflowId}/csv-files`);
    return response.data.files;
  },

  /**
   * Get CSV file details
   *
   * @param workflowId - Workflow UUID
   * @param fileId - File UUID
   * @returns File details with preview
   */
  getCSVFile: async (workflowId: string, fileId: string): Promise<any> => {
    const response = await axios.get(
      `/api/developer/workflows/${workflowId}/csv-files/${fileId}`
    );
    return response.data;
  },

  /**
   * Download CSV file
   *
   * @param workflowId - Workflow UUID
   * @param fileId - File UUID
   * @returns File blob
   */
  downloadCSVFile: async (workflowId: string, fileId: string): Promise<Blob> => {
    const response = await axios.get(
      `/api/developer/workflows/${workflowId}/csv-files/${fileId}/download`,
      { responseType: 'blob' }
    );
    return response.data;
  },

  /**
   * Delete CSV file
   *
   * @param workflowId - Workflow UUID
   * @param fileId - File UUID
   */
  deleteCSVFile: async (workflowId: string, fileId: string): Promise<void> => {
    await axios.delete(`/api/developer/workflows/${workflowId}/csv-files/${fileId}`);
  },

  /**
   * Validate actual vs expected CSV data
   *
   * @param workflowId - Workflow UUID
   * @param actualFileId - Actual data file UUID
   * @param expectedFileId - Expected data file UUID
   * @returns Validation results with quality score
   */
  validateCSVData: async (
    workflowId: string,
    actualFileId: string,
    expectedFileId: string
  ): Promise<any> => {
    const response = await axios.post(
      `/api/developer/workflows/${workflowId}/validate-csv`,
      null,
      {
        params: {
          actual_file_id: actualFileId,
          expected_file_id: expectedFileId
        }
      }
    );
    return response.data;
  },

  // ============================================================================
  // Quality Gate Validation
  // ============================================================================

  /**
   * Run quality gate checks on workflow
   *
   * Validates all SQL scripts and CSV data
   *
   * @param workflowId - Workflow UUID
   * @param checkLevel - Validation level ('basic' | 'standard' | 'strict')
   * @returns Quality gate results with score and findings
   */
  runQualityGate: async (
    workflowId: string,
    checkLevel: 'basic' | 'standard' | 'strict' = 'standard'
  ): Promise<any> => {
    const response = await axios.post(
      `/api/developer/workflows/${workflowId}/quality-gate`,
      null,
      { params: { check_level: checkLevel } }
    );
    return response.data;
  },

  /**
   * Analyze SQL script complexity
   *
   * @param sqlScriptId - SQL script UUID
   * @returns Complexity metrics and recommendations
   */
  analyzeSQLComplexity: async (sqlScriptId: string): Promise<any> => {
    const response = await axios.get(
      `/api/developer/sql/${sqlScriptId}/complexity-analysis`
    );
    return response.data;
  },

  /**
   * Validate single SQL script
   *
   * @param sqlScriptId - SQL script UUID
   * @param validationLevel - Validation level ('basic' | 'standard' | 'strict')
   * @returns Validation results with findings
   */
  validateSQLScript: async (
    sqlScriptId: string,
    validationLevel: 'basic' | 'standard' | 'strict' = 'standard'
  ): Promise<any> => {
    const response = await axios.post(
      `/api/developer/sql/${sqlScriptId}/validate`,
      null,
      { params: { validation_level: validationLevel } }
    );
    return response.data;
  },

  // ============================================================================
  // Job Management
  // ============================================================================

  /**
   * Get job status
   *
   * @param jobId - Job UUID
   * @returns Job status with progress
   */
  getJobStatus: async (jobId: string): Promise<any> => {
    const response = await axios.get(`/api/tasks/status/${jobId}`);
    return response.data;
  },

  /**
   * Cancel running job
   *
   * @param jobId - Job UUID
   */
  cancelJob: async (jobId: string): Promise<void> => {
    await axios.post(`/api/tasks/${jobId}/cancel`);
  },

  /**
   * Retry failed job
   *
   * @param jobId - Job UUID
   * @returns New job information
   */
  retryJob: async (jobId: string): Promise<any> => {
    const response = await axios.post(`/api/tasks/${jobId}/retry`);
    return response.data;
  },
};

export default developerWorkflowService;
