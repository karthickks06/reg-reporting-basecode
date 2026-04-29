/**
 * Workflow Management Types
 *
 * TypeScript interfaces for workflow management system.
 * These types match the backend Pydantic schemas.
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum WorkflowType {
  BUSINESS_ANALYST = 'Business Analyst',
  DEVELOPER = 'Developer',
  REVIEWER = 'Reviewer',
  COMPLETE = 'Complete'
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum StepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped'
}

export enum AssignmentType {
  FORWARD = 'forward',
  REVERSE = 'reverse'
}

// ============================================================================
// BASIC USER TYPE
// ============================================================================

export interface UserBasic {
  id: string;
  username: string;
  email: string;
  full_name?: string;
}

// ============================================================================
// WORKFLOW STEP TYPES
// ============================================================================

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_name: string;
  step_order: number;
  status: StepStatus | string;
  stage?: string;  // Multi-stage support: business_analyst, developer, reviewer
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface WorkflowStepUpdate {
  status: StepStatus | string;
}

// ============================================================================
// WORKFLOW ASSIGNMENT TYPES
// ============================================================================

export interface WorkflowAssignment {
  id: string;
  workflow_id: string;
  from_user?: UserBasic;
  to_user?: UserBasic;
  assignment_type: AssignmentType | string;
  comments?: string;
  created_at: string;
}

export interface WorkflowAssignmentCreate {
  to_user_id: string;
  assignment_type: AssignmentType | string;
  comments?: string;
}

// ============================================================================
// WORKFLOW HISTORY TYPES
// ============================================================================

export interface WorkflowHistory {
  id: string;
  workflow_id: string;
  user?: UserBasic;
  action: string;
  details?: Record<string, any>;
  created_at: string;
}

// ============================================================================
// WORKFLOW TYPES
// ============================================================================

export interface Workflow {
  id: string;
  workflow_id: string;  // Format: WF-{UUID}
  workflow_name: string;
  workflow_type: WorkflowType | string;
  description?: string;
  version?: string;
  status: WorkflowStatus | string;
  created_by: string;
  creator?: UserBasic;
  current_assignee?: string;
  assignee?: UserBasic;
  created_at: string;
  updated_at: string;
  steps?: WorkflowStep[];
  assignments?: WorkflowAssignment[];
  history?: WorkflowHistory[];

  // Multi-stage workflow fields
  current_stage?: string;
  stage_status?: string;
  ba_assignee_id?: string;
  ba_assignee?: UserBasic | null;
  developer_assignee_id?: string;
  developer_assignee?: UserBasic | null;
  reviewer_assignee_id?: string;
  reviewer_assignee?: UserBasic | null;
  ba_stage_completed_at?: string | null;
  developer_stage_completed_at?: string | null;
  reviewer_stage_completed_at?: string | null;
  current_step_index?: number;
  steps_completed?: number;
  total_steps?: number;
  stage_progress?: {
    steps_completed: number;
    total_steps: number;
    completion_percentage: number;
    completed?: number;
    total?: number;
  };
  is_submitted?: boolean;
}

export interface WorkflowListItem {
  id: string;
  workflow_id: string;  // Format: WF-{UUID}
  workflow_name: string;
  workflow_type: WorkflowType | string;
  description?: string;
  version?: string;
  status: WorkflowStatus | string;
  created_by: string;
  creator?: UserBasic;
  current_assignee?: string;
  assignee?: UserBasic;
  created_at: string;
  updated_at: string;
  steps_completed: number;
  total_steps: number;

  // Multi-stage workflow fields
  current_stage?: string;
  stage_status?: string;
  ba_assignee?: UserBasic | null;
  developer_assignee?: UserBasic | null;
  reviewer_assignee?: UserBasic | null;
  ba_stage_completed_at?: string | null;
  developer_stage_completed_at?: string | null;
  reviewer_stage_completed_at?: string | null;
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface WorkflowCreate {
  workflow_name: string;
  workflow_type: WorkflowType | string;
  description?: string;
  version?: string;
}

export interface WorkflowUpdate {
  workflow_name?: string;
  description?: string;
  version?: string;
  status?: WorkflowStatus | string;
}

// ============================================================================
// HELPER TYPES
// ============================================================================

export interface WorkflowTypeOption {
  value: WorkflowType | string;
  label: string;
  description: string;
}

export interface WorkflowStatusBadge {
  status: WorkflowStatus | string;
  label: string;
  className: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

export const WORKFLOW_TYPE_OPTIONS: WorkflowTypeOption[] = [
  {
    value: WorkflowType.BUSINESS_ANALYST,
    label: 'Business Analyst',
    description: 'BA analysis workflow with document processing and requirements extraction'
  },
  {
    value: WorkflowType.DEVELOPER,
    label: 'Developer',
    description: 'Developer workflow with SQL/ETL generation and schema mapping'
  },
  {
    value: WorkflowType.REVIEWER,
    label: 'Reviewer',
    description: 'Reporting workflow with validation, reconciliation, and publishing'
  },
  {
    value: WorkflowType.COMPLETE,
    label: 'Complete',
    description: 'End-to-end workflow from BA → Developer → Reviewer (Admin only)'
  }
];

export const WORKFLOW_STATUS_CONFIG: Record<string, WorkflowStatusBadge> = {
  draft: {
    status: WorkflowStatus.DRAFT,
    label: 'Draft',
    className: 'workflow-badge-draft'
  },
  in_progress: {
    status: WorkflowStatus.IN_PROGRESS,
    label: 'In Progress',
    className: 'workflow-badge-in-progress'
  },
  completed: {
    status: WorkflowStatus.COMPLETED,
    label: 'Completed',
    className: 'workflow-badge-completed'
  },
  cancelled: {
    status: WorkflowStatus.CANCELLED,
    label: 'Cancelled',
    className: 'workflow-badge-cancelled'
  }
};

export const STEP_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'step-badge-pending'
  },
  in_progress: {
    label: 'In Progress',
    className: 'step-badge-in-progress'
  },
  completed: {
    label: 'Completed',
    className: 'step-badge-completed'
  },
  skipped: {
    label: 'Skipped',
    className: 'step-badge-skipped'
  }
};

// ============================================================================
// ROLE PERMISSIONS
// ============================================================================

export const ROLE_WORKFLOW_TYPES: Record<string, (WorkflowType | string)[]> = {
  'Super User': [
    WorkflowType.BUSINESS_ANALYST,
    WorkflowType.DEVELOPER,
    WorkflowType.REVIEWER,
    WorkflowType.COMPLETE
  ],
  'Admin': [
    WorkflowType.BUSINESS_ANALYST,
    WorkflowType.DEVELOPER,
    WorkflowType.REVIEWER,
    WorkflowType.COMPLETE
  ],
  'Regulatory Business Analyst': [WorkflowType.BUSINESS_ANALYST],
  'Data Engineer/Developer': [WorkflowType.DEVELOPER],
  'Regulatory Reporting Analyst': [WorkflowType.REVIEWER]
};

/**
 * Get allowed workflow types for a given role
 * Super User has same permissions as Admin - can create all workflow types
 */
export function getAllowedWorkflowTypes(roleName?: string): WorkflowTypeOption[] {
  // Super User has unrestricted access - return all workflow types
  if (!roleName || roleName === 'Super User') return WORKFLOW_TYPE_OPTIONS;

  const allowedTypes = ROLE_WORKFLOW_TYPES[roleName] || [];
  return WORKFLOW_TYPE_OPTIONS.filter(option => allowedTypes.indexOf(option.value) !== -1);
}

/**
 * Check if a role can create a specific workflow type
 * Super User has same permissions as Admin - can create all types
 */
export function canCreateWorkflowType(roleName?: string, workflowType?: string): boolean {
  // Super User has unrestricted access - can create any workflow type
  if (!roleName || roleName === 'Super User') return true;

  if (!workflowType) return false;

  const allowedTypes = ROLE_WORKFLOW_TYPES[roleName] || [];
  return allowedTypes.indexOf(workflowType) !== -1;
}

/**
 * Get status badge configuration
 */
export function getStatusBadge(status: string): WorkflowStatusBadge {
  return WORKFLOW_STATUS_CONFIG[status] || {
    status,
    label: status,
    className: 'workflow-badge-default'
  };
}

/**
 * Get step status badge configuration
 */
export function getStepStatusBadge(status: string): { label: string; className: string } {
  return STEP_STATUS_CONFIG[status] || {
    label: status,
    className: 'step-badge-default'
  };
}

/**
 * Calculate workflow progress percentage
 */
export function calculateProgress(stepsCompleted: number, totalSteps: number): number {
  if (totalSteps === 0) return 0;
  return Math.round((stepsCompleted / totalSteps) * 100);
}

/**
 * Format workflow type for display
 */
export function formatWorkflowType(type: string): string {
  for (let i = 0; i < WORKFLOW_TYPE_OPTIONS.length; i++) {
    if (WORKFLOW_TYPE_OPTIONS[i].value === type) {
      return WORKFLOW_TYPE_OPTIONS[i].label;
    }
  }
  return type;
}

// ============================================================================
// WORKFLOW SESSION TYPES (Full Automated Execution)
// ============================================================================

/**
 * BA Workflow Session Types
 */
export interface BAWorkflowSession {
  id: string;
  session_name: string;
  description?: string;
  source_document_id: string;
  target_document_id: string;
  llm_config_id: string;
  comparison_mode: 'document' | 'datamodel';
  report_format: 'markdown' | 'json';
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface BASessionCreate {
  session_name: string;
  description?: string;
  source_document_id: string;
  target_document_id: string;
  llm_config_id: string;
  comparison_mode: 'document' | 'datamodel';
  report_format?: 'markdown' | 'json';
}

export interface BASessionStatus {
  session_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step?: string;
  progress?: number;
  total_steps?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface BASessionResults {
  session_id: string;
  parser_results?: any;
  diff_results?: any;
  gap_results?: any;
  requirement_results?: any;
  test_case_results?: any;
  ontology_results?: any;
  gap_report_url?: string;
}

/**
 * Developer Workflow Session Types
 */
export interface DeveloperWorkflowSession {
  id: string;
  session_name: string;
  description?: string;
  ba_package_id?: string;
  requirements?: string;
  llm_config_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface DeveloperSessionCreate {
  session_name: string;
  description?: string;
  ba_package_id?: string;
  requirements?: string;
  llm_config_id: string;
}

export interface DeveloperSessionStatus {
  session_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step?: string;
  progress?: number;
  total_steps?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface DeveloperSessionResults {
  session_id: string;
  schema_results?: any;
  sql_results?: any;
  etl_results?: any;
  lineage_results?: any;
  mapping_results?: any;
  test_results?: any;
}

/**
 * Analyst Workflow Session Types
 */
export interface AnalystWorkflowSession {
  id: string;
  session_name: string;
  description?: string;
  source_data_id?: string;
  validation_rules?: any;
  llm_config_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface AnalystSessionCreate {
  session_name: string;
  description?: string;
  source_data_id?: string;
  validation_rules?: any;
  llm_config_id: string;
}

export interface AnalystSessionStatus {
  session_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  current_step?: string;
  progress?: number;
  total_steps?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface AnalystSessionResults {
  session_id: string;
  validation_results?: any;
  anomaly_results?: any;
  variance_results?: any;
  reconciliation_results?: any;
  audit_pack_results?: any;
  psd_csv_results?: any;
}
