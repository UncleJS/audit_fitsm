// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, FileText, History, Layers3, Save, Target } from "lucide-react";
import ProcessPanel from "../../components/audit-workspace/process-panel";
import { ProcessMobileNav, ProcessSidebarNav } from "../../components/audit-workspace/process-nav";
import PageShell from "../../components/layout/page-shell";
import PageSection from "../../components/layout/page-section";
import { Badge, statusVariant } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { formatDateOnly, formatLocalTimestamp } from "../../lib/date-format";
import { decodeHtmlEntities } from "../../lib/text-format";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:1261";
const demoToken = process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "1" ? process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "" : "";
const AUTOSAVE_DELAY_MS = 1500;

const authHeaders = (token: string, json = false) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

export default function AuditWorkspacePage() {
  const params = useParams();
  const auditId = Number(params.auditId);
  const [mounted, setMounted] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [workspace, setWorkspace] = useState<any>(null);
  const [scopeEdits, setScopeEdits] = useState<Record<string, any>>({});
  const [statusEdit, setStatusEdit] = useState("draft");
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [detailEdits, setDetailEdits] = useState<Record<string, any>>({});
  const [conclusionEdit, setConclusionEdit] = useState("");
  const [historyByAssessment, setHistoryByAssessment] = useState<Record<string, any>>({});
  const [noteDraftByAssessment, setNoteDraftByAssessment] = useState<Record<string, string>>({});
  const [openHistoryByAssessment, setOpenHistoryByAssessment] = useState<Record<string, boolean>>({});
  const [loadingHistoryByAssessment, setLoadingHistoryByAssessment] = useState<Record<string, boolean>>({});
  const [pdfExports, setPdfExports] = useState<any[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadingExportId, setDownloadingExportId] = useState<number | null>(null);
  const [downloadingCsvKind, setDownloadingCsvKind] = useState<string | null>(null);
  const [openProcessByCode, setOpenProcessByCode] = useState<Record<string, boolean>>({});
  const [panelDensityByProcess, setPanelDensityByProcess] = useState<Record<string, "comfortable" | "compact">>({});
  const [activeProcessCode, setActiveProcessCode] = useState("");
  const [message, setMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [autosaveState, setAutosaveState] = useState<{ status: "idle" | "saving" | "saved" | "error"; section: string; detail: string }>({
    status: "idle",
    section: "",
    detail: ""
  });
  const [autosaveRetryTick, setAutosaveRetryTick] = useState(0);
  const lastSavedSnapshotsRef = useRef<Record<string, string>>({
    scope: "",
    assessments: "",
    details: "",
    conclusion: ""
  });
  const autosaveInFlightRef = useRef<Record<string, boolean>>({
    scope: false,
    assessments: false,
    details: false,
    conclusion: false
  });
  const autosavePendingRef = useRef<Record<string, boolean>>({
    scope: false,
    assessments: false,
    details: false,
    conclusion: false
  });
  const autosaveErrorsRef = useRef<Record<string, string>>({
    scope: "",
    assessments: "",
    details: "",
    conclusion: ""
  });
  const hasLoadedWorkspaceRef = useRef(false);

  const normalizeAssessmentItems = (source: Record<string, any>) =>
    Object.values(source)
      .map((item: any) => ({
        requirementCode: String(item.requirementCode ?? ""),
        scoreLabel: String(item.scoreLabel ?? "Select …"),
        commentText: String(item.commentText ?? ""),
        evidenceText: String(item.evidenceText ?? "")
      }))
      .sort((left: any, right: any) => left.requirementCode.localeCompare(right.requirementCode));

  const getChangedAssessmentItems = () => {
    const currentItems = normalizeAssessmentItems(edits);
    let previousItems: any[] = [];

    try {
      previousItems = JSON.parse(lastSavedSnapshotsRef.current.assessments || "[]");
    } catch {
      previousItems = [];
    }

    const previousByRequirement = new Map<string, string>(
      previousItems.map((item: any) => [String(item.requirementCode ?? ""), JSON.stringify(item)])
    );

    return currentItems.filter((item: any) => previousByRequirement.get(item.requirementCode) !== JSON.stringify(item));
  };

  const tokenMissing = useMemo(() => !authToken, [authToken]);
  const canEdit = workspace?.permissions?.canEdit ?? false;
  const canLeadEdit = workspace?.permissions?.canLeadEdit ?? false;
  const canExport = workspace?.permissions?.canExport ?? false;
  const canManageStatus = workspace?.permissions?.canManageStatus ?? false;
  const canManageScopeTargets = workspace?.permissions?.canManageScopeTargets ?? false;
  const isLockedForNonLead = workspace?.permissions?.isLockedForNonLead ?? false;
  const allowedStatusTransitions = workspace?.permissions?.allowedStatusTransitions ?? [];
  const auditStatus = String(workspace?.audit?.status ?? "");
  const scopeSnapshot = useMemo(
    () =>
      JSON.stringify(
        Object.values(scopeEdits)
          .map((item: any) => ({
            processCode: String(item.processCode ?? ""),
            certGoalLevel: String(item.certGoalLevel ?? "2"),
            customGoalLevel: String(item.customGoalLevel ?? ""),
            scopeCode: String(item.scopeCode ?? "IN_SCOPE")
          }))
          .sort((left: any, right: any) => left.processCode.localeCompare(right.processCode))
      ),
    [scopeEdits]
  );
  const assessmentsSnapshot = useMemo(
    () => JSON.stringify(normalizeAssessmentItems(edits)),
    [edits]
  );
  const detailsSnapshot = useMemo(
    () =>
      JSON.stringify(
        Object.values(detailEdits)
          .map((item: any) => ({
            fieldKey: String(item.fieldKey ?? ""),
            responseText: String(item.responseText ?? ""),
            noteText: String(item.noteText ?? "")
          }))
          .sort((left: any, right: any) => left.fieldKey.localeCompare(right.fieldKey))
      ),
    [detailEdits]
  );
  const conclusionSnapshot = useMemo(
    () => JSON.stringify({ conclusionText: String(conclusionEdit ?? "") }),
    [conclusionEdit]
  );
  const hasUnsavedChanges = !!workspace && (
    scopeSnapshot !== lastSavedSnapshotsRef.current.scope ||
    assessmentsSnapshot !== lastSavedSnapshotsRef.current.assessments ||
    detailsSnapshot !== lastSavedSnapshotsRef.current.details ||
    conclusionSnapshot !== lastSavedSnapshotsRef.current.conclusion
  );

  const loadWorkspace = async () => {
    const res = await fetch(`${apiUrl}/audits/${auditId}/workspace`, {
      headers: authHeaders(authToken),
      cache: "no-store"
    });

    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined") {
        window.sessionStorage.removeItem("audit_fitsm_token");
        setAuthToken("");
        window.location.href = "/login";
        return;
      }
      setWorkspace(null);
      hasLoadedWorkspaceRef.current = false;
      setMessage("Unable to load audit workspace.");
      return;
    }

    const data = await res.json();
    setWorkspace(data);
    setStatusEdit(data.audit?.status ?? "draft");

    const nextScopeEdits: Record<string, any> = {};
    const nextOpenPanels: Record<string, boolean> = {};
    for (const group of data.groupedProcesses ?? []) {
      nextScopeEdits[String(group.processCode)] = {
        processCode: group.processCode,
        certGoalLevel: group.certGoalLevel != null ? String(group.certGoalLevel) : "2",
        customGoalLevel: group.customGoalLevel != null ? String(group.customGoalLevel) : "",
        scopeCode: group.scopeCode ?? "IN_SCOPE"
      };
      nextOpenPanels[String(group.processCode)] = true;
    }
    setScopeEdits(nextScopeEdits);
    setOpenProcessByCode((prev) => ({ ...nextOpenPanels, ...prev }));

    const nextEdits: Record<string, any> = {};
    for (const group of data.groupedProcesses ?? []) {
      for (const req of group.requirements ?? []) {
        nextEdits[String(req.assessmentId)] = {
          requirementCode: req.requirementCode,
          scoreLabel: req.scoreLabel ?? "Select …",
          commentText: req.commentText ?? "",
          evidenceText: req.evidenceText ?? ""
        };
      }
    }
    setEdits(nextEdits);

    const nextDetails: Record<string, any> = {};
    for (const detail of data.details ?? []) {
      nextDetails[String(detail.field_key)] = {
        fieldKey: detail.field_key,
        responseText: detail.response_text ?? "",
        noteText: detail.note_text ?? ""
      };
    }
    setDetailEdits(nextDetails);
    setConclusionEdit(data.conclusion?.conclusion_text ?? "");
    lastSavedSnapshotsRef.current = {
      scope: JSON.stringify(
        Object.values(nextScopeEdits)
          .map((item: any) => ({
            processCode: String(item.processCode ?? ""),
            certGoalLevel: String(item.certGoalLevel ?? "2"),
            customGoalLevel: String(item.customGoalLevel ?? ""),
            scopeCode: String(item.scopeCode ?? "IN_SCOPE")
          }))
          .sort((left: any, right: any) => left.processCode.localeCompare(right.processCode))
      ),
      assessments: JSON.stringify(
        normalizeAssessmentItems(nextEdits)
      ),
      details: JSON.stringify(
        Object.values(nextDetails)
          .map((item: any) => ({
            fieldKey: String(item.fieldKey ?? ""),
            responseText: String(item.responseText ?? ""),
            noteText: String(item.noteText ?? "")
          }))
          .sort((left: any, right: any) => left.fieldKey.localeCompare(right.fieldKey))
      ),
      conclusion: JSON.stringify({ conclusionText: String(data.conclusion?.conclusion_text ?? "") })
    };
    autosavePendingRef.current = {
      scope: false,
      assessments: false,
      details: false,
      conclusion: false
    };
    autosaveErrorsRef.current = {
      scope: "",
      assessments: "",
      details: "",
      conclusion: ""
    };
    hasLoadedWorkspaceRef.current = true;
    setAutosaveState({ status: "idle", section: "", detail: "" });
    setLastSavedAt(String(data.audit?.updated_at_UTC ?? ""));

    const exportsRes = await fetch(`${apiUrl}/audits/${auditId}/exports`, {
      headers: authHeaders(authToken),
      cache: "no-store"
    });
    if (exportsRes.ok) {
      setPdfExports(await exportsRes.json());
    } else {
      setPdfExports([]);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedToken = window.sessionStorage.getItem("audit_fitsm_token") || "";
    const storedDensity = window.sessionStorage.getItem("audit_fitsm_workspace_density_by_process");
    setAuthToken(storedToken || demoToken);
    if (storedDensity) {
      try {
        const parsed = JSON.parse(storedDensity);
        if (parsed && typeof parsed === "object") {
          setPanelDensityByProcess(parsed);
        }
      } catch {
        // ignore invalid persisted state
      }
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!authToken && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [mounted, authToken]);

  useEffect(() => {
    if (auditId && authToken) {
      loadWorkspace();
    }
  }, [auditId, authToken]);

  useEffect(() => {
    if (!workspace?.groupedProcesses?.length || typeof window === "undefined") return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-process-panel]"));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target instanceof HTMLElement) {
          setActiveProcessCode(visible.target.dataset.processCode ?? "");
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.2, 0.4, 0.7] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [workspace?.groupedProcesses?.length]);

  const updatePanelDensity = (processCode: string, density: "comfortable" | "compact") => {
    setPanelDensityByProcess((prev) => {
      const next = { ...prev, [processCode]: density };
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("audit_fitsm_workspace_density_by_process", JSON.stringify(next));
      }
      return next;
    });
  };

  const scrollToProcess = (processCode: string) => {
    if (typeof window !== "undefined") {
      document.getElementById(`process-${String(processCode).toLowerCase()}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const formatBytes = (value?: number) => {
    const bytes = Number(value ?? 0);
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const parseAuditEventJson = (value: unknown): any | null => {
    if (!value) return null;
    try {
      return JSON.parse(String(value));
    } catch {
      return null;
    }
  };

  const auditEventLabel = (eventType: string): string => {
    if (eventType === "status_changed") return "Status changed";
    if (eventType === "detail_response_changed") return "Audit detail updated";
    if (eventType === "conclusion_changed") return "Conclusion updated";
    if (eventType === "assessment_archived") return "Assessment archived";
    if (eventType === "assessment_restored") return "Assessment restored";
    return eventType;
  };

  const auditEventSummary = (event: any): string => {
    const oldValue = parseAuditEventJson(event.old_value_json);
    const newValue = parseAuditEventJson(event.new_value_json);

    if (event.event_type === "status_changed") {
      return `${oldValue?.status ?? "unknown"} → ${newValue?.status ?? "unknown"}`;
    }

    if (event.event_type === "detail_response_changed") {
      return `Field: ${event.entity_key || "unknown"}`;
    }

    if (event.event_type === "conclusion_changed") {
      return newValue?.conclusionText ? "Conclusion text updated" : "Conclusion cleared";
    }

    if (event.event_type === "assessment_archived" || event.event_type === "assessment_restored") {
      return `Assessment #${event.entity_key || "?"}`;
    }

    return event.entity_key ? `Target: ${event.entity_key}` : "";
  };

  const generatePdfExport = async () => {
    setMessage("");

    if (!canExport) {
      setMessage("You do not have permission to export this audit.");
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const res = await fetch(`${apiUrl}/audits/${auditId}/exports/pdf`, {
        method: "POST",
        headers: authHeaders(authToken, true)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "PDF export generation failed.");
        return;
      }

      setMessage("PDF export generated and stored.");
      await loadWorkspace();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadPdfExport = async (exportId: number, fileName: string) => {
    setMessage("");

    if (!canExport) {
      setMessage("You do not have permission to download exports.");
      return;
    }

    setDownloadingExportId(exportId);
    try {
      const res = await fetch(`${apiUrl}/audits/${auditId}/exports/${exportId}/download`, {
        headers: authHeaders(authToken)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "PDF download failed.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || `audit-${auditId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingExportId(null);
    }
  };

  const downloadAuditCsv = async (report: "all" | "certification" | "gaps") => {
    setMessage("");

    if (!authToken) {
      setMessage("Please login first.");
      return;
    }

    setDownloadingCsvKind(report);
    try {
      const res = await fetch(`${apiUrl}/audits/${auditId}/exports/csv?report=${report}`, {
        headers: authHeaders(authToken)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "CSV download failed.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${auditId}-${report}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingCsvKind(null);
    }
  };

  const saveStatus = async () => {
    setMessage("");

    if (!canManageStatus) {
      setMessage("You do not have permission to change audit status.");
      return;
    }

    const res = await fetch(`${apiUrl}/audits/${auditId}/status`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ status: statusEdit })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.error ?? "Status update failed.");
      return;
    }

    setMessage("Audit status updated.");
    setLastSavedAt(new Date().toISOString());
    await loadWorkspace();
  };

  const saveScopeTargets = async (reloadAfter = true, silent = false): Promise<boolean> => {
    if (!silent) {
      setMessage("");
    }

    if (!canManageScopeTargets) {
      autosaveErrorsRef.current.scope = "You do not have permission to change scope/targets.";
      if (!silent) {
        setMessage("You do not have permission to change scope/targets.");
      }
      return false;
    }

    const items = Object.values(scopeEdits).map((item: any) => ({
      processCode: item.processCode,
      certGoalLevel: Number(item.certGoalLevel || 2),
      customGoalLevel: item.customGoalLevel ? Number(item.customGoalLevel) : null,
      scopeCode: item.scopeCode === "OUT_OF_SCOPE" ? "OUT_OF_SCOPE" : "IN_SCOPE"
    }));

    const res = await fetch(`${apiUrl}/audits/${auditId}/scope-targets`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ items })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      autosaveErrorsRef.current.scope = body.error ?? "Scope/targets save failed.";
      if (!silent) {
        setMessage(body.error ?? "Scope/targets save failed.");
      }
      return false;
    }

    if (!silent) {
      setMessage("Scope and targets saved.");
    }
    autosaveErrorsRef.current.scope = "";
    setLastSavedAt(new Date().toISOString());

    if (reloadAfter) {
      await loadWorkspace();
    }

    return true;
  };

  const saveAssessments = async (reloadAfter = true, silent = false, itemsOverride?: any[]): Promise<boolean> => {
    if (!silent) {
      setMessage("");
    }

    if (!canEdit) {
      autosaveErrorsRef.current.assessments = isLockedForNonLead
        ? "Audit is completed and locked for non-lead roles."
        : "You do not have permission to update assessments.";
      if (!silent) {
        setMessage(
          isLockedForNonLead
            ? "Audit is completed and locked for non-lead roles."
            : "You do not have permission to update assessments."
        );
      }
      return false;
    }

    const items = itemsOverride ?? normalizeAssessmentItems(edits);
    if (silent && items.length === 0) {
      autosaveErrorsRef.current.assessments = "";
      return true;
    }

    const res = await fetch(`${apiUrl}/audits/${auditId}/assessments`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ items })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      autosaveErrorsRef.current.assessments = body.error ?? "Assessment save failed.";
      if (!silent) {
        setMessage(body.error ?? "Assessment save failed.");
      }
      return false;
    }

    if (!silent) {
      setMessage("Assessment updates saved.");
    }
    autosaveErrorsRef.current.assessments = "";
    setLastSavedAt(new Date().toISOString());
    if (reloadAfter) {
      await loadWorkspace();
    }
    return true;
  };

  const loadAssessmentHistory = async (assessmentId: number) => {
    const key = String(assessmentId);
    setLoadingHistoryByAssessment((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await fetch(`${apiUrl}/assessments/${assessmentId}/history`, {
        headers: authHeaders(authToken),
        cache: "no-store"
      });

      if (!res.ok) {
        return;
      }

      const payload = await res.json();
      setHistoryByAssessment((prev) => ({ ...prev, [key]: payload }));
    } finally {
      setLoadingHistoryByAssessment((prev) => ({ ...prev, [key]: false }));
    }
  };

  const toggleAssessmentHistory = async (assessmentId: number) => {
    const key = String(assessmentId);
    const nextOpen = !openHistoryByAssessment[key];
    setOpenHistoryByAssessment((prev) => ({ ...prev, [key]: nextOpen }));

    if (nextOpen && !historyByAssessment[key]) {
      await loadAssessmentHistory(assessmentId);
    }
  };

  const addAssessmentNote = async (assessmentId: number) => {
    const key = String(assessmentId);
    const noteText = (noteDraftByAssessment[key] ?? "").trim();

    if (!noteText) {
      setMessage("Note text is required.");
      return;
    }

    if (!canEdit) {
      setMessage(
        isLockedForNonLead
          ? "Audit is completed and locked for non-lead roles."
          : "You do not have permission to add notes."
      );
      return;
    }

    const res = await fetch(`${apiUrl}/assessments/${assessmentId}/notes`, {
      method: "POST",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ noteText })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.error ?? "Unable to add note.");
      return;
    }

    setNoteDraftByAssessment((prev) => ({ ...prev, [key]: "" }));
    setMessage("Assessment note added.");
    await loadAssessmentHistory(assessmentId);
  };

  const saveAuditDetails = async (reloadAfter = true, silent = false): Promise<boolean> => {
    if (!silent) {
      setMessage("");
    }

    if (!canEdit) {
      autosaveErrorsRef.current.details = isLockedForNonLead
        ? "Audit is completed and locked for non-lead roles."
        : "You do not have permission to update audit details.";
      if (!silent) {
        setMessage(
          isLockedForNonLead
            ? "Audit is completed and locked for non-lead roles."
            : "You do not have permission to update audit details."
        );
      }
      return false;
    }

    const items = Object.values(detailEdits);

    const res = await fetch(`${apiUrl}/audits/${auditId}/details`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ items })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      autosaveErrorsRef.current.details = body.error ?? "Audit details save failed.";
      if (!silent) {
        setMessage(body.error ?? "Audit details save failed.");
      }
      return false;
    }

    if (!silent) {
      setMessage("Audit details saved.");
    }
    autosaveErrorsRef.current.details = "";
    setLastSavedAt(new Date().toISOString());
    if (reloadAfter) {
      await loadWorkspace();
    }
    return true;
  };

  const saveConclusion = async (reloadAfter = true, silent = false): Promise<boolean> => {
    if (!silent) {
      setMessage("");
    }

    if (!canLeadEdit) {
      autosaveErrorsRef.current.conclusion = "You do not have permission to update the conclusion.";
      if (!silent) {
        setMessage("You do not have permission to update the conclusion.");
      }
      return false;
    }

    const res = await fetch(`${apiUrl}/audits/${auditId}/conclusion`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ conclusionText: conclusionEdit })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      autosaveErrorsRef.current.conclusion = body.error ?? "Conclusion save failed.";
      if (!silent) {
        setMessage(body.error ?? "Conclusion save failed.");
      }
      return false;
    }

    if (!silent) {
      setMessage("Conclusion saved.");
    }
    autosaveErrorsRef.current.conclusion = "";
    setLastSavedAt(new Date().toISOString());
    if (reloadAfter) {
      await loadWorkspace();
    }
    return true;
  };

  const saveAll = async () => {
    setMessage("");

    if (!canLeadEdit) {
      setMessage("Save All requires lead auditor or org admin permissions.");
      return;
    }

    const scopeOk = await saveScopeTargets(false, true);
    if (!scopeOk) {
      setMessage("Save all failed while saving scope/targets.");
      return;
    }

    const assessmentsOk = await saveAssessments(false, true);
    if (!assessmentsOk) {
      setMessage("Save all failed while saving assessments.");
      return;
    }

    const detailsOk = await saveAuditDetails(false, true);
    if (!detailsOk) {
      setMessage("Save all failed while saving audit details.");
      return;
    }

    const conclusionOk = await saveConclusion(false, true);
    if (!conclusionOk) {
      setMessage("Save all failed while saving conclusion.");
      return;
    }

    setMessage("All updates saved for this audit.");
    await loadWorkspace();
  };

  const runAutosaveSection = async (
    section: "scope" | "assessments" | "details" | "conclusion",
    snapshot: string,
    saveAction: () => Promise<boolean>,
    label: string
  ) => {
    if (!workspace || !hasLoadedWorkspaceRef.current || snapshot === lastSavedSnapshotsRef.current[section]) {
      return;
    }

    if (autosaveInFlightRef.current[section]) {
      autosavePendingRef.current[section] = true;
      return;
    }

    autosaveInFlightRef.current[section] = true;
    setAutosaveState({ status: "saving", section: label, detail: `Saving ${label.toLowerCase()}…` });

    let ok = false;
    try {
      ok = await saveAction();
    } catch {
      ok = false;
    }

    if (ok) {
      lastSavedSnapshotsRef.current[section] = snapshot;
      setLastSavedAt(new Date().toISOString());
      setAutosaveState({ status: "saved", section: label, detail: `${label} saved.` });
    } else {
      setAutosaveState({
        status: "error",
        section: label,
        detail: autosaveErrorsRef.current[section] || `Autosave failed for ${label.toLowerCase()}.`
      });
    }

    autosaveInFlightRef.current[section] = false;

    if (autosavePendingRef.current[section]) {
      autosavePendingRef.current[section] = false;
      setAutosaveRetryTick((current) => current + 1);
    }
  };

  const requestImmediateAutosave = (section: "scope" | "assessments" | "details" | "conclusion") => {
    window.setTimeout(() => {
      if (section === "scope") {
        void runAutosaveSection("scope", scopeSnapshot, () => saveScopeTargets(false, true), "Scope & targets");
        return;
      }
      if (section === "assessments") {
        void runAutosaveSection("assessments", assessmentsSnapshot, () => saveAssessments(false, true, getChangedAssessmentItems()), "Assessments");
        return;
      }
      if (section === "details") {
        void runAutosaveSection("details", detailsSnapshot, () => saveAuditDetails(false, true), "Audit details");
        return;
      }
      void runAutosaveSection("conclusion", conclusionSnapshot, () => saveConclusion(false, true), "Conclusion");
    }, 50);
  };

  useEffect(() => {
    if (!mounted || !workspace || !authToken || !hasLoadedWorkspaceRef.current || !canManageScopeTargets) return;
    if (scopeSnapshot === lastSavedSnapshotsRef.current.scope) return;

    const timeout = window.setTimeout(() => {
      void runAutosaveSection("scope", scopeSnapshot, () => saveScopeTargets(false, true), "Scope & targets");
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [mounted, workspace, authToken, canManageScopeTargets, scopeSnapshot, autosaveRetryTick]);

  useEffect(() => {
    if (!mounted || !workspace || !authToken || !hasLoadedWorkspaceRef.current || !canEdit) return;
    if (assessmentsSnapshot === lastSavedSnapshotsRef.current.assessments) return;

    const timeout = window.setTimeout(() => {
      void runAutosaveSection("assessments", assessmentsSnapshot, () => saveAssessments(false, true, getChangedAssessmentItems()), "Assessments");
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [mounted, workspace, authToken, canEdit, assessmentsSnapshot, autosaveRetryTick]);

  useEffect(() => {
    if (!mounted || !workspace || !authToken || !hasLoadedWorkspaceRef.current || !canEdit) return;
    if (detailsSnapshot === lastSavedSnapshotsRef.current.details) return;

    const timeout = window.setTimeout(() => {
      void runAutosaveSection("details", detailsSnapshot, () => saveAuditDetails(false, true), "Audit details");
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [mounted, workspace, authToken, canEdit, detailsSnapshot, autosaveRetryTick]);

  useEffect(() => {
    if (!mounted || !workspace || !authToken || !hasLoadedWorkspaceRef.current || !canLeadEdit) return;
    if (conclusionSnapshot === lastSavedSnapshotsRef.current.conclusion) return;

    const timeout = window.setTimeout(() => {
      void runAutosaveSection("conclusion", conclusionSnapshot, () => saveConclusion(false, true), "Conclusion");
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [mounted, workspace, authToken, canLeadEdit, conclusionSnapshot, autosaveRetryTick]);

  const autosaveIndicatorTone = autosaveState.status === "error"
    ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
    : autosaveState.status === "saving" || hasUnsavedChanges
      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
      : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  const autosaveIndicatorText = autosaveState.status === "error"
    ? autosaveState.detail || "Autosave failed."
    : autosaveState.status === "saving"
      ? autosaveState.detail || "Saving changes…"
      : hasUnsavedChanges
        ? `Unsaved changes — autosaving in ${Number(AUTOSAVE_DELAY_MS / 1000).toFixed(1)}s.`
        : "All changes saved.";
  const lastSavedText = lastSavedAt ? `Last saved ${formatLocalTimestamp(lastSavedAt)}` : "No saved changes yet in this session.";
  const manualSaveHint = !workspace
    ? "Save buttons appear once the audit workspace has loaded."
    : canLeadEdit
      ? "Autosave is on. Use any save button whenever you want an explicit checkpoint."
      : canEdit || canManageScopeTargets
        ? "Autosave is on. Conclusion and Save all require lead auditor or org admin access."
        : isLockedForNonLead
          ? "This audit is completed and read-only for your role."
          : "This audit is read-only for your current role.";

  if (!mounted) {
    return (
      <PageShell>
        <PageSection title="Audit workspace" eyebrow="Audit" description="Loading audit data." >
          <p className="text-sm text-foreground">Preparing requirements, exports, and activity…</p>
        </PageSection>
      </PageShell>
    );
  }

  if (tokenMissing) {
    return (
      <PageShell>
        <PageSection title="Audit workspace" eyebrow="Audit" description="Redirecting to login." >
          <p className="text-sm text-foreground">A valid session is required for audit scoring and exports.</p>
        </PageSection>
      </PageShell>
    );
  }

  if (!workspace) {
    return (
      <PageShell>
        <PageSection title="Audit workspace" eyebrow="Audit" description="Loading audit context and requirement groups.">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <Link href="/clients" className="inline-flex items-center gap-2 text-sky-300"><ArrowLeft className="size-4" /> Back to clients</Link>
            <span aria-hidden="true">/</span>
            <span>Audit {auditId || "…"}</span>
          </div>
          <p className="text-sm text-foreground">{message || "Loading audit…"}</p>
        </PageSection>
      </PageShell>
    );
  }

  const groupedProcesses = [...(workspace.groupedProcesses ?? [])].sort((left: any, right: any) => {
    const parse = (code: string) => {
      const match = String(code).match(/^([A-Z]+)(\d+)?/i);
      const prefix = String(match?.[1] ?? code).toUpperCase();
      const index = prefix === "GR" ? 0 : prefix === "PR" ? 1 : 2;
      const number = Number(match?.[2] ?? Number.MAX_SAFE_INTEGER);
      return { index, prefix, number, raw: String(code) };
    };

    const a = parse(left.processCode);
    const b = parse(right.processCode);
    return a.index - b.index || a.number - b.number || a.raw.localeCompare(b.raw);
  });

  const auditSummary = [
    { label: "Client", value: decodeHtmlEntities(workspace.audit.client_name) },
    { label: "Audit date", value: formatDateOnly(workspace.audit.audit_date) },
    { label: "Processes", value: groupedProcesses.length },
    { label: "Exports", value: pdfExports.length }
  ];

  return (
    <>
      <PageShell className="pb-44 lg:pb-24">
        <PageSection
          title={decodeHtmlEntities(workspace.audit.name)}
          eyebrow="Audit workspace"
          description="The audit is now separated into overview, process scoring, exports, activity, details, and conclusion so each task area stays focused."
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <Link href="/clients" className="inline-flex items-center gap-2 text-sky-300"><ArrowLeft className="size-4" /> Clients</Link>
            <span aria-hidden="true">/</span>
            <span>{decodeHtmlEntities(workspace.audit.name)}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            {auditSummary.map((item) => (
              <Card key={item.label} className="bg-slate-950/45">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">{item.label}</p>
                  <p className="mt-3 text-lg font-semibold text-foreground">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-sky-500/35 bg-slate-950/65">
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-sm font-semibold text-foreground">Manual save buttons</p>
                <p className="mt-1 text-sm text-foreground">These buttons are always available here near the top of the audit page.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => saveScopeTargets()} disabled={!canManageScopeTargets}><Target className="size-4" /> Save scope & targets</Button>
                <Button variant="secondary" onClick={() => saveAssessments()} disabled={!canEdit}><Layers3 className="size-4" /> Save assessments</Button>
                <Button variant="secondary" onClick={() => saveAuditDetails()} disabled={!canEdit}><Save className="size-4" /> Save details</Button>
                <Button variant="secondary" onClick={() => saveConclusion()} disabled={!canLeadEdit}><Save className="size-4" /> Save conclusion</Button>
                <Button onClick={saveAll} disabled={!canLeadEdit}><Save className="size-4" /> Save all</Button>
              </div>
              <div className="text-xs text-foreground">{manualSaveHint}</div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,320px)_1fr]">
            <Card className="bg-slate-950/45">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Audit status</p>
                  <Badge variant={statusVariant(auditStatus)}>{auditStatus.replace("_", " ")}</Badge>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-foreground">Transition</label>
                  <select value={statusEdit} onChange={(event) => setStatusEdit(event.target.value)} disabled={!canManageStatus}>
                    <option value={auditStatus}>{auditStatus}</option>
                    {allowedStatusTransitions.map((status: string) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <Button onClick={saveStatus} disabled={!canManageStatus || statusEdit === auditStatus}><Save className="size-4" /> Save status</Button>
                <p className={`text-sm ${auditStatus === "draft" ? "text-emerald-200" : "text-amber-100"}`}>
                  Scope and certification goals are {auditStatus === "draft" ? "editable" : "locked"} while status is <strong>{auditStatus || "unknown"}</strong>.
                </p>
                {isLockedForNonLead ? <p className="text-sm text-amber-100">This audit is completed; editing is locked for non-lead roles.</p> : null}
              </CardContent>
            </Card>

            <Card className="bg-slate-950/45">
              <CardContent className="space-y-4 p-5">
                <p className="text-sm font-semibold text-foreground">Save and export actions</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => saveScopeTargets()} disabled={!canManageScopeTargets}><Target className="size-4" /> Save scope & targets</Button>
                  <Button variant="secondary" onClick={() => saveAssessments()} disabled={!canEdit}><Layers3 className="size-4" /> Save assessments</Button>
                  <Button onClick={saveAll} disabled={!canLeadEdit}><Save className="size-4" /> Save all</Button>
                </div>
                <div className={`rounded-2xl border px-4 py-3 text-sm ${autosaveIndicatorTone}`}>
                  <p className="font-medium">{autosaveIndicatorText}</p>
                  <p className="mt-1 text-xs text-current/80">{manualSaveHint}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={generatePdfExport} disabled={!canExport || isGeneratingPdf}><FileText className="size-4" /> {isGeneratingPdf ? "Generating PDF…" : "Generate PDF export"}</Button>
                  <Button variant="secondary" onClick={() => downloadAuditCsv("all")} disabled={!canExport || downloadingCsvKind !== null}><Download className="size-4" /> {downloadingCsvKind === "all" ? "Downloading…" : "CSV: all"}</Button>
                  <Button variant="secondary" onClick={() => downloadAuditCsv("certification")} disabled={!canExport || downloadingCsvKind !== null}>{downloadingCsvKind === "certification" ? "Downloading…" : "CSV: certification"}</Button>
                  <Button variant="secondary" onClick={() => downloadAuditCsv("gaps")} disabled={!canExport || downloadingCsvKind !== null}>{downloadingCsvKind === "gaps" ? "Downloading…" : "CSV: gaps"}</Button>
                </div>
                {message ? <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{message}</div> : null}
              </CardContent>
            </Card>
          </div>
        </PageSection>

        <div className="sticky top-4 z-30 mb-6 rounded-2xl border border-slate-800/80 bg-slate-950/95 px-4 py-3 backdrop-blur lg:px-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Save controls</p>
                <p className="text-xs text-foreground">{autosaveIndicatorText}</p>
                <p className="mt-1 text-xs text-foreground">{lastSavedText}</p>
              </div>
              <div className="text-xs text-foreground lg:max-w-sm lg:text-right">{manualSaveHint}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => saveScopeTargets()} disabled={!canManageScopeTargets}><Target className="size-4" /> Save scope</Button>
              <Button size="sm" variant="secondary" onClick={() => saveAssessments()} disabled={!canEdit}><Layers3 className="size-4" /> Save assessments</Button>
              <Button size="sm" variant="secondary" onClick={() => saveAuditDetails()} disabled={!canEdit}><Save className="size-4" /> Save details</Button>
              <Button size="sm" variant="secondary" onClick={() => saveConclusion()} disabled={!canLeadEdit}><Save className="size-4" /> Save conclusion</Button>
              <Button size="sm" onClick={saveAll} disabled={!canLeadEdit}><Save className="size-4" /> Save all</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <ProcessSidebarNav processes={groupedProcesses} activeProcessCode={activeProcessCode} onJump={scrollToProcess} />

          <div className="grid gap-6">
            <PageSection
              title="1. Scope & requirements by process"
              eyebrow="Execution"
              description="Each process panel now isolates scope settings, density controls, and requirement scoring to keep work focused."
              action={<Button variant="secondary" onClick={() => saveAssessments()} disabled={!canEdit}><Layers3 className="size-4" /> Save assessments</Button>}
            >
              <div className="grid gap-4">
                {groupedProcesses.map((group: any) => (
                  <ProcessPanel
                    key={group.processCode}
                    group={group}
                    workspace={workspace}
                    processUi={{ openProcessByCode, setOpenProcessByCode, panelDensityByProcess }}
                    scopeState={{ scopeEdits, setScopeEdits }}
                    assessmentState={{
                      edits,
                      setEdits,
                      openHistoryByAssessment,
                      historyByAssessment,
                      loadingHistoryByAssessment,
                      noteDraftByAssessment,
                      setNoteDraftByAssessment
                    }}
                    permissions={{ canManageScopeTargets, canEdit }}
                     actions={{ updatePanelDensity, toggleAssessmentHistory, addAssessmentNote, requestScopeAutosave: () => requestImmediateAutosave("scope"), requestAssessmentAutosave: () => requestImmediateAutosave("assessments") }}
                  />
                ))}
              </div>
            </PageSection>

            <PageSection title="2. Exports" eyebrow="Outputs" description="Generate and retrieve stored exports without leaving the audit context.">
              {pdfExports.length === 0 ? (
                <p className="text-sm text-foreground">No stored PDF exports yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                  <table className="data-table min-w-[760px]">
                    <thead>
                      <tr>
                        <th>Generated</th>
                        <th>File</th>
                        <th>Size</th>
                        <th>Current</th>
                        <th>Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pdfExports.map((item: any) => (
                        <tr key={item.id}>
                          <td>{formatLocalTimestamp(item.generated_at_UTC)}</td>
                          <td>{item.file_name}</td>
                          <td>{formatBytes(item.file_size_bytes)}</td>
                          <td>{item.is_current ? "Yes" : "No"}</td>
                          <td>
                            <Button size="sm" variant="secondary" disabled={!canExport || downloadingExportId === Number(item.id)} onClick={() => downloadPdfExport(Number(item.id), String(item.file_name))}>
                              {downloadingExportId === Number(item.id) ? "Downloading…" : "Download"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PageSection>

            <PageSection title="3. Audit activity" eyebrow="Timeline" description="Review status changes, saved updates, and archived or restored assessments in local time.">
              {(workspace.auditEvents ?? []).length === 0 ? (
                <p className="text-sm text-foreground">No audit-level activity recorded yet.</p>
              ) : (
                <div className="grid gap-3">
                  {(workspace.auditEvents ?? []).map((event: any) => (
                    <Card key={`audit-event-${event.id}`} className="bg-slate-950/45">
                      <CardContent className="flex flex-col gap-2 p-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-foreground"><History className="size-4 text-sky-300" /> <strong>{auditEventLabel(String(event.event_type))}</strong></div>
                          <p className="text-sm text-foreground">{auditEventSummary(event) ? decodeHtmlEntities(auditEventSummary(event)) : "No summary available."}</p>
                          {event.actor_name ? <p className="text-xs uppercase tracking-[0.14em] text-foreground">Actor: {decodeHtmlEntities(event.actor_name)}</p> : null}
                        </div>
                        <div className="text-sm text-foreground">{formatLocalTimestamp(event.created_at_UTC)}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </PageSection>

            <PageSection title="4. Audit details" eyebrow="Context" description="Capture structured responses and notes that support the process scoring."
              action={<Button variant="secondary" onClick={() => saveAuditDetails()} disabled={!canEdit}><Save className="size-4" /> Save details</Button>}
            >
              <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
                <table className="data-table min-w-[900px]">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Response</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(workspace.details ?? []).map((detail: any) => {
                      const edit = detailEdits[String(detail.field_key)] ?? { fieldKey: detail.field_key, responseText: "", noteText: "" };
                      return (
                        <tr key={detail.field_key}>
                          <td>
                            <div className="font-semibold text-foreground">{decodeHtmlEntities(detail.label)}</div>
                            {detail.guidance_text ? <div className="mt-2 text-sm text-foreground">{decodeHtmlEntities(detail.guidance_text)}</div> : null}
                          </td>
                          <td>
                            <textarea rows={3} value={edit.responseText} disabled={!canEdit} onChange={(event) => setDetailEdits((prev) => ({ ...prev, [String(detail.field_key)]: { ...edit, responseText: event.target.value } }))} onBlur={() => requestImmediateAutosave("details")} />
                          </td>
                          <td>
                            <textarea rows={3} value={edit.noteText} disabled={!canEdit} onChange={(event) => setDetailEdits((prev) => ({ ...prev, [String(detail.field_key)]: { ...edit, noteText: event.target.value } }))} onBlur={() => requestImmediateAutosave("details")} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </PageSection>

            <PageSection title="5. Conclusion" eyebrow="Wrap-up" description="Record the overall conclusion separately from detailed notes and requirement evidence."
              action={<Button onClick={() => saveConclusion()} disabled={!canLeadEdit}><Save className="size-4" /> Save conclusion</Button>}
            >
              <textarea rows={8} value={conclusionEdit} disabled={!canLeadEdit} onChange={(event) => setConclusionEdit(event.target.value)} onBlur={() => requestImmediateAutosave("conclusion")} placeholder="Enter audit conclusion" />
              <div className="text-sm text-foreground">
                <Link href="/clients" className="inline-flex items-center gap-2 text-sky-300"><ArrowLeft className="size-4" /> Back to clients and audits</Link>
              </div>
            </PageSection>
          </div>
        </div>
      </PageShell>

      <ProcessMobileNav processes={groupedProcesses} activeProcessCode={activeProcessCode} onJump={scrollToProcess} />
    </>
  );
}
