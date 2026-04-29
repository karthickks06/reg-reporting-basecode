import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Menu,
  MenuItem,
  Badge,
  Popover,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Description,
  Timeline,
  People,
  Logout,
  Visibility,
  AccountCircle,
  Settings,
  Tune,
  Storage,
  Circle,
  AccountTree,
  Assessment,
  GitHub,
  Notifications,
  Warning,
  CheckCircle,
  Error,
  Info,
} from '@mui/icons-material';
import { useAuthStore } from '@/store/authStore';
import { useLocation } from 'react-router-dom';
import { useTheme as useCustomTheme } from '@/contexts/ThemeContext';
import { useTheme } from '@mui/material/styles';
import nttDataLogo from '@/components/assets/GlobalLogo_NTTDATA_FutureBlue_RGB.png';
import logo from '@/components/assets/Logo.png';
import api from '@/utils/axios';
import { authService } from '@/services/authService';

const PROJECT_ID = import.meta.env.VITE_PROJECT_ID || 'local-workspace';

const drawerWidth = 240;
const collapsedDrawerWidth = 80;

const menuItems = [
  { text: 'Workspace', icon: <Dashboard />, path: '/dashboard' },
  { text: 'Workflow', icon: <AccountTree />, path: '/workflow' },
  { text: 'Reports', icon: <Assessment />, path: '/reports' },
  { text: 'Documents', icon: <Description />, path: '/documents' },
  { text: 'Graph RAG', icon: <Visibility />, path: '/graph' },
  { text: 'Activity Logs', icon: <Timeline />, path: '/logs' },
  { text: 'Users', icon: <People />, path: '/users' },
  { text: 'LLM Configuration', icon: <Tune />, path: '/llm-config' },
  { text: 'Data Model Config', icon: <Storage />, path: '/data-models' },
  { text: 'Stage Configuration', icon: <Settings />, path: '/stage-config' },
  { text: 'Artifact Configuration', icon: <GitHub />, path: '/artifact-config' },
];

const sidebarSections = [
  {
    title: 'Overview',
    items: ['Workspace', 'Workflow'],
  },
  {
    title: 'Operations',
    items: ['Documents', 'Reports', 'Graph RAG'],  // Documents first, then Reports, then Graph RAG
  },
  {
    title: 'Governance',
    items: ['Activity Logs', 'Users'],
  },
  {
    title: 'Configuration',
    items: ['LLM Configuration', 'Data Model Config', 'Stage Configuration', 'Artifact Configuration'],
  },
];

const getNavItemStyles = (isActive: boolean, sidebarCollapsed: boolean) => ({
  justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
  px: sidebarCollapsed ? 1.5 : 2,
  height: 48,
  borderRadius: 2,
  mx: 0,
  my: 0.25,
  alignItems: 'center',
  width: '100%',
  color: isActive ? '#0f172a' : 'inherit',
  background: isActive ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.18) 0%, rgba(59, 130, 246, 0.10) 100%)' : 'transparent',
  border: isActive ? '1px solid rgba(59, 130, 246, 0.22)' : '1px solid transparent',
  borderLeft: isActive ? '4px solid #2563eb' : '4px solid transparent',
  boxShadow: isActive ? '0 8px 20px rgba(59, 130, 246, 0.14)' : 'none',
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 180ms ease',
  '&:hover': {
    background: isActive ? 'linear-gradient(90deg, rgba(59, 130, 246, 0.24) 0%, rgba(59, 130, 246, 0.14) 100%)' : 'rgba(15, 23, 42, 0.04)',
  },
  '&::after': isActive
    ? {
        content: '""',
        position: 'absolute',
        top: '50%',
        right: sidebarCollapsed ? 10 : 14,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#2563eb',
        transform: 'translateY(-50%)',
        boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.12)',
      }
    : {},
});

interface Notification {
  type: string;
  message: string;
  time: string;
  workflow_id?: string;
}

export const DashboardLayout = () => {
  const theme = useTheme();
  const { actualTheme } = useCustomTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = useState<null | HTMLElement>(null);
  const [notificationAnchor, setNotificationAnchor] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationRetryCount, setNotificationRetryCount] = useState(0);
  const [shouldFetchNotifications, setShouldFetchNotifications] = useState(true);
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();

  useEffect(() => {
    if (shouldFetchNotifications) {
      loadNotifications();
      // Refresh notifications every 30 seconds
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [shouldFetchNotifications]);

  const loadNotifications = async () => {
    if (!shouldFetchNotifications) {
      return;
    }

    try {
      const response = await api.get('/v1/manager/dashboard', {
        params: { project_id: PROJECT_ID },
      });
      if (response.data) {
        setNotifications(response.data.notifications || []);
        // Reset retry count on success
        setNotificationRetryCount(0);
      }
    } catch (error: any) {
      console.error('Failed to load notifications:', error);

      // Increment retry count
      const newRetryCount = notificationRetryCount + 1;
      setNotificationRetryCount(newRetryCount);

      // Stop fetching after 3 failed attempts
      if (newRetryCount >= 3) {
        console.warn('Notification endpoint failed 3 times. Stopping further requests.');
        setShouldFetchNotifications(false);
      }
    }
  };

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.warn('Logout endpoint failed; clearing local session.', error);
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  const handleAccountMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAccountMenuAnchor(event.currentTarget);
  };

  const handleAccountMenuClose = () => {
    setAccountMenuAnchor(null);
  };

  const handleNotificationOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchor(event.currentTarget);
  };

  const handleNotificationClose = () => {
    setNotificationAnchor(null);
  };

  const handleMarkAllRead = () => {
    // Clear all notifications
    setNotifications([]);
  };

  const handleClearAll = () => {
    // Clear all notifications
    setNotifications([]);
    handleNotificationClose();
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

  const location = useLocation();
  const currentDrawerWidth = sidebarCollapsed ? collapsedDrawerWidth : drawerWidth;

  const drawer = (
    <div className="dashboard-sidebar-shell">
      {sidebarCollapsed ? (
        /* Collapsed State - Show Logo as Clickable Element */
        <Toolbar
          sx={{
            minHeight: 72,
            px: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            onClick={() => setSidebarCollapsed(false)}
            component="img"
            src={logo}
            alt="Logo"
            sx={{
              display: 'block',
              width: 48,
              height: 48,
              objectFit: 'contain',
              cursor: 'pointer',
              transition: 'transform 200ms ease',
              '&:hover': {
                transform: 'scale(1.1)',
              },
            }}
            aria-label="Expand sidebar"
            role="button"
            tabIndex={0}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                setSidebarCollapsed(false);
              }
            }}
          />
        </Toolbar>
      ) : (
        /* Expanded State - Show Hamburger Button and NTT Data Logo */
        <Toolbar
          sx={{
            minHeight: 72,
            px: 2.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 1,
          }}
        >
          <IconButton
            onClick={() => setSidebarCollapsed(true)}
            size="small"
            aria-label="Collapse sidebar"
            sx={{
              borderRadius: 2,
              border: '1px solid rgba(255, 255, 255, 0.40)',
              background: 'rgba(255, 255, 255, 0.70)',
              boxShadow: '0 4px 12px rgba(31, 38, 135, 0.08)',
              flexShrink: 0,
              transition: 'all 200ms ease',
              '&:hover': {
                background: 'rgba(59, 130, 246, 0.12)',
                borderColor: 'rgba(59, 130, 246, 0.3)',
                transform: 'scale(1.05)',
              },
            }}
          >
            <MenuIcon fontSize="small" />
          </IconButton>
          <Box
            component="img"
            src={nttDataLogo}
            alt="NTT Data"
            sx={{
              display: 'block',
              width: 150,
              height: 'auto',
              maxWidth: '100%',
              objectFit: 'contain',
              ml: 0.5,
            }}
          />
        </Toolbar>
      )}
      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.20)' }} />
        <List sx={{ py: 1 }}>
          {sidebarSections.map((section) => (
            <Box key={section.title} sx={{ px: sidebarCollapsed ? 0 : 2, py: 0.5 }}>
              {!sidebarCollapsed && (
                <Typography
                  variant="overline"
                  sx={{
                    display: 'block',
                    mb: 0.75,
                    color: 'rgba(15, 23, 42, 0.56)',
                    letterSpacing: 1.2,
                    fontWeight: 800,
                  }}
                >
                  {section.title}
                </Typography>
              )}
              {menuItems
                .filter((item) => section.items.includes(item.text))
                .map((item) => {
                  const isCurrentRoute = location.pathname === item.path;

                  return (
                    <ListItem key={item.text} disablePadding sx={{ mb: 0.25 }}>
                      <Tooltip title={item.text} placement="right" disableHoverListener={!sidebarCollapsed}>
                        <NavLink
                          to={item.path}
                          style={{
                            textDecoration: 'none',
                            color: 'inherit',
                            display: 'block',
                            width: '100%',
                          }}
                          aria-current={isCurrentRoute ? 'page' : undefined}
                        >
                          {({ isActive }) => (
                            <ListItemButton
                              sx={getNavItemStyles(isActive, sidebarCollapsed)}
                              aria-label={item.text}
                            >
                              <ListItemIcon
                                sx={{
                                  width: sidebarCollapsed ? 24 : 36,
                                  minWidth: sidebarCollapsed ? 24 : 36,
                                  height: sidebarCollapsed ? 24 : 'auto',
                                  mr: sidebarCollapsed ? 0 : 1.5,
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  color: isActive ? '#2563eb' : 'inherit',
                                  flexShrink: 0,
                                  '& .MuiSvgIcon-root': {
                                    filter: isActive ? 'drop-shadow(0 2px 6px rgba(37, 99, 235, 0.25))' : 'none',
                                  },
                                }}
                              >
                                {item.icon}
                              </ListItemIcon>
                              {!sidebarCollapsed && (
                                <ListItemText
                                  primary={item.text}
                                  sx={{ margin: 0 }}
                                  primaryTypographyProps={{
                                    fontWeight: isActive ? 800 : 500,
                                    noWrap: true,
                                    sx: { lineHeight: 1 },
                                  }}
                                />
                              )}
                              {!sidebarCollapsed && isActive && (
                                <Circle sx={{ fontSize: 8, color: '#2563eb', ml: 'auto' }} />
                              )}
                            </ListItemButton>
                          )}
                        </NavLink>
                      </Tooltip>
                    </ListItem>
                  );
                })}
            </Box>
          ))}
        </List>
      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.20)' }} />
    </div>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        maxWidth: '100vw',
        background: actualTheme === 'dark'
          ? 'linear-gradient(to bottom right, #0f172a, #1e293b, #0f172a)'
          : 'linear-gradient(to bottom right, #eff6ff, #e0e7ff, #f5f3ff)',
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: actualTheme === 'dark'
            ? 'radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.08), transparent 28%), radial-gradient(circle at 80% 15%, rgba(139, 92, 246, 0.06), transparent 24%), radial-gradient(circle at 50% 85%, rgba(37, 99, 235, 0.05), transparent 26%)'
            : 'radial-gradient(circle at 20% 20%, rgba(96, 165, 250, 0.20), transparent 28%), radial-gradient(circle at 80% 15%, rgba(168, 85, 247, 0.16), transparent 24%), radial-gradient(circle at 50% 85%, rgba(59, 130, 246, 0.12), transparent 26%)',
          pointerEvents: 'none',
          zIndex: 0,
        },
      }}
    >
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${currentDrawerWidth}px)` },
          ml: { sm: `${currentDrawerWidth}px` },
          background: actualTheme === 'dark' ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.70)',
          backdropFilter: 'blur(16px) saturate(180%)',
          color: actualTheme === 'dark' ? '#f1f5f9' : '#0f172a',
          boxShadow: '0 8px 32px rgba(31, 38, 135, 0.08)',
          borderBottom: actualTheme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid rgba(255, 255, 255, 0.18)',
          zIndex: 1200,
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 1, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Notifications Bell Icon */}
            <IconButton
              onClick={handleNotificationOpen}
              sx={{
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.30)',
                boxShadow: '0 4px 12px rgba(31, 38, 135, 0.08)',
                transition: 'all 200ms ease',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.95)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              <Badge badgeContent={notifications.length} color="error">
                <Notifications fontSize="small" />
              </Badge>
            </IconButton>

            {/* Notifications Popover */}
            <Popover
              open={Boolean(notificationAnchor)}
              anchorEl={notificationAnchor}
              onClose={handleNotificationClose}
              anchorOrigin={{
                vertical: 'bottom',
                horizontal: 'right',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'right',
              }}
              PaperProps={{
                sx: {
                  mt: 1,
                  width: 400,
                  maxHeight: 500,
                  borderRadius: 2,
                  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.14)',
                },
              }}
            >
              <Box sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Notifications
                </Typography>
                <Divider sx={{ mb: 2 }} />
                {notifications.length > 0 ? (
                  <>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
                      {notifications.map((notif, index) => (
                        <Box
                          key={index}
                          sx={{
                            display: 'flex',
                            gap: 1.5,
                            p: 1.5,
                            background: '#f8f9fa',
                            borderRadius: 1.5,
                            transition: 'all 200ms ease',
                            cursor: notif.workflow_id ? 'pointer' : 'default',
                            '&:hover': notif.workflow_id ? {
                              background: '#e9ecef',
                              transform: 'translateX(4px)',
                            } : {},
                          }}
                          onClick={() => {
                            if (notif.workflow_id) {
                              navigate(`/workflow/${notif.workflow_id}`);
                              handleNotificationClose();
                            }
                          }}
                        >
                          {getNotificationIcon(notif.type)}
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: '#212529', mb: 0.5 }}>
                              {notif.message}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6c757d' }}>
                              {notif.time}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                    <Divider sx={{ mb: 2 }} />
                    <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'space-between' }}>
                      <Box
                        onClick={handleMarkAllRead}
                        sx={{
                          flex: 1,
                          py: 1,
                          px: 2,
                          textAlign: 'center',
                          background: '#f8f9fa',
                          borderRadius: 1.5,
                          cursor: 'pointer',
                          transition: 'all 200ms ease',
                          border: '1px solid #dee2e6',
                          '&:hover': {
                            background: '#e9ecef',
                            transform: 'translateY(-2px)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          },
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#495057' }}>
                          Mark all Read
                        </Typography>
                      </Box>
                      <Box
                        onClick={handleClearAll}
                        sx={{
                          flex: 1,
                          py: 1,
                          px: 2,
                          textAlign: 'center',
                          background: '#f8f9fa',
                          borderRadius: 1.5,
                          cursor: 'pointer',
                          transition: 'all 200ms ease',
                          border: '1px solid #dee2e6',
                          '&:hover': {
                            background: '#e9ecef',
                            transform: 'translateY(-2px)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          },
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#495057' }}>
                          Clear
                        </Typography>
                      </Box>
                    </Box>
                  </>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Notifications sx={{ fontSize: 48, color: '#dee2e6', mb: 1 }} />
                    <Typography variant="body2" sx={{ color: '#6c757d' }}>
                      No new notifications
                    </Typography>
                  </Box>
                )}
              </Box>
            </Popover>

            {/* Account Menu */}
            <Box
              onClick={handleAccountMenuOpen}
              role="button"
              tabIndex={0}
              aria-label="account menu"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.25,
                py: 0.75,
                borderRadius: 999,
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.30)',
                cursor: 'pointer',
                userSelect: 'none',
                boxShadow: '0 4px 12px rgba(31, 38, 135, 0.08)',
                transition: 'all 200ms ease',
                '&:hover': {
                  background: 'rgba(255, 255, 255, 0.95)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              <AccountCircle fontSize="small" />
              <Box sx={{ textAlign: 'left' }}>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
                  {user?.username || 'Account'}
                </Typography>
              </Box>
            </Box>
            <Menu
              anchorEl={accountMenuAnchor}
              open={Boolean(accountMenuAnchor)}
              onClose={handleAccountMenuClose}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              PaperProps={{
                sx: {
                  mt: 1,
                  minWidth: 200,
                  borderRadius: 2,
                  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.14)',
                },
              }}
            >
              <MenuItem
                onClick={() => {
                  handleAccountMenuClose();
                  navigate('/profile');
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <AccountCircle fontSize="small" />
                </ListItemIcon>
                My Profile
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleAccountMenuClose();
                  navigate('/activity');
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Timeline fontSize="small" />
                </ListItemIcon>
                My Activity
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleAccountMenuClose();
                  navigate('/settings');
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Settings fontSize="small" />
                </ListItemIcon>
                Settings
              </MenuItem>
              <MenuItem
                onClick={() => {
                  handleAccountMenuClose();
                  navigate('/llm-config');
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Tune fontSize="small" />
                </ListItemIcon>
                LLM Configuration
              </MenuItem>
              <Divider sx={{ my: 0.5 }} />
              <MenuItem
                onClick={() => {
                  handleAccountMenuClose();
                  handleLogout();
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Logout fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      <Box
        component="nav"
        sx={{ width: { sm: currentDrawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              background: actualTheme === 'dark' ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.70)',
              backdropFilter: 'blur(16px) saturate(180%)',
              borderRight: actualTheme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid rgba(255, 255, 255, 0.18)',
              boxShadow: '0 8px 32px rgba(31, 38, 135, 0.08)',
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: currentDrawerWidth,
              background: actualTheme === 'dark' ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.70)',
              backdropFilter: 'blur(16px) saturate(180%)',
              borderRight: actualTheme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid rgba(255, 255, 255, 0.18)',
              boxShadow: '0 8px 32px rgba(31, 38, 135, 0.08)',
              overflowX: 'hidden',
              transition: 'width 220ms ease',
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1, sm: 2, md: 3 },
          width: { xs: '100%', sm: `calc(100% - ${currentDrawerWidth}px)` },
          maxWidth: '100%',
          position: 'relative',
          zIndex: 1,
          background: 'transparent',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64, md: 72 }, flexShrink: 0 }} />
        <Box
          sx={{
            position: 'relative',
            borderRadius: { xs: 2, sm: 3, md: 4 },
            border: actualTheme === 'dark' ? '1px solid rgba(71, 85, 105, 0.3)' : '1px solid rgba(255, 255, 255, 0.18)',
            background: actualTheme === 'dark' ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.70)',
            backdropFilter: 'blur(16px) saturate(180%)',
            boxShadow: '0 8px 32px rgba(31, 38, 135, 0.08)',
            overflow: 'hidden',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <Outlet />
          </Box>
          <Box
            component="footer"
            sx={{
              py: 1.5,
              px: 3,
              flexShrink: 0,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                textAlign: 'center',
                color: 'rgba(15, 23, 42, 0.70)',
                fontSize: '0.8125rem',
                fontWeight: 500,
              }}
            >
              © {new Date().getFullYear()} NTT DATA. All rights reserved. | Regulatory Reporting AI Platform
            </Typography>
          </Box>
        </Box>
      </Box>
      <style>{`
        @keyframes dashboard-active-pulse {
          0%, 100% {
            transform: translateY(-50%) scale(1);
            opacity: 1;
          }
          50% {
            transform: translateY(-50%) scale(1.15);
            opacity: 0.85;
          }
        }
        
        @keyframes slideInFromLeft {
          from {
            transform: translateX(-30px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </Box>
  );
};
