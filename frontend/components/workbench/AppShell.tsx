"use client";

import { useEffect, useState, type ReactNode } from "react";

import { ActionIcon } from "./ActionIcon";
import { projectOptionsWithCurrent } from "./projectOptions";
type AppNavIconName = "home" | "jobs" | "admin" | "analytics" | "workflow" | "artifacts" | "reviewer" | "activity";

type AppNavItem = {
  key: string;
  label: string;
  icon?: AppNavIconName;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  badge?: string | number | null;
  subItems?: AppNavItem[];
};

type AppShellProps = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
  workflowName?: string;
  stageLabel?: string;
  projectId?: string;
  setProjectId?: (value: string) => void;
  backendUp?: boolean | null;
  backendStatusText?: string;
  llmUp?: boolean | null;
  navItems: AppNavItem[];
  headerActions?: ReactNode;
  summaryBar?: ReactNode;
  statusSignal?: { label: string; tone?: "running" | "idle" };
  children: ReactNode;
};

export function AppShell({
  title,
  subtitle,
  backLabel,
  onBack,
  workflowName,
  stageLabel,
  projectId,
  setProjectId,
  backendUp,
  backendStatusText,
  llmUp,
  navItems,
  headerActions,
  summaryBar,
  statusSignal,
  children
}: AppShellProps) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [expandedNav, setExpandedNav] = useState<string | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const projectOptions = projectOptionsWithCurrent(projectId);

  useEffect(() => {
    const saved = window.localStorage.getItem("regai-theme");
    const nextTheme = saved === "dark" || saved === "light" ? saved : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem("regai-theme", nextTheme);
  };

  const showBackendStatusBanner = Boolean(
    backendStatusText && !(backendUp === true && llmUp === false)
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row gap-4 p-2 lg:p-4">
      <aside className="w-full lg:w-64 flex-shrink-0 bg-card rounded-xl shadow-xl border border-border overflow-hidden">
        <div className="p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b border-border">
          <div className="flex flex-col gap-3">
            <img 
              src="/brand/GlobalLogo_NTTDATA_FutureBlue_RGB.png" 
              alt="NTT DATA logo" 
              style={{ width: 'auto', height: '45px', maxWidth: '100%', objectFit: 'contain' }}
            />
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-bold text-foreground">Regulatory Compliance Workbench</h2>
              <p className="text-xs text-muted-foreground">AI-assisted regulatory delivery</p>
            </div>
          </div>
        </div>

        <nav className="p-3 space-y-1" aria-label="Primary">
          {navItems.map((item) => {
            const hasSubItems = item.subItems && item.subItems.length > 0;
            const isExpanded = expandedNav === item.key;
            const hasActiveSubItem = hasSubItems && item.subItems?.some(sub => sub.active);

            const content = (
              <>
                <span className="flex items-center gap-3 flex-1">
                  {item.icon ? <ActionIcon name={item.icon} className="action-icon w-5 h-5" /> : null}
                  <span className="font-medium">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge !== null && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-primary text-primary-foreground">
                    {item.badge}
                  </span>
                )}
                {hasSubItems && (
                  <ActionIcon 
                    name="chevron-down" 
                    className={`action-icon w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                  />
                )}
              </>
            );

            const baseClasses = `flex items-center justify-between gap-2 px-4 py-3 rounded-lg transition-all duration-200 ${
              item.active || hasActiveSubItem
                ? "bg-primary text-primary-foreground shadow-md font-semibold" 
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`;

            const handleClick = () => {
              if (hasSubItems) {
                setExpandedNav(isExpanded ? null : item.key);
              }
              if (item.onClick) {
                item.onClick();
              }
            };

            return (
              <div key={item.key}>
                {item.href ? (
                  <a
                    className={baseClasses}
                    href={item.href}
                    aria-current={item.active ? "page" : undefined}
                    onClick={(e) => {
                      if (hasSubItems) {
                        e.preventDefault();
                        handleClick();
                      }
                    }}
                  >
                    {content}
                  </a>
                ) : (
                  <button
                    className={`${baseClasses} text-left w-full`}
                    onClick={handleClick}
                    type="button"
                    aria-pressed={item.active ? "true" : "false"}
                  >
                    {content}
                  </button>
                )}

                {hasSubItems && isExpanded && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-border pl-2">
                    {item.subItems?.map((subItem) => {
                      const subContent = (
                        <>
                          <span className="flex items-center gap-2 flex-1">
                            {subItem.icon ? <ActionIcon name={subItem.icon} className="action-icon w-4 h-4" /> : null}
                            <span className="text-sm font-medium">{subItem.label}</span>
                          </span>
                          {subItem.badge !== undefined && subItem.badge !== null && (
                            <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-primary text-primary-foreground">
                              {subItem.badge}
                            </span>
                          )}
                        </>
                      );

                      const subBaseClasses = `flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                        subItem.active
                          ? "bg-accent text-accent-foreground font-semibold" 
                          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                      }`;

                      if (subItem.href) {
                        return (
                          <a
                            key={subItem.key}
                            className={subBaseClasses}
                            href={subItem.href}
                            aria-current={subItem.active ? "page" : undefined}
                          >
                            {subContent}
                          </a>
                        );
                      }

                      return (
                        <button
                          key={subItem.key}
                          className={`${subBaseClasses} text-left w-full`}
                          onClick={subItem.onClick}
                          type="button"
                          disabled={!subItem.onClick}
                          aria-pressed={subItem.active ? "true" : "false"}
                        >
                          {subContent}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <header className="bg-gradient-to-br from-blue-950/20 via-card to-card rounded-xl shadow-lg border border-border overflow-hidden">
          <div className="p-4 lg:p-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {onBack ? (
                    <button 
                      className="flex items-center justify-center p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors" 
                      onClick={onBack} 
                      type="button"
                      aria-label={backLabel || "Back to Role Select"}
                    >
                      <ActionIcon name="back" className="action-icon w-5 h-5" />
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 lg:ml-auto">
                  <div className="flex flex-wrap items-center gap-2">
                    {projectId && setProjectId ? (
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-muted-foreground whitespace-nowrap">Workspace</span>
                        <select 
                          className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary" 
                          value={projectId} 
                          onChange={(e) => setProjectId(e.target.value)}
                        >
                          {projectOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>

                  {(backendUp !== undefined && backendUp !== null) || (llmUp !== undefined && llmUp !== null) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {backendUp !== undefined && backendUp !== null ? (
                        <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                          backendUp ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          <ActionIcon name="system" className="action-icon w-3.5 h-3.5" />
                          {backendUp ? "System Up" : "System Down"}
                        </span>
                      ) : null}
                      {llmUp !== undefined && llmUp !== null ? (
                        <span className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                          llmUp ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        }`}>
                          <ActionIcon name="bot" className="action-icon w-3.5 h-3.5" />
                          {llmUp ? "Agent Online" : "Agent Offline"}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <details className="notification-center" open={notificationOpen}>
                      <summary 
                        className="notification-center__toggle" 
                        onClick={(e) => {
                          e.preventDefault();
                          setNotificationOpen(!notificationOpen);
                        }}
                      >
                        <ActionIcon name="bell" className="action-icon w-5 h-5" />
                        <span className="notification-center__badge">3</span>
                      </summary>
                      {notificationOpen && (
                        <div className="notification-center__panel">
                          <div className="notification-center__header">
                            <div>
                              <h3 className="notification-center__title">Notifications</h3>
                              <p className="notification-center__subtitle">Recent workflow, job, and action events stay here until you clear them.</p>
                            </div>
                            <div className="notification-center__actions">
                              <button className="mini-btn" type="button">Mark all read</button>
                              <button className="mini-btn" type="button">Clear</button>
                            </div>
                          </div>
                          <div className="notification-center__list">
                            <button className="notification-center__item unread success" type="button">
                              <span className="notification-center__dot"></span>
                              <div className="notification-center__copy">
                                <strong>Gap analysis completed</strong>
                                <span>Your workflow is ready for review</span>
                              </div>
                            </button>
                            <button className="notification-center__item unread info" type="button">
                              <span className="notification-center__dot"></span>
                              <div className="notification-center__copy">
                                <strong>New artifact generated</strong>
                                <span>SQL script has been created</span>
                              </div>
                            </button>
                            <button className="notification-center__item unread error" type="button">
                              <span className="notification-center__dot"></span>
                              <div className="notification-center__copy">
                                <strong>Validation failed</strong>
                                <span>Please review the error details</span>
                              </div>
                            </button>
                          </div>
                        </div>
                      )}
                    </details>

                    <button
                      className="flex items-center justify-center p-2 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
                      onClick={toggleTheme}
                      type="button"
                      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
                    >
                      <ActionIcon name={theme === "light" ? "sun" : "moon"} className="action-icon w-5 h-5" />
                    </button>
                    {headerActions}
                  </div>
                </div>
              </div>

              {(workflowName || stageLabel || statusSignal) && (
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workflow</span>
                  {workflowName ? <strong className="text-foreground">{workflowName}</strong> : null}
                  {stageLabel ? <span className="px-2 py-1 text-xs font-medium rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{stageLabel}</span> : null}
                  {statusSignal ? (
                    <span className={`flex items-center gap-2 px-3 py-1 text-xs font-bold rounded-full ${
                      statusSignal.tone === "running" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${statusSignal.tone === "running" ? "bg-blue-500 animate-pulse" : "bg-gray-400"}`} />
                      {statusSignal.label}
                    </span>
                  ) : null}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <h1 className="text-2xl lg:text-3xl font-bold text-foreground">{title}</h1>
                {subtitle ? <p className="text-sm text-muted-foreground mt-1">{subtitle}</p> : null}
              </div>
            </div>
          </div>

          {showBackendStatusBanner ? (
            <div className="px-4 lg:px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
              {backendStatusText}
            </div>
          ) : null}
        </header>

        {summaryBar ? <div className="bg-card rounded-xl shadow-lg border border-border p-4">{summaryBar}</div> : null}
        <div className="flex-1 bg-card rounded-xl shadow-lg border border-border overflow-auto">{children}</div>
      </div>
    </div>
  );
}
