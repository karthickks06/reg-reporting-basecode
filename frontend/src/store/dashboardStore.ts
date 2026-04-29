/**
 * Dashboard Store - Zustand State Management
 *
 * Manages personal dashboard data including:
 * - User's assigned workflows
 * - Quick statistics
 * - Recent activity
 * - Priority workflows
 */

import { create } from 'zustand';
import { Workflow } from '@/types';
import api from '@/utils/axios';

interface DashboardStats {
  totalWorkflows: number;
  inProgress: number;
  completedThisWeek: number;
  awaitingAction: number;
  avgCompletionDays: number;
}

interface DashboardState {
  // Workflows
  myWorkflows: Workflow[];
  highPriorityWorkflows: Workflow[];
  recentlyAssigned: Workflow[];

  // Stats
  stats: DashboardStats | null;

  // Loading states
  isLoading: boolean;
  isLoadingStats: boolean;

  // Actions
  fetchMyWorkflows: () => Promise<void>;
  fetchDashboardStats: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  clearDashboard: () => void;
}

const defaultStats: DashboardStats = {
  totalWorkflows: 0,
  inProgress: 0,
  completedThisWeek: 0,
  awaitingAction: 0,
  avgCompletionDays: 0,
};

// Create store with optimized selectors
const useDashboardStoreBase = create<DashboardState>((set, get) => ({
  // Initial state
  myWorkflows: [],
  highPriorityWorkflows: [],
  recentlyAssigned: [],
  stats: null,
  isLoading: false,
  isLoadingStats: false,

  // Fetch user's assigned workflows
  fetchMyWorkflows: async () => {
    set({ isLoading: true });
    try {
      const response = await api.get('/api/dashboard/my-tasks');
      const data = response.data;

      // Separate workflows by priority and recency
      const highPriority = data.filter((w: Workflow) =>
        w.status === 'in_progress' && isHighPriority(w)
      );

      const recent = data
        .sort((a: Workflow, b: Workflow) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        )
        .slice(0, 5);

      set({
        myWorkflows: data,
        highPriorityWorkflows: highPriority,
        recentlyAssigned: recent,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error fetching workflows:', error);
      set({ isLoading: false });
    }
  },

  // Fetch dashboard statistics
  fetchDashboardStats: async () => {
    set({ isLoadingStats: true });
    try {
      const response = await api.get('/api/dashboard/my-stats');
      const stats = response.data;
      set({ stats, isLoadingStats: false });
    } catch (error) {
      console.error('Error fetching stats:', error);
      set({ stats: defaultStats, isLoadingStats: false });
    }
  },

  // Refresh entire dashboard
  refreshDashboard: async () => {
    await Promise.all([
      get().fetchMyWorkflows(),
      get().fetchDashboardStats(),
    ]);
  },

  // Clear dashboard data
  clearDashboard: () => {
    set({
      myWorkflows: [],
      highPriorityWorkflows: [],
      recentlyAssigned: [],
      stats: null,
    });
  },
}));

// Helper function to determine if workflow is high priority
function isHighPriority(workflow: Workflow): boolean {
  // Check if workflow has "high" or "urgent" in description or name
  const text = `${workflow.workflow_name} ${workflow.description || ''}`.toLowerCase();
  if (text.includes('urgent') || text.includes('high priority') || text.includes('critical')) {
    return true;
  }

  // Check if recently created (within 3 days) and in progress
  const daysSinceCreation = (Date.now() - new Date(workflow.created_at).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceCreation <= 3 && workflow.status === 'in_progress') {
    return true;
  }

  return false;
}

// Export base store
export const useDashboardStore = useDashboardStoreBase;

// Optimized selectors to prevent unnecessary re-renders
// Use these in components instead of accessing the whole store
export const selectMyWorkflows = (state: DashboardState) => state.myWorkflows;
export const selectHighPriorityWorkflows = (state: DashboardState) => state.highPriorityWorkflows;
export const selectRecentlyAssigned = (state: DashboardState) => state.recentlyAssigned;
export const selectStats = (state: DashboardState) => state.stats;
export const selectIsLoading = (state: DashboardState) => state.isLoading;
export const selectIsLoadingStats = (state: DashboardState) => state.isLoadingStats;

// Composed selectors for derived state
export const selectWorkflowCount = (state: DashboardState) => state.myWorkflows.length;
export const selectHasPriorityWorkflows = (state: DashboardState) => state.highPriorityWorkflows.length > 0;
