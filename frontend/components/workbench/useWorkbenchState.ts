import { useState } from "react";

import { DEFAULT_PROJECT_ID } from "./projectOptions";
import type { AgentTab, Artifact, BAAnalysisMode, CompareResult, GapDiagnostics, GapRow, NotificationItem, Persona, Toast, WorkflowItem, XmlValidationState } from "./types";

export type AuditEntry = {
  id: number;
  level: "info" | "success" | "warn";
  text: string;
  at: string;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  at: string;
};

export function useWorkbenchState() {
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [persona, setPersona] = useState<Persona | "">("");
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<number | null>(null);
  const [workflowName, setWorkflowName] = useState("");
  const [workflowPsdVersion, setWorkflowPsdVersion] = useState("");
  const [workflowNameError, setWorkflowNameError] = useState("");
  const [workflowComment, setWorkflowComment] = useState("");
  const [sendBackReasonCode, setSendBackReasonCode] = useState("");
  const [sendBackReasonDetail, setSendBackReasonDetail] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [backendStatusText, setBackendStatusText] = useState("");
  const [llmUp, setLlmUp] = useState<boolean | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeAgentTab, setActiveAgentTab] = useState<AgentTab>("ba");
  const [auditTrail, setAuditTrail] = useState<AuditEntry[]>([]);

  const [baFcaFile, setBaFcaFile] = useState<File | null>(null);
  const [devDataFile, setDevDataFile] = useState<File | null>(null);
  const [revXsdFile, setRevXsdFile] = useState<File | null>(null);

  const [baMode, setBaMode] = useState<BAAnalysisMode>("psd_model");
  const [fcaArtifactId, setFcaArtifactId] = useState<number | "">("");
  const [modelArtifactId, setModelArtifactId] = useState<number | "">("");
  const [dataArtifactId, setDataArtifactId] = useState<number | "">("");
  const [reportXmlArtifactId, setReportXmlArtifactId] = useState<number | "">("");
  const [xsdArtifactId, setXsdArtifactId] = useState<number | "">("");
  const [compareBaselineId, setCompareBaselineId] = useState<number | "">("");
  const [compareChangedId, setCompareChangedId] = useState<number | "">("");
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);

  const [gapRunId, setGapRunId] = useState<number | null>(null);
  const [gapRows, setGapRows] = useState<GapRow[]>([]);
  const [gapDiagnostics, setGapDiagnostics] = useState<GapDiagnostics | null>(null);
  const [remediationStatuses, setRemediationStatuses] = useState<string[]>(["Missing", "Partial Match"]);
  const [remediationArtifactIds, setRemediationArtifactIds] = useState<number[]>([]);
  const [remediationUserContext, setRemediationUserContext] = useState("");
  const [baUserContext, setBaUserContext] = useState("");
  const [sqlRunId, setSqlRunId] = useState<number | null>(null);
  const [sqlScript, setSqlScript] = useState("");
  const [devUserContext, setDevUserContext] = useState("");
  const [reportXmlLinked, setReportXmlLinked] = useState(false);
  const [reportXmlPreview, setReportXmlPreview] = useState("");
  const [xmlRunId, setXmlRunId] = useState<number | null>(null);
  const [xmlValidation, setXmlValidation] = useState<XmlValidationState | null>(null);
  const [revUserContext, setRevUserContext] = useState("");

  const [chatInput, setChatInput] = useState("");
  const [chatIncludeAll, setChatIncludeAll] = useState(true);
  const [chatModel, setChatModel] = useState("gpt-4.1:ntt");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatResponse, setChatResponse] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  function pushAudit(level: AuditEntry["level"], text: string) {
    const entry: AuditEntry = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      level,
      text,
      at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    };
    setAuditTrail((prev) => [entry, ...prev].slice(0, 25));
  }

  function addNotification(kind: NotificationItem["kind"], text: string, source = "app") {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const at = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setNotifications((prev) => [{ id, kind, text, at, read: false, source }, ...prev].slice(0, 60));
  }

  function markNotificationRead(id: number) {
    setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }

  function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }

  function clearNotifications() {
    setNotifications([]);
  }

  function addToast(kind: Toast["kind"], text: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, kind, text }]);
    addNotification(kind, text, "toast");
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  return {
    projectId,
    setProjectId,
    persona,
    setPersona,
    workflows,
    setWorkflows,
    activeWorkflowId,
    setActiveWorkflowId,
    workflowName,
    setWorkflowName,
    workflowPsdVersion,
    setWorkflowPsdVersion,
    workflowNameError,
    setWorkflowNameError,
    workflowComment,
    setWorkflowComment,
    sendBackReasonCode,
    setSendBackReasonCode,
    sendBackReasonDetail,
    setSendBackReasonDetail,
    workflowBusy,
    setWorkflowBusy,
    busy,
    setBusy,
    message,
    setMessage,
    artifacts,
    setArtifacts,
    backendUp,
    setBackendUp,
    backendStatusText,
    setBackendStatusText,
    llmUp,
    setLlmUp,
    toasts,
    setToasts,
    notifications,
    setNotifications,
    activeAgentTab,
    setActiveAgentTab,
    auditTrail,
    setAuditTrail,
    baFcaFile,
    setBaFcaFile,
    devDataFile,
    setDevDataFile,
    revXsdFile,
    setRevXsdFile,
    baMode,
    setBaMode,
    fcaArtifactId,
    setFcaArtifactId,
    modelArtifactId,
    setModelArtifactId,
    dataArtifactId,
    setDataArtifactId,
    reportXmlArtifactId,
    setReportXmlArtifactId,
    xsdArtifactId,
    setXsdArtifactId,
    compareBaselineId,
    setCompareBaselineId,
    compareChangedId,
    setCompareChangedId,
    compareResult,
    setCompareResult,
    compareBusy,
    setCompareBusy,
    gapRunId,
    setGapRunId,
    gapRows,
    setGapRows,
    gapDiagnostics,
    setGapDiagnostics,
    remediationStatuses,
    setRemediationStatuses,
    remediationArtifactIds,
    setRemediationArtifactIds,
    remediationUserContext,
    setRemediationUserContext,
    baUserContext,
    setBaUserContext,
    sqlRunId,
    setSqlRunId,
    sqlScript,
    setSqlScript,
    devUserContext,
    setDevUserContext,
    reportXmlLinked,
    setReportXmlLinked,
    reportXmlPreview,
    setReportXmlPreview,
    xmlRunId,
    setXmlRunId,
    xmlValidation,
    setXmlValidation,
    revUserContext,
    setRevUserContext,
    chatInput,
    setChatInput,
    chatIncludeAll,
    setChatIncludeAll,
    chatModel,
    setChatModel,
    chatBusy,
    setChatBusy,
    chatResponse,
    setChatResponse,
    chatHistory,
    setChatHistory,
    addNotification,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    addToast,
    pushAudit
  };
}

export type WorkbenchState = ReturnType<typeof useWorkbenchState>;
