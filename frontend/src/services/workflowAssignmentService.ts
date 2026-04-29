/**
 * Workflow Assignment Service
 *
 * Handles API calls for workflow assignment system:
 * - Creating assignments
 * - Managing notifications
 * - Comments and discussions
 * - Assignment history
 */

import api from '@/utils/axios';

export interface WorkflowAssignment {
  id: string;
  workflow_id: string;
  assigned_from_user_id: string;
  assigned_to_user_id: string;
  assignment_type: 'forward' | 'reassign' | 'return';
  workflow_stage: 'business_analyst' | 'developer' | 'reviewer';
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'returned' | 'rejected';
  comments: string;
  attachment_urls?: string[];
  is_notification_read: boolean;
  created_at: string;
  updated_at: string;
  accepted_at?: string;
  completed_at?: string;
}

export interface AssignmentComment {
  id: string;
  assignment_id: string;
  user_id: string;
  comment_text: string;
  comment_type: 'general' | 'question' | 'concern' | 'approval' | 'rejection' | 'clarification';
  parent_comment_id?: string;
  attachment_urls?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateAssignmentRequest {
  workflow_id: string;
  assigned_to_user_id: string;
  assignment_type: 'forward' | 'reassign' | 'return';
  workflow_stage: 'business_analyst' | 'developer' | 'reviewer';
  comments: string;
  attachment_urls?: string[];
}

export interface UpdateAssignmentRequest {
  status: 'accepted' | 'in_progress' | 'completed' | 'returned' | 'rejected';
  comments?: string;
}

export interface CreateCommentRequest {
  comment_text: string;
  comment_type?: 'general' | 'question' | 'concern' | 'approval' | 'rejection' | 'clarification';
  parent_comment_id?: string;
  attachment_urls?: string[];
}

/**
 * Create a new workflow assignment
 */
export const createAssignment = async (data: CreateAssignmentRequest) => {
  const response = await api.post('/api/workflow-assignments', data);
  return response.data;
};

/**
 * Get all assignments for current user
 */
export const getMyAssignments = async (statusFilter?: string) => {
  const params = statusFilter ? { status_filter: statusFilter } : {};
  const response = await api.get('/api/workflow-assignments/my-assignments', { params });
  return response.data;
};

/**
 * Get pending assignments (unread notifications)
 */
export const getPendingAssignments = async () => {
  const response = await api.get('/api/workflow-assignments/my-pending-assignments');
  return response.data;
};

/**
 * Update assignment status
 */
export const updateAssignmentStatus = async (
  assignmentId: string,
  data: UpdateAssignmentRequest
) => {
  const response = await api.patch(`/api/workflow-assignments/${assignmentId}/status`, data);
  return response.data;
};

/**
 * Mark assignment notification as read
 */
export const markAssignmentRead = async (assignmentId: string) => {
  const response = await api.patch(`/api/workflow-assignments/${assignmentId}/mark-read`);
  return response.data;
};

/**
 * Add comment to assignment
 */
export const addComment = async (
  assignmentId: string,
  data: CreateCommentRequest
) => {
  const response = await api.post(`/api/workflow-assignments/${assignmentId}/comments`, data);
  return response.data;
};

/**
 * Get all comments for assignment
 */
export const getComments = async (assignmentId: string) => {
  const response = await api.get(`/api/workflow-assignments/${assignmentId}/comments`);
  return response.data;
};

/**
 * Get assignment history for workflow
 */
export const getAssignmentHistory = async (workflowId: string) => {
  const response = await api.get(`/api/workflow-assignments/workflow/${workflowId}/history`);
  return response.data;
};

export const completeWorkflow = async (
  workflowId: string,
  data: { comments: string; priority?: string }
) => {
  const response = await api.post(`/api/workflows/${workflowId}/stages/submit`, {
    to_user_id: '',
    comments: data.comments,
    priority: data.priority,
  });
  return response.data;
};

export const assignToStage = async (
  workflowId: string,
  data: { to_user_id: string | null; comments: string; priority?: string; stage: string }
) => {
  const response = await api.post(`/api/workflows/${workflowId}/stages/submit`, {
    to_user_id: data.to_user_id || '',
    comments: data.comments,
    priority: data.priority,
    stage: data.stage,
  });
  return response.data;
};

/**
 * Submit workflow to next stage
 */
export const submitWorkflow = async (
  workflowId: string,
  workflowType: 'ba' | 'developer' | 'reviewer' | 'analyst',
  data: {
    submission_comments: string;
    assigned_to_user_id?: string;
    action?: 'complete' | 'return';
    return_to_stage?: 'business_analyst' | 'developer';
  }
) => {
  const endpoint = `/api/workflows/${workflowId}/stages/${data.action === 'return' ? 'return' : 'submit'}`;

  // Transform data for analyst/reviewer workflow
  const submitData: any = { ...data };
  if (workflowType === 'analyst' || workflowType === 'reviewer') {
    // Convert action to approval_status for analyst API
    submitData.approval_status = data.action === 'complete' ? 'approved' : 'rejected';
    delete submitData.action;
  }

  const response = await api.post(endpoint, submitData);
  return response.data;
};

export default {
  createAssignment,
  getMyAssignments,
  getPendingAssignments,
  updateAssignmentStatus,
  markAssignmentRead,
  addComment,
  getComments,
  getAssignmentHistory,
  completeWorkflow,
  assignToStage,
  submitWorkflow,
};
