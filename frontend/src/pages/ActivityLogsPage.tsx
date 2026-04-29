import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ActivityLog } from '@/types';
import { formatDate } from '@/utils/formatters';
import axios from '@/utils/axios';
import '@/components/css/ActivityLogsPage.css';

export const ActivityLogsPage = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 25;

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const fetchLogs = async () => {
    try {
      const response = await axios.get('/api/logs/audit', {
        params: filter !== 'all' ? { event_category: filter } : {},
      });
      setLogs(response.data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs([]);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'workflow':
        return (
          <svg className="activity-icon-type" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3zM14 16a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3z" />
          </svg>
        );
      case 'agent':
        return (
          <svg className="activity-icon-type" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        );
      case 'document':
        return (
          <svg className="activity-icon-type" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
      case 'user':
        return (
          <svg className="activity-icon-type" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      default:
        return (
          <svg className="activity-icon-type" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getActivityBadgeClass = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'workflow':
        return 'activity-badge-workflow';
      case 'agent':
        return 'activity-badge-agent';
      case 'document':
        return 'activity-badge-document';
      case 'user':
        return 'activity-badge-user';
      default:
        return 'activity-badge-default';
    }
  };

  const indexOfLastLog = currentPage * logsPerPage;
  const indexOfFirstLog = indexOfLastLog - logsPerPage;
  const currentLogs = logs.slice(indexOfFirstLog, indexOfLastLog);
  const totalPages = Math.ceil(logs.length / logsPerPage);

  return (
    <div className="activity-page-container">
      <div className="activity-header-section">
          <div>
            <h1 className="activity-main-title">Activity Logs</h1>
            <p className="activity-subtitle">Monitor system activities and user actions</p>
          </div>
          <div className="activity-filter-section">
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="activity-filter-select"
            >
              <option value="all">All Activities</option>
              <option value="workflow">Workflows</option>
              <option value="agent">Agents</option>
              <option value="document">Documents</option>
              <option value="user">Users</option>
            </select>
          </div>
        </div>

        <div className="activity-stats-row">
          <Card className="activity-stat-card">
            <CardContent className="activity-stat-content">
              <div className="activity-stat-icon-wrapper activity-stat-icon-total">
                <svg className="activity-stat-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="activity-stat-info">
                <p className="activity-stat-label">Total Logs</p>
                <p className="activity-stat-value">{logs.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="activity-stat-card">
            <CardContent className="activity-stat-content">
              <div className="activity-stat-icon-wrapper activity-stat-icon-workflow">
                <svg className="activity-stat-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1V5z" />
                </svg>
              </div>
              <div className="activity-stat-info">
                <p className="activity-stat-label">Workflows</p>
                <p className="activity-stat-value">
                  {logs.filter(l => l.activity_type?.toLowerCase() === 'workflow').length}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="activity-stat-card">
            <CardContent className="activity-stat-content">
              <div className="activity-stat-icon-wrapper activity-stat-icon-document">
                <svg className="activity-stat-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="activity-stat-info">
                <p className="activity-stat-label">Documents</p>
                <p className="activity-stat-value">
                  {logs.filter(l => l.activity_type?.toLowerCase() === 'document').length}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="activity-stat-card">
            <CardContent className="activity-stat-content">
              <div className="activity-stat-icon-wrapper activity-stat-icon-user">
                <svg className="activity-stat-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div className="activity-stat-info">
                <p className="activity-stat-label">User Actions</p>
                <p className="activity-stat-value">
                  {logs.filter(l => l.activity_type?.toLowerCase() === 'user').length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="activity-table-card">
          <CardContent className="activity-table-content">
            <div className="activity-table-wrapper">
              <table className="activity-table">
                <thead className="activity-table-head">
                  <tr>
                    <th className="activity-th">Timestamp</th>
                    <th className="activity-th">User</th>
                    <th className="activity-th">Action</th>
                    <th className="activity-th">Resource</th>
                    <th className="activity-th">Details</th>
                  </tr>
                </thead>
                <tbody className="activity-table-body">
                  {currentLogs.map((log) => (
                    <tr key={log.id} className="activity-table-row">
                      <td className="activity-td activity-timestamp-cell">
                        <div className="activity-timestamp-wrapper">
                          <svg className="activity-icon-clock" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>
                            {log.created_at ? formatDate(log.created_at) : formatDate(log.timestamp)}
                          </span>
                        </div>
                      </td>
                      <td className="activity-td activity-user-cell">
                        <div className="activity-user-wrapper">
                          <svg className="activity-icon-user" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span>{typeof log.username === 'object' ? (log.username as any)?.username || 'Unknown' : log.username || 'Unknown'}</span>
                        </div>
                      </td>
                      <td className="activity-td">
                        <div className={`activity-action-badge ${getActivityBadgeClass(log.activity_type || '')}`}>
                          {getActivityIcon(log.activity_type || '')}
                          <span>{log.activity_type || log.action}</span>
                        </div>
                      </td>
                      <td className="activity-td activity-resource-cell">{log.resource_type || '-'}</td>
                      <td className="activity-td activity-details-cell">
                        {typeof log.action_details === 'object' 
                          ? JSON.stringify(log.action_details) 
                          : (log.action_details || '-')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length === 0 && (
                <div className="activity-empty-state">
                  <svg className="activity-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="activity-empty-text">No activity logs</p>
                  <p className="activity-empty-subtext">Activity logs will appear here once users perform actions</p>
                </div>
              )}
            </div>
            {logs.length > 0 && (
              <div className="activity-pagination">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="activity-pagination-btn"
                >
                  <svg className="activity-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
                <span className="activity-pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="activity-pagination-btn"
                >
                  Next
                  <svg className="activity-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
};
