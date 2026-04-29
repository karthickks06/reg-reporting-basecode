/**
 * Workflow Stage Service
 *
 * API service for managing workflow stage operations:
 * - Get current stage information
 * - Submit stage to next persona
 * - Return stage for rework
 * - Validate stage completion
 * - Get stage transition history
 */

import api from '@/utils/axios';

// ============================================================================
// Types and Interfaces
// ============================================================================

export enum StageEnum {
  BUSINESS_ANALYST = 'business_analyst',
  DEVELOPER = 'developer',
  REVIEWER = 'reviewer',
}

export enum StageStatusEnum {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PENDING_SUBMISSION = 'pending_submission',
}

export enum TransitionTypeEnum {
  SUBMIT = 'submit',
  RETURN = 'return',
  APPROVE = 'approve',
}

export interface UserBasic {
  id: string;
  username: string;
  email: string;
  role_name?: string;
}

export interface StageProgress {
  steps_completed: number;
  total_steps: number;
  completion_percentage: number;
  completed?: number;
  total?: number;
}

export interface ValidationResult {
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  required_actions: string[];
}

export interface StageInfo {
  workflow_id: string;
  current_stage: StageEnum;
  stage_status: StageStatusEnum;
  stage?: StageEnum;
  status?: StageStatusEnum;
  current_assignee: UserBasic | null;
  stage_progress: StageProgress;
  can_submit: boolean;
  validation_results?: Record<string, any>;
}

export interface StageTransition {
  id: string;
  workflow_id: string;
  from_stage: string;
  to_stage: string;
  transition_type: string;
  transitioned_by: UserBasic;
  comments: string;
  validation_passed: boolean;
  validation_errors?: Record<string, any>;
  stage_artifacts: Record<string, any>;
  created_at: string;
}

export interface StageArtifacts {
  workflow_id: string;
  stage: string;
  artifacts: Record<string, any>;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_name: string;
  step_order: number;
  status: string;
  stage: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

// ============================================================================
// Request Types
// ============================================================================

export interface StageSubmitRequest {
  to_user_id: string;
  comments: string;
  attachment_urls?: string[];
}

export interface StageReturnRequest {
  to_stage: StageEnum;
  to_user_id: string;
  comments: string;
  issues_found: string[];
  attachment_urls?: string[];
}

// ============================================================================
// Response Types
// ============================================================================

export interface StageSubmitResponse {
  success: boolean;
  workflow_id: string;
  from_stage: string;
  to_stage: string;
  assigned_to?: string;
  transition_id: string;
  message: string;
}

export interface StageReturnResponse {
  success: boolean;
  workflow_id: string;
  from_stage: string;
  to_stage: string;
  assigned_to: string;
  transition_id: string;
  message: string;
}

// ============================================================================
// API Service Functions
// ============================================================================

/**
 * Get current stage information for a workflow
 */
export const getCurrentStage = async (workflowId: string): Promise<StageInfo> => {
  const response = await api.get(`/api/workflows/${workflowId}/current-stage`);
  return response.data;
};

/**
 * Get steps for a specific stage
 */
export const getStageSteps = async (
  workflowId: string,
  stageName: string
): Promise<WorkflowStep[]> => {
  const response = await api.get(
    `/api/workflows/${workflowId}/stages/${stageName}/steps`
  );
  return response.data;
};

/**
 * Get artifacts created in a specific stage
 */
export const getStageArtifacts = async (
  workflowId: string,
  stageName: string
): Promise<StageArtifacts> => {
  const response = await api.get(
    `/api/workflows/${workflowId}/stages/${stageName}/artifacts`
  );
  return response.data;
};

/**
 * Submit current stage to next persona
 */
export const submitStage = async (
  workflowId: string,
  request: StageSubmitRequest
): Promise<StageSubmitResponse> => {
  const response = await api.post(
    `/api/workflows/${workflowId}/stages/submit`,
    request
  );
  return response.data;
};

/**
 * Return workflow to previous stage for rework
 */
export const returnStage = async (
  workflowId: string,
  request: StageReturnRequest
): Promise<StageReturnResponse> => {
  const response = await api.post(
    `/api/workflows/${workflowId}/stages/return`,
    request
  );
  return response.data;
};

/**
 * Validate if a stage can be completed
 */
export const validateStage = async (
  workflowId: string,
  stageName: string
): Promise<ValidationResult> => {
  const response = await api.post(
    `/api/workflows/${workflowId}/stages/${stageName}/validate`
  );
  return response.data;
};

/**
 * Get complete stage transition history for a workflow
 */
export const getStageTransitions = async (
  workflowId: string
): Promise<StageTransition[]> => {
  const response = await api.get(
    `/api/workflows/${workflowId}/stage-transitions`
  );
  return response.data;
};

/**
 * Get workflows assigned to current user by stage
 */
export const getMyStageAssignments = async (stage?: string): Promise<any> => {
  const params = stage ? { stage } : {};
  const response = await api.get(`/api/workflows/my-stage-assignments`, {
    params,
  });
  return response.data;
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get display name for stage
 */
export const getStageDisplayName = (stage: string): string => {
  const stageNames: Record<string, string> = {
    business_analyst: 'Business Analyst',
    developer: 'Developer',
    reviewer: 'Reviewer',
  };
  return stageNames[stage] || stage;
};

/**
 * Get stage color for UI display
 */
export const getStageColor = (stage: string): string => {
  const colors: Record<string, string> = {
    business_analyst: 'blue',
    developer: 'green',
    reviewer: 'purple',
  };
  return colors[stage] || 'gray';
};

/**
 * Get stage status color
 */
export const getStageStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    not_started: 'gray',
    in_progress: 'blue',
    completed: 'green',
    pending_submission: 'yellow',
  };
  return colors[status] || 'gray';
};

/**
 * Check if user can submit stage
 */
export const canSubmitStage = (stageInfo: StageInfo): boolean => {
  return (
    stageInfo.can_submit &&
    stageInfo.stage_status !== StageStatusEnum.PENDING_SUBMISSION &&
    stageInfo.stage_status !== StageStatusEnum.COMPLETED
  );
};

/**
 * Get next stage in workflow
 */
export const getNextStage = (currentStage: StageEnum): StageEnum | null => {
  const stageOrder = [
    StageEnum.BUSINESS_ANALYST,
    StageEnum.DEVELOPER,
    StageEnum.REVIEWER,
  ];
  const currentIndex = stageOrder.indexOf(currentStage);
  if (currentIndex >= 0 && currentIndex < stageOrder.length - 1) {
    return stageOrder[currentIndex + 1];
  }
  return null; // Last stage
};

/**
 * Get previous stage in workflow
 */
export const getPreviousStage = (currentStage: StageEnum): StageEnum | null => {
  const stageOrder = [
    StageEnum.BUSINESS_ANALYST,
    StageEnum.DEVELOPER,
    StageEnum.REVIEWER,
  ];
  const currentIndex = stageOrder.indexOf(currentStage);
  if (currentIndex > 0) {
    return stageOrder[currentIndex - 1];
  }
  return null; // First stage
};

/**
 * Get completed stages from workflow
 */
export const getCompletedStages = (workflow: any): string[] => {
  const completed: string[] = [];
  if (workflow.ba_stage_completed_at) completed.push('business_analyst');
  if (workflow.developer_stage_completed_at) completed.push('developer');
  if (workflow.reviewer_stage_completed_at) completed.push('reviewer');
  return completed;
};

export default {
  getCurrentStage,
  getStageSteps,
  getStageArtifacts,
  submitStage,
  returnStage,
  validateStage,
  getStageTransitions,
  getMyStageAssignments,
  getStageDisplayName,
  getStageColor,
  getStageStatusColor,
  canSubmitStage,
  getNextStage,
  getPreviousStage,
  getCompletedStages,
};
