import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import api from '@/utils/axios';
import toast from 'react-hot-toast';
import '@/components/css/DashboardPage.css';
import {
  PlayArrow,
  Description,
  Assessment,
  CloudUpload,
  HealthAndSafety,
  Edit,
  TrendingUp,
  Schedule,
  Notifications,
  Speed,
  Warning,
  CheckCircle,
  Error,
  Info,
  Storage,
  Tune,
  GitHub,
  AccountTree,
} from '@mui/icons-material';

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || 'local-workspace';

interface WorkflowQueueStats {
  needs_action: number;
  in_progress: number;
  completed: number;
  background_jobs: number;
  blocked_workflows: number;
  ready_to_advance: number;
  active_workspace: string;
}

interface Workflow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  stage: string;
  status: string;
  pending_owner: string;
  psd_version: string;
  updated: string;
  blocked: boolean;
  block_message?: string;
}

interface Activity {
  id: string;
  action: string;
  workflow_id: string | null;
  time: string;
  icon: string;
  timestamp: string;
}

interface PerformanceMetrics {
  avg_completion_time: string;
  tasks_completed: number;
  on_time_rate: string;
  pending_reviews: number;
}

interface TeamActivity {
  user: string;
  action: string;
  workflow: string;
  time: string;
}

interface Notification {
  type: string;
  message: string;
  time: string;
  workflow_id?: string;
}

interface Deadline {
  workflow: string;
  task: string;
  due: string;
  priority: string;
}

interface SystemHealth {
  database: string;
  llm: string;
  api: string;
  jobs: string;
}

interface QuickAction {
  title: string;
  description: string;
  icon: JSX.Element;
  action: () => void;
  color: string;
}

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { actualTheme } = useTheme();

  // Theme-aware colors helper
  const colors = {
    bg: actualTheme === 'dark' ? '#0f172a' : '#f8f9fa',
    cardBg: actualTheme === 'dark' ? '#1e293b' : '#ffffff',
    hoverBg: actualTheme === 'dark' ? '#334155' : '#f8f9fa',
    cardBorder: actualTheme === 'dark' ? '#334155' : '#dee2e6',
    text: actualTheme === 'dark' ? '#f1f5f9' : '#212529',
    textSecondary: actualTheme === 'dark' ? '#94a3b8' : '#6c757d',
    textMuted: actualTheme === 'dark' ? '#64748b' : '#6c757d',
    shadowSm: actualTheme === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.05)',
  };

  const [stats, setStats] = useState<WorkflowQueueStats>({
    needs_action: 0,
    in_progress: 0,
    completed: 0,
    background_jobs: 0,
    blocked_workflows: 0,
    ready_to_advance: 0,
    active_workspace: 'local-workspace',
  });
  const [needsAttention, setNeedsAttention] = useState<Workflow[]>([]);
  const [otherInProgress, setOtherInProgress] = useState<Workflow[]>([]);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    avg_completion_time: '0 days',
    tasks_completed: 0,
    on_time_rate: '0%',
    pending_reviews: 0,
  });
  const [teamActivity, setTeamActivity] = useState<TeamActivity[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<Deadline[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    database: 'healthy',
    llm: 'healthy',
    api: 'healthy',
    jobs: 'healthy',
  });
  const [loading, setLoading] = useState(false);
  const [systemHealthDialogOpen, setSystemHealthDialogOpen] = useState(false);
  const [dashboardRetryCount, setDashboardRetryCount] = useState(0);
  const [shouldFetchDashboard, setShouldFetchDashboard] = useState(true);

  useEffect(() => {
    if (shouldFetchDashboard) {
      loadDashboardData();
      // Refresh data every 30 seconds
      const interval = setInterval(loadDashboardData, 30000);
      return () => clearInterval(interval);
    }
  }, [shouldFetchDashboard]);

  const loadDashboardData = async () => {
    if (!shouldFetchDashboard) {
      return;
    }

    // Only show loading on initial load
    if (needsAttention.length === 0 && otherInProgress.length === 0) {
      setLoading(true);
    }

    let dashboardFailed = false;

    try {
      // Load comprehensive workspace overview
      const overviewResponse = await api.get('/v1/manager/dashboard', {
        params: { project_id: PROJECT_ID },
      });
      if (overviewResponse.data) {
        const metrics = overviewResponse.data.metrics || {};
        const pipeline = overviewResponse.data.pipeline?.pipeline || {};
        setStats({
          needs_action: 0,
          in_progress: metrics.in_progress_workflows || 0,
          completed: metrics.completed_workflows || 0,
          background_jobs: 0,
          blocked_workflows: overviewResponse.data.pipeline?.stuck_workflows || 0,
          ready_to_advance: 0,
          active_workspace: PROJECT_ID,
          ...overviewResponse.data.stats,
        });
        setRecentActivities(overviewResponse.data.recent_activity || overviewResponse.data.recent_activities || []);
        setPerformanceMetrics(overviewResponse.data.performance_metrics || {
          avg_completion_time: `${metrics.avg_cycle_time_hours || 0} hours`,
          tasks_completed: metrics.completed_workflows || 0,
          on_time_rate: `${metrics.quality_first_pass_rate || 100}%`,
          pending_reviews: 0,
        });
        setTeamActivity(overviewResponse.data.team_activity?.actors || overviewResponse.data.team_activity || []);
        setNotifications(overviewResponse.data.notifications || []);
        setUpcomingDeadlines(overviewResponse.data.upcoming_deadlines || []);
        setInsights(overviewResponse.data.insights || []);
        setSystemHealth(overviewResponse.data.system_health || {
          database: 'healthy',
          llm: 'healthy',
          api: 'healthy',
          jobs: 'healthy',
        });
      }
    } catch (error: any) {
      console.error('Failed to load dashboard overview:', error);
      dashboardFailed = true;

      // Increment retry count for dashboard endpoint
      const newRetryCount = dashboardRetryCount + 1;
      setDashboardRetryCount(newRetryCount);

      // Stop fetching after 3 failed attempts
      if (newRetryCount >= 3) {
        console.warn('Dashboard endpoint failed 3 times. Stopping further requests.');
        setShouldFetchDashboard(false);
      }

      // Only show error toast on first failure, not on subsequent retries
      if (newRetryCount === 1 && error.response?.status !== 404) {
        toast.error('Failed to load dashboard overview', { id: 'dashboard-error' });
      }
    }

    try {
      // Load all workflows from the workflow list
      const workflowsResponse = await api.get('/v1/workflows', {
        params: { project_id: PROJECT_ID },
      });
      if (workflowsResponse.data) {
        const workflows = workflowsResponse.data?.items || workflowsResponse.data?.workflows || workflowsResponse.data || [];

        // Get current user ID
        const currentUserId = user?.id;

        // Filter workflows assigned to current user
        const myWorkflows = workflows.filter((wf: any) => {
          const isAssignedToMe =
            (wf.current_stage === 'business_analyst' && wf.ba_assignee_id === currentUserId) ||
            (wf.current_stage === 'developer' && wf.developer_assignee_id === currentUserId) ||
            (wf.current_stage === 'reviewer' && wf.reviewer_assignee_id === currentUserId) ||
            wf.current_assignee === user?.username ||
            wf.current_assignee === user?.email ||
            !currentUserId;

          return isAssignedToMe && wf.status !== 'completed' && wf.status !== 'cancelled';
        });

        // Separate into needs attention (blocked or requiring action) and others
        const needsAttentionList: Workflow[] = [];
        const otherInProgressList: Workflow[] = [];

        myWorkflows.forEach((wf: any) => {
          const workflowItem: Workflow = {
            id: String(wf.id),
            workflow_id: wf.workflow_id || wf.display_id || String(wf.id),
            workflow_name: wf.workflow_name || wf.name || wf.display_id || String(wf.id),
            stage: wf.current_stage || 'N/A',
            status: wf.status || 'draft',
            pending_owner: wf.current_stage || 'N/A',
            psd_version: wf.version || wf.psd_version || '1.0',
            updated: wf.updated_at ? new Date(wf.updated_at).toLocaleString('en-GB') : 'N/A',
            blocked: wf.stage_status === 'blocked' || wf.status === 'blocked',
            block_message: wf.stage_status === 'blocked' ? 'This workflow is currently blocked. Please review and resolve issues.' : undefined,
          };

          if (workflowItem.blocked) {
            needsAttentionList.push(workflowItem);
          } else {
            otherInProgressList.push(workflowItem);
          }
        });

        setNeedsAttention(needsAttentionList);
        setOtherInProgress(otherInProgressList);

        // Reset dashboard retry count on successful workflow fetch
        if (!dashboardFailed) {
          setDashboardRetryCount(0);
        }
      }
    } catch (error: any) {
      console.error('Failed to load workflows:', error);
      // Don't show toast errors for workflow failures to avoid flickering
    } finally {
      setLoading(false);
    }
  };

  const quickActions: QuickAction[] = [
    {
      title: 'Launch Workflow',
      description: 'Start a new workflow',
      icon: <PlayArrow />,
      action: () => navigate('/workflow', { state: { openCreateDialog: true } }),
      color: '#20c997'
    },
    {
      title: 'Upload Documents',
      description: 'Add new files',
      icon: <CloudUpload />,
      action: () => navigate('/documents'),
      color: '#3b82f6'
    },
    {
      title: 'View Reports',
      description: 'Analytics & insights',
      icon: <Assessment />,
      action: () => navigate('/reports'),
      color: '#8b5cf6'
    },
    {
      title: 'Resume Draft',
      description: 'Continue work',
      icon: <Edit />,
      action: () => handleResumeDraft(),
      color: '#f59e0b'
    },
    {
      title: 'System Health',
      description: 'Check status',
      icon: <HealthAndSafety />,
      action: () => setSystemHealthDialogOpen(true),
      color: '#10b981'
    },
    {
      title: 'My Tasks',
      description: 'View all tasks',
      icon: <Description />,
      action: () => navigate('/workflow'),
      color: '#06b6d4'
    },
  ];

  const getStageColor = (stage: string) => {
    switch (stage.toUpperCase()) {
      case 'BA':
      case 'BUSINESS_ANALYST':
        return '#f59e0b';
      case 'DEVELOPER':
      case 'DEV':
        return '#8b5cf6';
      case 'REVIEWER':
      case 'ANALYST':
        return '#3b82f6';
      default:
        return '#64748b';
    }
  };

  const getStatusBadgeStyle = (status: string) => {
    const isDark = actualTheme === 'dark';
    switch (status.toLowerCase()) {
      case 'in progress':
      case 'in_progress':
        return {
          background: isDark ? '#1e3a8a' : '#dbeafe',
          color: isDark ? '#93c5fd' : '#1e40af'
        };
      case 'completed':
        return {
          background: isDark ? '#065f46' : '#d1fae5',
          color: isDark ? '#6ee7b7' : '#065f46'
        };
      case 'blocked':
        return {
          background: isDark ? '#991b1b' : '#fee2e2',
          color: isDark ? '#fca5a5' : '#991b1b'
        };
      default:
        return {
          background: isDark ? '#374151' : '#f3f4f6',
          color: isDark ? '#d1d5db' : '#374151'
        };
    }
  };

  const handleOpenWorkflow = (workflowId: string) => {
    navigate(`/workflow/${workflowId}`);
  };

  const handleLaunchWorkflow = () => {
    navigate('/workflow/create');
  };

  const handleNewVersion = (workflowId: string) => {
    toast('New version functionality coming soon');
  };

  const handleResumeDraft = async () => {
    try {
      // Fetch all workflows
      const response = await api.get('/v1/workflows', {
        params: { project_id: PROJECT_ID },
      });
      const workflows = response.data?.items || response.data?.workflows || response.data || [];

      // Find draft workflows
      const draftWorkflows = workflows.filter((wf: any) => wf.status === 'draft');

      if (draftWorkflows.length === 0) {
        toast('No draft workflows found. Create a new workflow to get started!');
        return;
      }

      // Navigate to workflow page with filter for drafts
      navigate('/workflow', { state: { filterByDraft: true } });
    } catch (error) {
      console.error('Failed to check draft workflows:', error);
      toast.error('Failed to load draft workflows');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <Warning sx={{ fontSize: 20, color: '#f59e0b' }} />;
      case 'success':
        return <CheckCircle sx={{ fontSize: 20, color: '#10b981' }} />;
      case 'error':
        return <Error sx={{ fontSize: 20, color: '#ef4444' }} />;
      default:
        return <Info sx={{ fontSize: 20, color: '#3b82f6' }} />;
    }
  };

  if (loading && needsAttention.length === 0) {
    return (
      <div className="dashboard-loading-center">
        <p>Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className={`dashboard-container ${actualTheme === 'dark' ? 'dashboard-container-dark' : 'dashboard-container-light'}`}>
      {/* Welcome Section */}
      <div className={`dashboard-welcome-section ${actualTheme === 'dark' ? 'dashboard-welcome-dark' : 'dashboard-welcome-light'}`}>
        <div className="dashboard-welcome-header">
          <div>
            <h1 className="dashboard-welcome-title">
              Welcome back, {user?.username || 'User'}!
            </h1>
            <p className="dashboard-welcome-subtitle">
              {user?.role?.name ? `Role: ${user.role.name.toUpperCase()}` : 'Ready to manage your workflows'}
            </p>
          </div>
          <div className="dashboard-last-activity">
            <p className="dashboard-activity-label">
              Last Activity
            </p>
            <p className="dashboard-activity-time">
              {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      </div>


      {/* Quick Actions Panel */}
      <div className="dashboard-section">
        <h2 className={`dashboard-section-title ${actualTheme === 'dark' ? 'dashboard-section-title-dark' : 'dashboard-section-title-light'}`}>
          <Speed sx={{ fontSize: 24, verticalAlign: 'middle', marginRight: '0.5rem' }} />
          Quick Actions
        </h2>
        <div className="dashboard-quick-actions-grid">
          {quickActions.map((action, index) => (
            <div
              key={index}
              onClick={action.action}
              style={{
                padding: '1.5rem',
                background: actualTheme === 'dark' ? '#1e293b' : '#ffffff',
                borderRadius: '12px',
                border: actualTheme === 'dark' ? '1px solid #334155' : '1px solid #dee2e6',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: actualTheme === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.05)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
              }}
            >
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: `${action.color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
                color: action.color
              }}>
                {action.icon}
              </div>
              <h3 style={{
                fontSize: '1rem',
                fontWeight: '600',
                color: actualTheme === 'dark' ? '#f1f5f9' : '#212529',
                margin: 0,
                marginBottom: '0.25rem'
              }}>
                {action.title}
              </h3>
              <p style={{
                fontSize: '0.875rem',
                color: actualTheme === 'dark' ? '#94a3b8' : '#6c757d',
                margin: 0
              }}>
                {action.description}
              </p>
            </div>
          ))}
        </div>
      </div>



      {/* Performance Metrics with Gradient Cards */}
      <div className="dashboard-insights-section">
        <div className="dashboard-insights-header">
          <h2 className="dashboard-insights-title">
            Performance Metrics
          </h2>
          <p className="dashboard-insights-subtitle">
            Track your workflow performance and team productivity metrics
          </p>
        </div>

        <div className="dashboard-insights-grid">
          <div style={{
            padding: '1.25rem',
            background: actualTheme === 'dark'
              ? 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)'
              : 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
            borderRadius: '12px',
            border: actualTheme === 'dark' ? '1px solid #3b82f6' : '1px solid #0ea5e9'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Schedule sx={{ fontSize: 20, color: '#075985' }} />
              <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', margin: 0, fontWeight: '700', color: '#075985' }}>
                AVG WORKFLOW TIME
              </p>
            </div>
            <p style={{ fontSize: '2.5rem', fontWeight: '600', margin: 0, lineHeight: 1, marginBottom: '0.5rem', color: '#0c4a6e' }}>
              {performanceMetrics.avg_completion_time.replace(' days', '')}
            </p>
            <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: '1.4', color: '#0369a1' }}>
              Days per workflow
            </p>
          </div>

          <div style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', borderRadius: '12px', border: '1px solid #3b82f6' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <CheckCircle sx={{ fontSize: 20, color: '#1e40af' }} />
              <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', margin: 0, fontWeight: '700', color: '#1e40af' }}>
                WORKFLOWS COMPLETED
              </p>
            </div>
            <p style={{ fontSize: '2.5rem', fontWeight: '600', margin: 0, lineHeight: 1, marginBottom: '0.5rem', color: '#1e3a8a' }}>
              {performanceMetrics.tasks_completed}
            </p>
            <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: '1.4', color: '#1d4ed8' }}>
              This month
            </p>
          </div>

          <div style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', borderRadius: '12px', border: '1px solid #10b981' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <TrendingUp sx={{ fontSize: 20, color: '#065f46' }} />
              <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', margin: 0, fontWeight: '700', color: '#065f46' }}>
                WORKFLOW SUCCESS RATE
              </p>
            </div>
            <p style={{ fontSize: '2.5rem', fontWeight: '600', margin: 0, lineHeight: 1, marginBottom: '0.5rem', color: '#064e3b' }}>
              {performanceMetrics.on_time_rate}
            </p>
            <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: '1.4', color: '#047857' }}>
              On-time completion
            </p>
          </div>

          <div style={{ padding: '1.25rem', background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', borderRadius: '12px', border: '1px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Assessment sx={{ fontSize: 20, color: '#92400e' }} />
              <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', margin: 0, fontWeight: '700', color: '#92400e' }}>
                WORKFLOWS PENDING
              </p>
            </div>
            <p style={{ fontSize: '2.5rem', fontWeight: '600', margin: 0, lineHeight: 1, marginBottom: '0.5rem', color: '#78350f' }}>
              {performanceMetrics.pending_reviews}
            </p>
            <p style={{ fontSize: '0.8125rem', margin: 0, lineHeight: '1.4', color: '#b45309' }}>
              Awaiting review
            </p>
          </div>
        </div>
      </div>


      {/* Stage-Specific Insights */}
      {insights.length > 0 && (
        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '12px', boxShadow: '0 4px 16px rgba(102, 126, 234, 0.2)' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#ffffff', margin: 0, marginBottom: '1rem' }}>
            💡 Smart Insights for {user?.role?.name?.toUpperCase() || 'Your Role'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {insights.map((insight, index) => (
              <div key={index} style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.2)', borderRadius: '8px', backdropFilter: 'blur(10px)' }}>
                <p style={{ fontSize: '0.875rem', color: '#ffffff', margin: 0 }}>
                  {insight}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Your Workload Section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{
          marginBottom: '1.5rem',
          padding: '1.5rem',
          background: colors.cardBg,
          borderRadius: '12px',
          border: `1px solid ${colors.cardBorder}`,
          boxShadow: actualTheme === 'dark' ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: colors.text,
                margin: 0,
                marginBottom: '0.25rem'
              }}>
                Your Workload
              </h2>
              <p style={{
                fontSize: '0.875rem',
                color: colors.textSecondary,
                margin: 0
              }}>
                Workflows assigned to you across all stages
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <select style={{
                padding: '0.5rem',
                borderRadius: '6px',
                border: `1px solid ${colors.cardBorder}`,
                fontSize: '0.875rem',
                color: colors.text,
                background: colors.cardBg
              }}>
                <option>All Stages</option>
                <option>BA</option>
                <option>Developer</option>
                <option>Reviewer</option>
              </select>
              <select style={{
                padding: '0.5rem',
                borderRadius: '6px',
                border: `1px solid ${colors.cardBorder}`,
                fontSize: '0.875rem',
                color: colors.text,
                background: colors.cardBg
              }}>
                <option>All Status</option>
                <option>In Progress</option>
                <option>Blocked</option>
                <option>Completed</option>
              </select>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                color: colors.textSecondary
              }}>
                <input type="checkbox" />
                Show completed
              </label>
            </div>
          </div>

          {/* Workflow Summary Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid #e9ecef' }}>
            <div style={{ textAlign: 'center' }}>
              <p style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                color: colors.textMuted,
                margin: 0,
                marginBottom: '0.5rem',
                fontWeight: '700'
              }}>
                Total Assigned
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '600', color: colors.text, margin: 0 }}>
                {needsAttention.length + otherInProgress.length}
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                color: colors.textMuted,
                margin: 0,
                marginBottom: '0.5rem',
                fontWeight: '700'
              }}>
                Needs Attention
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '600', color: '#f59e0b', margin: 0 }}>
                {needsAttention.length}
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                color: colors.textMuted,
                margin: 0,
                marginBottom: '0.5rem',
                fontWeight: '700'
              }}>
                In Progress
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '600', color: '#3b82f6', margin: 0 }}>
                {otherInProgress.length}
              </p>
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                color: colors.textMuted,
                margin: 0,
                marginBottom: '0.5rem',
                fontWeight: '700'
              }}>
                Blocked
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '600', color: '#ef4444', margin: 0 }}>
                {needsAttention.filter(w => w.blocked).length}
              </p>
            </div>
          </div>

          {/* Workflow List Info */}
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: colors.text,
              marginBottom: '0.75rem'
            }}>
              Workflow List Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{
                padding: '1rem',
                background: colors.hoverBg,
                borderRadius: '8px'
              }}>
                <p style={{
                  fontSize: '0.75rem',
                  color: colors.textMuted,
                  margin: 0,
                  marginBottom: '0.25rem'
                }}>
                  Most Recent Workflow
                </p>
                <p style={{
                  fontSize: '0.9375rem',
                  fontWeight: '600',
                  color: colors.text,
                  margin: 0
                }}>
                  {needsAttention.length > 0 ? needsAttention[0].workflow_id : 'N/A'}
                </p>
              </div>
              <div style={{
                padding: '1rem',
                background: colors.hoverBg,
                borderRadius: '8px'
              }}>
                <p style={{
                  fontSize: '0.75rem',
                  color: colors.textMuted,
                  margin: 0,
                  marginBottom: '0.25rem'
                }}>
                  Current Stage Distribution
                </p>
                <p style={{
                  fontSize: '0.9375rem',
                  fontWeight: '600',
                  color: colors.text,
                  margin: 0
                }}>
                  BA: {[...needsAttention, ...otherInProgress].filter(w => w.stage.toUpperCase() === 'BA').length} |
                  Dev: {[...needsAttention, ...otherInProgress].filter(w => w.stage.toUpperCase() === 'DEVELOPER').length} |
                  Rev: {[...needsAttention, ...otherInProgress].filter(w => w.stage.toUpperCase() === 'REVIEWER').length}
                </p>
              </div>
              <div style={{
                padding: '1rem',
                background: colors.hoverBg,
                borderRadius: '8px'
              }}>
                <p style={{
                  fontSize: '0.75rem',
                  color: colors.textMuted,
                  margin: 0,
                  marginBottom: '0.25rem'
                }}>
                  Average Age
                </p>
                <p style={{
                  fontSize: '0.9375rem',
                  fontWeight: '600',
                  color: colors.text,
                  margin: 0
                }}>
                  3.2 days
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Needs My Attention */}
        {needsAttention.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: colors.text,
              marginBottom: '0.75rem'
            }}>
              Needs My Attention
            </h3>
            {needsAttention.map((workflow) => (
              <div
                key={workflow.id}
                style={{
                  padding: '1.25rem',
                  background: colors.cardBg,
                  borderRadius: '8px',
                  border: `1px solid ${colors.cardBorder}`,
                  marginBottom: '0.75rem',
                  boxShadow: colors.shadowSm,
                }}
              >
                {workflow.blocked && workflow.block_message && (
                  <div style={{
                    padding: '0.75rem',
                    background: '#fff3cd',
                    border: '1px solid #ffc107',
                    borderRadius: '6px',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <Warning sx={{ fontSize: 20, color: '#856404' }} />
                    <span style={{ fontSize: '0.875rem', color: '#856404', fontWeight: '500' }}>
                      {workflow.block_message}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        background: `${getStageColor(workflow.stage)}20`,
                        color: getStageColor(workflow.stage),
                        textTransform: 'uppercase'
                      }}>
                        {workflow.stage}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#212529' }}>
                        {workflow.workflow_id}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: '#6c757d' }}>
                        {workflow.workflow_name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8125rem', color: '#6c757d' }}>
                      <span>Status: <span style={{
                        fontWeight: '600',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        ...getStatusBadgeStyle(workflow.status)
                      }}>{workflow.status}</span></span>
                      <span>Pending: {workflow.pending_owner}</span>
                      <span>Version: {workflow.psd_version}</span>
                      <span>Updated: {workflow.updated}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      onClick={() => handleOpenWorkflow(workflow.workflow_id)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#3b82f6',
                        color: '#ffffff',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      onClick={() => handleNewVersion(workflow.workflow_id)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#ffffff',
                        color: '#6c757d',
                        borderRadius: '6px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                      }}
                    >
                      New Version
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Other In Progress */}
        {otherInProgress.length > 0 && (
          <div>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: colors.text,
              marginBottom: '0.75rem'
            }}>
              Other In Progress
            </h3>
            {otherInProgress.map((workflow) => (
              <div
                key={workflow.id}
                style={{
                  padding: '1.25rem',
                  background: colors.cardBg,
                  borderRadius: '8px',
                  border: `1px solid ${colors.cardBorder}`,
                  marginBottom: '0.75rem',
                  boxShadow: colors.shadowSm,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        background: `${getStageColor(workflow.stage)}20`,
                        color: getStageColor(workflow.stage),
                        textTransform: 'uppercase'
                      }}>
                        {workflow.stage}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#212529' }}>
                        {workflow.workflow_id}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: '#6c757d' }}>
                        {workflow.workflow_name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8125rem', color: '#6c757d' }}>
                      <span>Status: <span style={{
                        fontWeight: '600',
                        padding: '0.125rem 0.5rem',
                        borderRadius: '4px',
                        ...getStatusBadgeStyle(workflow.status)
                      }}>{workflow.status}</span></span>
                      <span>Pending: {workflow.pending_owner}</span>
                      <span>Version: {workflow.psd_version}</span>
                      <span>Updated: {workflow.updated}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      onClick={() => handleOpenWorkflow(workflow.workflow_id)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#3b82f6',
                        color: '#ffffff',
                        borderRadius: '6px',
                        border: 'none',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                      }}
                    >
                      Open
                    </Button>
                    <Button
                      onClick={() => handleNewVersion(workflow.workflow_id)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: '#ffffff',
                        color: '#6c757d',
                        borderRadius: '6px',
                        border: '1px solid #dee2e6',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                      }}
                    >
                      New Version
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No Workflows Message */}
        {needsAttention.length === 0 && otherInProgress.length === 0 && !loading && (
          <div style={{
            textAlign: 'center',
            padding: '3rem',
            background: colors.cardBg,
            borderRadius: '12px',
            border: `1px solid ${colors.cardBorder}`
          }}>
            <p style={{
              fontSize: '1rem',
              color: colors.textSecondary,
              margin: 0
            }}>
              No workflows in your queue at the moment
            </p>
          </div>
        )}
      </div>

      {/* System Health Dialog */}
      {systemHealthDialogOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setSystemHealthDialogOpen(false)}
        >
          <div
            style={{
              background: colors.cardBg,
              borderRadius: '16px',
              padding: '2.5rem',
              maxWidth: '1200px',
              width: '95%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: actualTheme === 'dark' ? '0 20px 60px rgba(0, 0, 0, 0.7)' : '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  color: colors.text,
                  margin: 0,
                  marginBottom: '0.25rem'
                }}>
                  <HealthAndSafety sx={{ fontSize: 28, verticalAlign: 'middle', marginRight: '0.5rem', color: '#10b981' }} />
                  System Health
                </h2>
                <p style={{
                  fontSize: '0.875rem',
                  color: colors.textSecondary,
                  margin: 0
                }}>
                  Real-time status of all system components
                </p>
              </div>
              <button
                onClick={() => setSystemHealthDialogOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: colors.textSecondary,
                  padding: '0.5rem',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Overall Status Banner */}
            <div style={{
              padding: '1.25rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: '12px',
              marginBottom: '1.5rem',
              color: '#ffffff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <CheckCircle sx={{ fontSize: 48 }} />
                <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '600', margin: 0, marginBottom: '0.25rem' }}>
                    All Systems Operational
                  </h3>
                  <p style={{ fontSize: '0.875rem', margin: 0, opacity: 0.9 }}>
                    All components are running smoothly
                  </p>
                </div>
              </div>
            </div>

            {/* System Components - 2 rows x 3 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {/* Database */}
              <div style={{
                padding: '1.25rem',
                background: actualTheme === 'dark' ? '#1e293b' : '#f8f9fa',
                borderRadius: '12px',
                border: actualTheme === 'dark' ? '2px solid #10b981' : '2px solid #d1fae5',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Storage sx={{ fontSize: 24, color: '#10b981' }} />
                    <h4 style={{ fontSize: '1rem', fontWeight: '600', color: colors.text, margin: 0 }}>
                      Database
                    </h4>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    background: '#d1fae5',
                    color: '#065f46'
                  }}>
                    {systemHealth.database}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  <p style={{ margin: 0, marginBottom: '0.25rem' }}>PostgreSQL 14.5</p>
                  <p style={{ margin: 0 }}>Response Time: 12ms | Connections: 45/100</p>
                </div>
              </div>

              {/* LLM Service */}
              <div style={{
                padding: '1.25rem',
                background: actualTheme === 'dark' ? '#1e293b' : '#f8f9fa',
                borderRadius: '12px',
                border: actualTheme === 'dark' ? '2px solid #10b981' : '2px solid #d1fae5',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Tune sx={{ fontSize: 24, color: '#10b981' }} />
                    <h4 style={{ fontSize: '1rem', fontWeight: '600', color: colors.text, margin: 0 }}>
                      LLM Service
                    </h4>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    background: '#d1fae5',
                    color: '#065f46'
                  }}>
                    {systemHealth.llm}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  <p style={{ margin: 0, marginBottom: '0.25rem' }}>Claude API Connected</p>
                  <p style={{ margin: 0 }}>Avg Response Time: 850ms | Rate Limit: 95% available</p>
                </div>
              </div>

              {/* API Service */}
              <div style={{
                padding: '1.25rem',
                background: actualTheme === 'dark' ? '#1e293b' : '#f8f9fa',
                borderRadius: '12px',
                border: actualTheme === 'dark' ? '2px solid #10b981' : '2px solid #d1fae5',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Speed sx={{ fontSize: 24, color: '#10b981' }} />
                    <h4 style={{ fontSize: '1rem', fontWeight: '600', color: colors.text, margin: 0 }}>
                      API Service
                    </h4>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    background: '#d1fae5',
                    color: '#065f46'
                  }}>
                    {systemHealth.api}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  <p style={{ margin: 0, marginBottom: '0.25rem' }}>FastAPI v0.104.1</p>
                  <p style={{ margin: 0 }}>Uptime: 99.8% | Avg Response: 45ms</p>
                </div>
              </div>

              {/* Background Jobs */}
              <div style={{
                padding: '1.25rem',
                background: actualTheme === 'dark' ? '#1e293b' : '#f8f9fa',
                borderRadius: '12px',
                border: actualTheme === 'dark' ? '2px solid #10b981' : '2px solid #d1fae5',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Schedule sx={{ fontSize: 24, color: '#10b981' }} />
                    <h4 style={{ fontSize: '1rem', fontWeight: '600', color: colors.text, margin: 0 }}>
                      Background Jobs
                    </h4>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    background: '#d1fae5',
                    color: '#065f46'
                  }}>
                    {systemHealth.jobs}
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  <p style={{ margin: 0, marginBottom: '0.25rem' }}>Celery Workers: 4 active</p>
                  <p style={{ margin: 0 }}>Queue: 0 pending | Completed today: 127</p>
                </div>
              </div>

              {/* GitHub Integration */}
              <div style={{
                padding: '1.25rem',
                background: actualTheme === 'dark' ? '#1e293b' : '#f8f9fa',
                borderRadius: '12px',
                border: actualTheme === 'dark' ? '2px solid #10b981' : '2px solid #d1fae5',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <GitHub sx={{ fontSize: 24, color: '#10b981' }} />
                    <h4 style={{ fontSize: '1rem', fontWeight: '600', color: colors.text, margin: 0 }}>
                      GitHub Integration
                    </h4>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    background: '#d1fae5',
                    color: '#065f46'
                  }}>
                    Connected
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  <p style={{ margin: 0, marginBottom: '0.25rem' }}>Repository: barclays-mcp-system</p>
                  <p style={{ margin: 0 }}>Last Sync: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} | Rate Limit: 4850/5000</p>
                </div>
              </div>

              {/* Agent Service */}
              <div style={{
                padding: '1.25rem',
                background: actualTheme === 'dark' ? '#1e293b' : '#f8f9fa',
                borderRadius: '12px',
                border: actualTheme === 'dark' ? '2px solid #10b981' : '2px solid #d1fae5',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <AccountTree sx={{ fontSize: 24, color: '#10b981' }} />
                    <h4 style={{ fontSize: '1rem', fontWeight: '600', color: colors.text, margin: 0 }}>
                      Agent Service
                    </h4>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    background: '#d1fae5',
                    color: '#065f46'
                  }}>
                    Operational
                  </span>
                </div>
                <div style={{ fontSize: '0.875rem', color: colors.textSecondary }}>
                  <p style={{ margin: 0, marginBottom: '0.25rem' }}>Active Agents: 6 | Idle: 2</p>
                  <p style={{ margin: 0 }}>Total Executions Today: 234 | Success Rate: 98.5%</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{
              marginTop: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: `1px solid ${colors.cardBorder}`,
              textAlign: 'center'
            }}>
              <p style={{
                fontSize: '0.75rem',
                color: colors.textSecondary,
                margin: 0
              }}>
                Last Updated: {new Date().toLocaleString('en-GB')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
