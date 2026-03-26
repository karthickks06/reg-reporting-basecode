"use client";

import { useEffect, useRef } from "react";
import { BATab } from "./BATab";
import { JobProgressCard } from "../jobs/JobProgressCard";
import { fullJobError, hasExpandedJobError, summarizeJobError } from "../jobs/jobErrorSummary";
import { JobNotificationToast } from "../jobs/JobNotificationToast";
import { useJobs } from "../../hooks/useJobs";
import type { JobStatus } from "../jobs/JobProgressCard";
import type { Artifact, BAAnalysisMode, GapDiagnostics, GapRow, UploadArtifactFn } from "./types";
import { useTerminalJobNotifications } from "./useTerminalJobNotifications";

type BATabWithJobsProps = {
  busy: boolean;
  baReady: boolean;
  gapRunId: number | null;
  hasFunctionalSpec: boolean;
  baMode: BAAnalysisMode;
  baUserContext: string;
  gapRows: GapRow[];
  gapDiagnostics: GapDiagnostics | null;
  remediationStatuses: string[];
  remediationArtifactIds: number[];
  remediationUserContext: string;
  fcaArtifactId: number | "";
  modelArtifactId: number | "";
  compareBaselineId: number | "";
  compareChangedId: number | "";
  compareBusy: boolean;
  fcaOptions: Artifact[];
  modelOptions: Artifact[];
  baFcaFile: File | null;
  setBaMode: (mode: BAAnalysisMode) => void;
  setBaUserContext: (value: string) => void;
  setRemediationStatuses: (value: string[]) => void;
  setRemediationArtifactIds: (value: number[]) => void;
  setRemediationUserContext: (value: string) => void;
  setFcaArtifactId: (value: number | "") => void;
  setModelArtifactId: (value: number | "") => void;
  setCompareBaselineId: (value: number | "") => void;
  setCompareChangedId: (value: number | "") => void;
  setBaFcaFile: (file: File | null) => void;
  runGap: () => Promise<void>;
  runGapRemediation: () => Promise<void>;
  runCompare: () => Promise<void>;
  uploadArtifact: UploadArtifactFn;
  supplementalArtifactOptions: Artifact[];
  pendingForMe: boolean;
  actorName?: string;
  projectId: string;
  activeWorkflowId: number | null;
  onGapRunCompleted?: (runId: number) => Promise<void> | void;
  showJobNotifications?: boolean;
  showInlineJobPanels?: boolean;
  addToast?: (kind: "success" | "error", text: string) => void;
};

function getJobTimestamp(job: JobStatus): number {
  const value = job.completed_at || job.started_at || job.created_at;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function BATabWithJobs(props: BATabWithJobsProps) {
  const actorName = props.actorName || "BA";
  const { jobs } = useJobs({
    actor: actorName,
    projectId: props.projectId,
    workflowId: props.activeWorkflowId,
  });
  const processedCompletionIdsRef = useRef<Set<string>>(new Set());
  const announcedRunningJobScopeRef = useRef<string>("");

  // Track active jobs
  const baJobs = jobs.filter((job) => job.job_type === "gap_analysis" || job.job_type === "gap_remediation");
  const activeJobs = baJobs.filter(
    (job) => job.status === "pending" || job.status === "running"
  );
  const latestActiveBaJob = [...activeJobs].sort((a, b) => getJobTimestamp(b) - getJobTimestamp(a))[0];
  const latestCompletedBaJob = baJobs
    .filter((job) => job.status === "completed" && Number(job.result_run_id || 0) > 0)
    .sort((a, b) => getJobTimestamp(b) - getJobTimestamp(a))[0];
  const latestTerminalBaJob = baJobs
    .filter((job) => job.status === "completed" || job.status === "failed")
    .sort((a, b) => getJobTimestamp(b) - getJobTimestamp(a))[0];
  const failedJobSummary = summarizeJobError(latestTerminalBaJob?.error_message);
  const showFailedJobDetails = hasExpandedJobError(latestTerminalBaJob?.error_message);
  const failedJobDetails = fullJobError(latestTerminalBaJob?.error_message);
  const { notifications, dismissNotification: handleDismissNotification } = useTerminalJobNotifications({
    jobs,
    resetScope: `${actorName}:${props.projectId}:${props.activeWorkflowId ?? "none"}`,
    onTerminalTransition: (job) => {
      const isBaGapJob = job.job_type === "gap_analysis" || job.job_type === "gap_remediation";
      const runId = Number(job.result_run_id || 0);
      if (
        props.onGapRunCompleted &&
        job.status === "completed" &&
        isBaGapJob &&
        runId > 0 &&
        !processedCompletionIdsRef.current.has(String(job.id))
      ) {
        processedCompletionIdsRef.current.add(String(job.id));
        const completedLabel = job.job_type === "gap_remediation" ? "Gap remediation completed." : "Gap analysis completed.";
        props.addToast?.("success", completedLabel);
        void props.onGapRunCompleted(runId);
      }
      if (job.status === "failed" && isBaGapJob) {
        const fallbackMessage = job.job_type === "gap_remediation" ? "Gap remediation failed." : "Gap analysis failed.";
        props.addToast?.("error", job.error_message || fallbackMessage);
      }
    },
  });

  useEffect(() => {
    processedCompletionIdsRef.current = new Set();
    announcedRunningJobScopeRef.current = "";
  }, [props.projectId, props.activeWorkflowId, actorName]);

  useEffect(() => {
    if (!props.activeWorkflowId || activeJobs.length === 0) return;
    const latestActiveJob = latestActiveBaJob;
    if (!latestActiveJob) return;
    const scopeKey = `${props.projectId}:${props.activeWorkflowId}:${latestActiveJob.id}:${latestActiveJob.status}`;
    if (announcedRunningJobScopeRef.current === scopeKey) return;
    announcedRunningJobScopeRef.current = scopeKey;

    const jobLabel = latestActiveJob.job_type === "gap_remediation" ? "Gap remediation" : "Gap analysis";
    const statusLabel = latestActiveJob.status === "pending" ? "queued" : "running";
    props.addToast?.("success", `${jobLabel} is already ${statusLabel} for this workflow. Inputs are locked until it finishes.`);
  }, [activeJobs, latestActiveBaJob, props.activeWorkflowId, props.projectId, props.addToast]);

  useEffect(() => {
    const runId = Number(latestCompletedBaJob?.result_run_id || 0);
    if (!props.onGapRunCompleted || runId <= 0) return;
    if (props.gapRunId === runId) return;

    const completionKey = `run:${runId}`;
    if (processedCompletionIdsRef.current.has(completionKey)) return;
    processedCompletionIdsRef.current.add(completionKey);
    void props.onGapRunCompleted(runId);
  }, [latestCompletedBaJob, props.onGapRunCompleted, props.gapRunId]);

  const isBackgroundJobRunning = activeJobs.some((job) => job.status === "running" || job.status === "pending");
  const showJobNotifications = props.showJobNotifications ?? true;
  const showInlineJobPanels = props.showInlineJobPanels ?? true;

  return (
    <div className="ba-jobs-stack">
      {/* Job Notifications */}
      {showJobNotifications && (
        <div className="job-notification-container">
          {notifications.map((job) => (
            <JobNotificationToast
              key={job.id}
              job={job}
              onDismiss={handleDismissNotification}
            />
          ))}
        </div>
      )}

      {/* Active Jobs Panel */}
      {showInlineJobPanels && activeJobs.length > 0 && (
        <div className="panel ba-active-jobs-panel">
          <div className="ba-active-jobs-panel__head">
            <h3 className="ba-active-jobs-panel__title">Active Jobs</h3>
            <span className="panel-badge badge-amber">{activeJobs.length}</span>
          </div>
          <div className="ba-active-jobs-panel__list">
            {activeJobs.map((job) => (
              <JobProgressCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      )}

      {!isBackgroundJobRunning && latestTerminalBaJob?.status === "failed" && (
        <div className="panel ba-active-jobs-panel">
          <div className="job-inline-alert error">
            <span className="job-inline-alert__icon">!</span>
            <div>
              <strong>{latestTerminalBaJob.job_type === "gap_remediation" ? "Gap remediation failed" : "Gap analysis failed"}</strong>
              <p className="error-details">
                {failedJobSummary || "The last BA background job did not complete. Review inputs and retry."}
              </p>
              {showFailedJobDetails && (
                <details className="job-error-details">
                  <summary>Show full error</summary>
                  <pre>{failedJobDetails}</pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Original BA Tab */}
      <BATab
        {...props}
        isBackgroundJobRunning={isBackgroundJobRunning}
        activeBackgroundJob={latestActiveBaJob ? {
          jobType: latestActiveBaJob.job_type as "gap_analysis" | "gap_remediation",
          status: latestActiveBaJob.status as "pending" | "running",
          progressMessage: latestActiveBaJob.progress_message,
          progressPct: latestActiveBaJob.progress_pct,
        } : null}
      />
    </div>
  );
}
