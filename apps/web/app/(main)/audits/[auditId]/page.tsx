// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { ArrowLeft, Download, FileText, Layers3, RotateCw, Save } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityPanel } from "../../../components/audit-workspace/activity-panel";
import { ConclusionPanel } from "../../../components/audit-workspace/conclusion-panel";
import { DetailsPanel } from "../../../components/audit-workspace/details-panel";
import { ExportsPanel } from "../../../components/audit-workspace/exports-panel";
import { ProcessMobileNav, ProcessSidebarNav } from "../../../components/audit-workspace/process-nav";
import ProcessPanel from "../../../components/audit-workspace/process-panel";
import { SaveControls } from "../../../components/audit-workspace/save-controls";
import PageSection from "../../../components/layout/page-section";
import PageShell from "../../../components/layout/page-shell";
import { Badge, statusVariant } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { apiErrorMessage, apiFetch, downloadFile, NETWORK_ERROR_MESSAGE } from "../../../lib/api";
import {
  assessmentsSnapshotOf,
  changedAssessmentItems,
  conclusionPayloadFromSnapshot,
  conclusionSnapshotOf,
  detailsPayloadFromSnapshot,
  detailsSnapshotOf,
  editsFromWorkspace,
  type ScoredCount,
  scopePayloadFromSnapshot,
  scopeSnapshotOf,
  scoredCountOf,
  snapshotsOf,
  WORKSPACE_SECTIONS,
  type WorkspaceSection,
} from "../../../lib/audit-snapshots";
import { formatDateOnly, formatLocalTimestamp } from "../../../lib/date-format";
import { decodeHtmlEntities } from "../../../lib/text-format";
import { reserveKeepaliveBudget, type SaveOutcome, useAuditAutosave } from "./use-audit-workspace";

const AUTOSAVE_DELAY_MS = 1500;

type LoadState = "loading" | "ready" | "error" | "not_found";

const SECTION_ENDPOINT: Record<WorkspaceSection, string> = {
  scope: "scope-targets",
  assessments: "assessments",
  details: "details",
  conclusion: "conclusion",
};

const SECTION_SAVE_FAILED: Record<WorkspaceSection, string> = {
  scope: "Scope/targets save failed.",
  assessments: "Assessment save failed.",
  details: "Audit details save failed.",
  conclusion: "Conclusion save failed.",
};

const SECTION_SAVED: Record<WorkspaceSection, string> = {
  scope: "Scope and targets saved.",
  assessments: "Assessment updates saved.",
  details: "Audit details saved.",
  conclusion: "Conclusion saved.",
};

const WORKSPACE_TABS = [
  { id: "scope", label: "Scope & requirements" },
  { id: "exports", label: "Exports" },
  { id: "activity", label: "Audit activity" },
  { id: "details", label: "Audit details" },
  { id: "conclusion", label: "Conclusion" },
] as const;

type WorkspaceTab = (typeof WORKSPACE_TABS)[number]["id"];

const TAB_STORAGE_KEY = "audit_fitsm_workspace_tab";

const isWorkspaceTab = (value: unknown): value is WorkspaceTab => WORKSPACE_TABS.some((tab) => tab.id === value);

const parseAuditId = (raw: unknown): number | null => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export default function AuditWorkspacePage() {
  const params = useParams();
  const auditId = parseAuditId(params.auditId);
  const [loadState, setLoadState] = useState<LoadState>(auditId ? "loading" : "not_found");
  const [loadError, setLoadError] = useState("");
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
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [downloadingExportId, setDownloadingExportId] = useState<number | null>(null);
  const [downloadingCsvKind, setDownloadingCsvKind] = useState<string | null>(null);
  const [openProcessByCode, setOpenProcessByCode] = useState<Record<string, boolean>>({});
  const [panelDensityByProcess, setPanelDensityByProcess] = useState<Record<string, "comfortable" | "compact">>({});
  const [activeProcessCode, setActiveProcessCode] = useState("");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("scope");
  const [stickyOffset, setStickyOffset] = useState(0);
  const stickyBarRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const loadRequestRef = useRef(0);

  const canEdit = workspace?.permissions?.canEdit ?? false;
  const canLeadEdit = workspace?.permissions?.canLeadEdit ?? false;
  const canExport = workspace?.permissions?.canExport ?? false;
  const canManageStatus = workspace?.permissions?.canManageStatus ?? false;
  const canManageScopeTargets = workspace?.permissions?.canManageScopeTargets ?? false;
  const isLockedForNonLead = workspace?.permissions?.isLockedForNonLead ?? false;
  const allowedStatusTransitions = workspace?.permissions?.allowedStatusTransitions ?? [];
  const auditStatus = String(workspace?.audit?.status ?? "");
  const editDeniedMessage = (action: string) =>
    isLockedForNonLead
      ? "Audit is completed and locked for non-lead roles."
      : `You do not have permission to ${action}.`;

  const scopeSnapshot = useMemo(() => scopeSnapshotOf(scopeEdits), [scopeEdits]);
  const assessmentsSnapshot = useMemo(() => assessmentsSnapshotOf(edits), [edits]);
  const detailsSnapshot = useMemo(() => detailsSnapshotOf(detailEdits), [detailEdits]);
  const conclusionSnapshot = useMemo(() => conclusionSnapshotOf(conclusionEdit), [conclusionEdit]);

  const sendSection = async (
    section: WorkspaceSection,
    snapshot: string,
    saved: string,
    options: { keepalive?: boolean },
  ): Promise<SaveOutcome> => {
    let body: unknown;
    if (section === "scope") {
      body = { items: scopePayloadFromSnapshot(snapshot) };
    } else if (section === "assessments") {
      const items = changedAssessmentItems(snapshot, saved);
      if (items.length === 0) return { ok: true };
      body = { items };
    } else if (section === "details") {
      body = { items: detailsPayloadFromSnapshot(snapshot) };
    } else {
      body = conclusionPayloadFromSnapshot(snapshot);
    }

    const json = JSON.stringify(body);
    const releaseKeepalive = options.keepalive ? reserveKeepaliveBudget(json) : null;
    let res: Response;
    try {
      res = await apiFetch(`/audits/${auditId}/${SECTION_ENDPOINT[section]}`, {
        method: "PUT",
        body: json,
        keepalive: releaseKeepalive !== null,
      });
    } catch {
      return { ok: false, error: NETWORK_ERROR_MESSAGE };
    } finally {
      releaseKeepalive?.();
    }
    if (!res.ok) return { ok: false, error: await apiErrorMessage(res, SECTION_SAVE_FAILED[section]) };
    return { ok: true };
  };

  const autosave = useAuditAutosave({
    ready: loadState === "ready" && !!workspace,
    delayMs: AUTOSAVE_DELAY_MS,
    sections: {
      scope: {
        snapshot: scopeSnapshot,
        enabled: canManageScopeTargets,
        label: "Scope & targets",
        disabledError: "You do not have permission to change scope/targets.",
      },
      assessments: {
        snapshot: assessmentsSnapshot,
        enabled: canEdit,
        label: "Assessments",
        disabledError: editDeniedMessage("update assessments"),
      },
      details: {
        snapshot: detailsSnapshot,
        enabled: canEdit,
        label: "Audit details",
        disabledError: editDeniedMessage("update audit details"),
      },
      conclusion: {
        snapshot: conclusionSnapshot,
        enabled: canLeadEdit,
        label: "Conclusion",
        disabledError: "You do not have permission to update the conclusion.",
      },
    },
    send: sendSection,
    onSaved: () => setLastSavedAt(new Date().toISOString()),
  });
  const { hasUnsavedChanges, status: autosaveState } = autosave;

  const loadExports = async () => {
    try {
      const res = await apiFetch(`/audits/${auditId}/exports`);
      if (!res.ok) {
        if (res.status !== 401) setMessage("Unable to load stored exports.");
        return;
      }
      setPdfExports(await res.json());
    } catch {
      setMessage("Unable to load stored exports. Check your connection.");
    }
  };

  /**
   * "replace": initial load / retry — takes all server data.
   * "merge": refresh after a save, status change or export — server data only replaces sections
   * that have no unsaved edits and no save in flight, so nothing the user typed is lost.
   */
  const loadWorkspace = async (mode: "replace" | "merge") => {
    if (!auditId) return;
    const requestId = ++loadRequestRef.current;
    const isCurrent = () => requestId === loadRequestRef.current;
    if (mode === "replace") {
      setLoadState("loading");
      setLoadError("");
    }

    let data: any;
    try {
      const res = await apiFetch(`/audits/${auditId}/workspace`);
      if (!isCurrent()) return;
      if (!res.ok) {
        if (res.status === 401) return; // apiFetch is redirecting to login
        const error = await apiErrorMessage(res, "Unable to load audit workspace.");
        if (!isCurrent()) return;
        if (mode === "merge") {
          setMessage(`Unable to refresh the audit workspace: ${error}`);
          return;
        }
        setLoadState(res.status === 404 || res.status === 400 ? "not_found" : "error");
        setLoadError(res.status === 403 ? "You do not have access to this audit." : error);
        return;
      }
      data = await res.json();
    } catch {
      if (!isCurrent()) return;
      if (mode === "merge") {
        setMessage("Unable to refresh the audit workspace. Check your connection.");
        return;
      }
      setLoadState("error");
      setLoadError(NETWORK_ERROR_MESSAGE);
      return;
    }
    if (!isCurrent()) return;

    const next = editsFromWorkspace(data);
    const snapshots = snapshotsOf(next);
    const take = (section: WorkspaceSection) => mode === "replace" || !autosave.isSectionPending(section);

    setWorkspace(data);
    setStatusEdit(data.audit?.status ?? "draft");
    if (take("scope")) setScopeEdits(next.scopeEdits);
    if (take("assessments")) setEdits(next.edits);
    if (take("details")) setDetailEdits(next.detailEdits);
    if (take("conclusion")) setConclusionEdit(next.conclusionEdit);
    for (const section of WORKSPACE_SECTIONS) {
      if (take(section)) autosave.setBaseline(section, snapshots[section]);
    }
    const defaultOpen: Record<string, boolean> = {};
    for (const group of data.groupedProcesses ?? []) defaultOpen[String(group.processCode)] = true;
    setOpenProcessByCode((prev) => ({ ...defaultOpen, ...prev }));
    if (mode === "replace") setLastSavedAt(String(data.audit?.updated_UTC ?? ""));
    setLoadState("ready");

    await loadExports();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedDensity = window.sessionStorage.getItem("audit_fitsm_workspace_density_by_process");
      const parsed = storedDensity ? JSON.parse(storedDensity) : null;
      if (parsed && typeof parsed === "object") setPanelDensityByProcess(parsed);
    } catch {
      // ignore invalid or unavailable persisted state
    }
  }, []);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(TAB_STORAGE_KEY);
      if (isWorkspaceTab(stored)) setActiveTab(stored);
    } catch {
      // storage unavailable; default tab stays
    }
  }, []);

  const selectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    try {
      window.sessionStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // storage unavailable; keep the in-memory choice
    }
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = WORKSPACE_TABS.findIndex((tab) => tab.id === activeTab);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % WORKSPACE_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = WORKSPACE_TABS.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const tab = WORKSPACE_TABS[next].id;
    selectTab(tab);
    document.getElementById(`workspace-tab-${tab}`)?.focus();
  };

  // Track the sticky save bar's height so the process sidebar can sit (and scroll) below it.
  useEffect(() => {
    const bar = stickyBarRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const update = () => setStickyOffset(bar.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [loadState]);

  useEffect(() => {
    if (!auditId) {
      setLoadState("not_found");
      return;
    }
    void loadWorkspace("replace");
  }, [auditId]);

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
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.2, 0.4, 0.7] },
    );

    sections.forEach((section) => {
      observer.observe(section);
    });
    return () => observer.disconnect();
  }, [workspace?.groupedProcesses?.length]);

  const updatePanelDensity = (processCode: string, density: "comfortable" | "compact") => {
    setPanelDensityByProcess((prev) => {
      const next = { ...prev, [processCode]: density };
      try {
        window.sessionStorage.setItem("audit_fitsm_workspace_density_by_process", JSON.stringify(next));
      } catch {
        // storage unavailable; keep the in-memory preference
      }
      return next;
    });
  };

  const scrollToProcess = (processCode: string) => {
    if (typeof window !== "undefined") {
      const panel = document.getElementById(`process-${String(processCode).toLowerCase()}`);
      if (!panel) return;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      // Move keyboard focus to the panel so the next Tab continues inside it.
      panel.focus({ preventScroll: true });
    }
  };

  /** Saves pending edits first so status changes and exports see the latest data. */
  const flushBeforeAction = async (action: string): Promise<boolean> => {
    const failed = (await autosave.flushAll()).find((outcome) => !outcome.ok);
    if (failed && !failed.ok) {
      setMessage(`Unsaved changes could not be saved before ${action}: ${failed.error}`);
      return false;
    }
    return true;
  };

  const generatePdfExport = async () => {
    setMessage("");

    if (!canExport) {
      setMessage("You do not have permission to export this audit.");
      return;
    }

    setIsGeneratingPdf(true);
    try {
      if (!(await flushBeforeAction("generating the PDF"))) return;
      const res = await apiFetch(`/audits/${auditId}/exports/pdf`, {
        method: "POST",
      });

      if (!res.ok) {
        setMessage(await apiErrorMessage(res, "PDF export generation failed."));
        return;
      }

      setMessage("PDF export generated and stored.");
      await loadWorkspace("merge");
    } catch {
      setMessage(`PDF export generation failed. ${NETWORK_ERROR_MESSAGE}`);
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
      await downloadFile(
        `/audits/${auditId}/exports/${exportId}/download`,
        fileName || `audit-${auditId}.pdf`,
        "PDF download failed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PDF download failed.");
    } finally {
      setDownloadingExportId(null);
    }
  };

  const downloadAuditCsv = async (report: "all" | "certification" | "gaps") => {
    setMessage("");
    setDownloadingCsvKind(report);
    try {
      await downloadFile(
        `/audits/${auditId}/exports/csv?report=${report}`,
        `audit-${auditId}-${report}.csv`,
        "CSV download failed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CSV download failed.");
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

    setIsSavingStatus(true);
    try {
      if (!(await flushBeforeAction("changing the status"))) return;
      const res = await apiFetch(`/audits/${auditId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: statusEdit }),
      });

      if (!res.ok) {
        setMessage(await apiErrorMessage(res, "Status update failed."));
        return;
      }

      setMessage("Audit status updated.");
      setLastSavedAt(new Date().toISOString());
      await loadWorkspace("merge");
    } catch {
      setMessage(`Status update failed. ${NETWORK_ERROR_MESSAGE}`);
    } finally {
      setIsSavingStatus(false);
    }
  };

  /** Manual save of one section, through the same serialized queue as autosave. */
  const saveSectionNow = async (section: WorkspaceSection) => {
    setMessage("");
    const outcome = await autosave.saveSection(section);
    if (!outcome.ok) {
      setMessage(outcome.error);
      return;
    }
    if (outcome.skipped) {
      setMessage("No unsaved changes in this section.");
      return;
    }
    setMessage(SECTION_SAVED[section]);
    await loadWorkspace("merge");
  };

  const saveAll = async () => {
    setMessage("");

    if (!canLeadEdit) {
      setMessage("Save All requires lead auditor or org admin permissions.");
      return;
    }

    const enabled: Record<WorkspaceSection, boolean> = {
      scope: canManageScopeTargets,
      assessments: canEdit,
      details: canEdit,
      conclusion: canLeadEdit,
    };
    const labels: Record<WorkspaceSection, string> = {
      scope: "scope/targets",
      assessments: "assessments",
      details: "audit details",
      conclusion: "conclusion",
    };
    for (const section of WORKSPACE_SECTIONS) {
      if (!enabled[section]) continue;
      const outcome = await autosave.saveSection(section);
      if (!outcome.ok) {
        setMessage(`Save all failed while saving ${labels[section]}: ${outcome.error}`);
        return;
      }
    }

    setMessage("All updates saved for this audit.");
    await loadWorkspace("merge");
  };

  const loadAssessmentHistory = async (assessmentId: number) => {
    const key = String(assessmentId);
    setLoadingHistoryByAssessment((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await apiFetch(`/assessments/${assessmentId}/history`);

      if (!res.ok) {
        setMessage("Unable to load requirement history.");
        return;
      }

      const payload = await res.json();
      setHistoryByAssessment((prev) => ({ ...prev, [key]: payload }));
    } catch {
      setMessage(`Unable to load requirement history. ${NETWORK_ERROR_MESSAGE}`);
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
      setMessage(editDeniedMessage("add notes"));
      return;
    }

    try {
      const res = await apiFetch(`/assessments/${assessmentId}/notes`, {
        method: "POST",
        body: JSON.stringify({ noteText }),
      });

      if (!res.ok) {
        setMessage(await apiErrorMessage(res, "Unable to add note."));
        return;
      }
    } catch {
      setMessage(`Unable to add note. ${NETWORK_ERROR_MESSAGE}`);
      return;
    }

    setNoteDraftByAssessment((prev) => ({ ...prev, [key]: "" }));
    setMessage("Assessment note added.");
    await loadAssessmentHistory(assessmentId);
  };

  const autosaveIndicatorTone =
    autosaveState.status === "error"
      ? "border-danger/30 bg-danger/10 text-danger-fg"
      : autosaveState.status === "saving" || hasUnsavedChanges
        ? "border-warning/30 bg-warning/10 text-warning-fg"
        : "border-success/30 bg-success/10 text-success-fg";
  const autosaveIndicatorText =
    autosaveState.status === "error"
      ? autosaveState.detail || "Autosave failed."
      : autosaveState.status === "saving"
        ? autosaveState.detail || "Saving changes…"
        : hasUnsavedChanges
          ? `Unsaved changes — autosaving in ${Number(AUTOSAVE_DELAY_MS / 1000).toFixed(1)}s.`
          : "All changes saved.";
  const lastSavedText = lastSavedAt
    ? `Last saved ${formatLocalTimestamp(lastSavedAt)}`
    : "No saved changes yet in this session.";
  const manualSaveHint = !workspace
    ? "Save buttons appear once the audit workspace has loaded."
    : canLeadEdit
      ? "Autosave is on. Use any save button whenever you want an explicit checkpoint."
      : canEdit || canManageScopeTargets
        ? "Autosave is on. Conclusion and Save all require lead auditor or org admin access."
        : isLockedForNonLead
          ? "This audit is completed and read-only for your role."
          : "This audit is read-only for your current role.";

  const backToClients = (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <Link href="/" className="inline-flex items-center gap-2 text-accent">
        <ArrowLeft className="size-4" /> Back to clients
      </Link>
      {auditId ? (
        <>
          <span aria-hidden="true">/</span>
          <span>Audit {auditId}</span>
        </>
      ) : null}
    </div>
  );

  if (loadState === "not_found") {
    return (
      <PageShell>
        <PageSection
          headingLevel={1}
          title="Audit not found"
          eyebrow="Audit"
          description="This audit does not exist or was removed."
        >
          {backToClients}
          <p role="alert" className="text-sm text-fg-secondary">
            {auditId ? `No audit with id ${auditId} could be found.` : "The audit link is not valid."}
          </p>
        </PageSection>
      </PageShell>
    );
  }

  if (loadState === "error") {
    return (
      <PageShell>
        <PageSection
          headingLevel={1}
          title="Audit workspace"
          eyebrow="Audit"
          description="This audit could not be loaded."
        >
          {backToClients}
          <p role="alert" className="text-sm text-danger-fg">
            {loadError || "Unable to load audit workspace."}
          </p>
          <Button variant="secondary" onClick={() => void loadWorkspace("replace")}>
            <RotateCw className="size-4" /> Retry
          </Button>
        </PageSection>
      </PageShell>
    );
  }

  if (!workspace) {
    return (
      <PageShell>
        <PageSection
          headingLevel={1}
          title="Audit workspace"
          eyebrow="Audit"
          description="Loading audit context and requirement groups."
        >
          {backToClients}
          <p className="text-sm text-fg-secondary">Loading audit…</p>
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

  const scoredByProcess: Record<string, ScoredCount> = {};
  for (const group of groupedProcesses) {
    scoredByProcess[String(group.processCode)] = scoredCountOf(group.requirements, edits);
  }

  const auditSummary = [
    { label: "Client", value: decodeHtmlEntities(workspace.audit.client_name) },
    { label: "Audit date", value: formatDateOnly(workspace.audit.audit_date_UTC) },
    { label: "Processes", value: groupedProcesses.length },
    { label: "Exports", value: pdfExports.length },
  ];

  return (
    <>
      <PageShell className="pb-44 lg:pb-24">
        <PageSection
          headingLevel={1}
          title={decodeHtmlEntities(workspace.audit.name)}
          eyebrow="Audit workspace"
          description="The audit is now separated into overview, process scoring, exports, activity, details, and conclusion so each task area stays focused."
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link href="/" className="inline-flex items-center gap-2 text-accent">
              <ArrowLeft className="size-4" /> Clients
            </Link>
            <span aria-hidden="true">/</span>
            <span>{decodeHtmlEntities(workspace.audit.name)}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-4">
            {auditSummary.map((item) => (
              <Card key={item.label} className="bg-surface/45">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{item.label}</p>
                  <p className="mt-3 text-lg font-semibold text-fg">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-primary/35 bg-surface/65">
            <CardContent className="space-y-4 p-5">
              <div>
                <p className="text-sm font-semibold text-fg">Manual save buttons</p>
                <p className="mt-1 text-sm text-fg-secondary">
                  These buttons are always available here near the top of the audit page.
                </p>
              </div>
              <SaveControls
                canManageScopeTargets={canManageScopeTargets}
                canEdit={canEdit}
                canLeadEdit={canLeadEdit}
                onSaveScope={() => void saveSectionNow("scope")}
                onSaveAssessments={() => void saveSectionNow("assessments")}
                onSaveDetails={() => void saveSectionNow("details")}
                onSaveConclusion={() => void saveSectionNow("conclusion")}
                onSaveAll={() => void saveAll()}
              />
              <div className="text-xs text-muted">{manualSaveHint}</div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,320px)_1fr]">
            <Card className="bg-surface/45">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-fg">Audit status</p>
                  <Badge variant={statusVariant(auditStatus)}>{auditStatus.replace("_", " ")}</Badge>
                </div>
                <div className="grid gap-2">
                  <label htmlFor="audit-status" className="text-sm font-medium text-fg-secondary">
                    Transition
                  </label>
                  <select
                    id="audit-status"
                    value={statusEdit}
                    onChange={(event) => setStatusEdit(event.target.value)}
                    disabled={!canManageStatus}
                  >
                    <option value={auditStatus}>{auditStatus}</option>
                    {allowedStatusTransitions.map((status: string) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  onClick={() => void saveStatus()}
                  disabled={!canManageStatus || isSavingStatus || statusEdit === auditStatus}
                >
                  <Save className="size-4" /> {isSavingStatus ? "Saving status…" : "Save status"}
                </Button>
                <p className={`text-sm ${auditStatus === "draft" ? "text-success-fg" : "text-warning-fg"}`}>
                  Scope and certification goals are {auditStatus === "draft" ? "editable" : "locked"} while status is{" "}
                  <strong>{auditStatus || "unknown"}</strong>.
                </p>
                {isLockedForNonLead ? (
                  <p className="text-sm text-warning-fg">
                    This audit is completed; editing is locked for non-lead roles.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="bg-surface/45">
              <CardContent className="space-y-4 p-5">
                <p className="text-sm font-semibold text-fg">Export actions</p>
                <div className={`rounded-2xl border px-4 py-3 text-sm ${autosaveIndicatorTone}`}>
                  <p className="font-medium">{autosaveIndicatorText}</p>
                  <p className="mt-1 text-xs text-current/80">{manualSaveHint}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void generatePdfExport()}
                    disabled={!canExport || isGeneratingPdf}
                  >
                    <FileText className="size-4" /> {isGeneratingPdf ? "Generating PDF…" : "Generate PDF export"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => downloadAuditCsv("all")}
                    disabled={!canExport || downloadingCsvKind !== null}
                  >
                    <Download className="size-4" /> {downloadingCsvKind === "all" ? "Downloading…" : "CSV: all"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => downloadAuditCsv("certification")}
                    disabled={!canExport || downloadingCsvKind !== null}
                  >
                    {downloadingCsvKind === "certification" ? "Downloading…" : "CSV: certification"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => downloadAuditCsv("gaps")}
                    disabled={!canExport || downloadingCsvKind !== null}
                  >
                    {downloadingCsvKind === "gaps" ? "Downloading…" : "CSV: gaps"}
                  </Button>
                </div>
                {message ? (
                  <div
                    role="status"
                    className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-accent"
                  >
                    {message}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </PageSection>

        <div
          ref={stickyBarRef}
          className="sticky top-4 z-30 rounded-2xl border border-border/80 bg-surface/95 px-4 py-3 backdrop-blur lg:px-5"
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-fg">Save controls</p>
                <p className="text-xs text-muted">{autosaveIndicatorText}</p>
                <p className="mt-1 text-xs text-muted">{lastSavedText}</p>
              </div>
              <div className="text-xs text-muted lg:max-w-sm lg:text-right">{manualSaveHint}</div>
            </div>
            <SaveControls
              compact
              canManageScopeTargets={canManageScopeTargets}
              canEdit={canEdit}
              canLeadEdit={canLeadEdit}
              onSaveScope={() => void saveSectionNow("scope")}
              onSaveAssessments={() => void saveSectionNow("assessments")}
              onSaveDetails={() => void saveSectionNow("details")}
              onSaveConclusion={() => void saveSectionNow("conclusion")}
              onSaveAll={() => void saveAll()}
            />
            <div
              role="tablist"
              aria-label="Audit sections"
              className="-mx-1 flex gap-1 overflow-x-auto border-t border-border/80 px-1 pt-3"
            >
              {WORKSPACE_TABS.map((tab, index) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`workspace-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`workspace-tabpanel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectTab(tab.id)}
                    onKeyDown={onTabKeyDown}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      selected
                        ? "border-primary/60 bg-primary/10 text-accent"
                        : "border-transparent text-fg-secondary hover:border-border hover:text-fg"
                    }`}
                  >
                    {index + 1}. {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          style={{ "--ws-sticky": `${stickyOffset + 16}px` } as React.CSSProperties}
          className={activeTab === "scope" ? "grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]" : "grid gap-6"}
        >
          {activeTab === "scope" ? (
            <ProcessSidebarNav
              processes={groupedProcesses}
              activeProcessCode={activeProcessCode}
              progress={scoredByProcess}
              onJump={scrollToProcess}
            />
          ) : null}

          <div className="grid min-w-0 gap-6">
            <div
              role="tabpanel"
              id="workspace-tabpanel-scope"
              aria-labelledby="workspace-tab-scope"
              hidden={activeTab !== "scope"}
            >
              <PageSection
                title="1. Scope & requirements by process"
                eyebrow="Execution"
                description="Each process panel now isolates scope settings, density controls, and requirement scoring to keep work focused."
                action={
                  <Button variant="secondary" onClick={() => void saveSectionNow("assessments")} disabled={!canEdit}>
                    <Layers3 className="size-4" /> Save assessments
                  </Button>
                }
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
                        setNoteDraftByAssessment,
                      }}
                      permissions={{ canManageScopeTargets, canEdit }}
                      actions={{
                        updatePanelDensity,
                        toggleAssessmentHistory,
                        addAssessmentNote,
                        requestScopeAutosave: () => autosave.requestSave("scope"),
                        requestAssessmentAutosave: () => autosave.requestSave("assessments"),
                      }}
                    />
                  ))}
                </div>
              </PageSection>
            </div>

            <div
              role="tabpanel"
              id="workspace-tabpanel-exports"
              aria-labelledby="workspace-tab-exports"
              hidden={activeTab !== "exports"}
            >
              <ExportsPanel
                pdfExports={pdfExports}
                canExport={canExport}
                downloadingExportId={downloadingExportId}
                downloadPdfExport={downloadPdfExport}
              />
            </div>

            <div
              role="tabpanel"
              id="workspace-tabpanel-activity"
              aria-labelledby="workspace-tab-activity"
              hidden={activeTab !== "activity"}
            >
              <ActivityPanel workspace={workspace} />
            </div>

            <div
              role="tabpanel"
              id="workspace-tabpanel-details"
              aria-labelledby="workspace-tab-details"
              hidden={activeTab !== "details"}
            >
              <DetailsPanel
                workspace={workspace}
                detailEdits={detailEdits}
                setDetailEdits={setDetailEdits}
                canEdit={canEdit}
                saveSectionNow={saveSectionNow}
                autosave={autosave}
              />
            </div>

            <div
              role="tabpanel"
              id="workspace-tabpanel-conclusion"
              aria-labelledby="workspace-tab-conclusion"
              hidden={activeTab !== "conclusion"}
            >
              <ConclusionPanel
                conclusionEdit={conclusionEdit}
                setConclusionEdit={setConclusionEdit}
                canLeadEdit={canLeadEdit}
                saveSectionNow={saveSectionNow}
                autosave={autosave}
              />
            </div>
          </div>
        </div>
      </PageShell>

      {activeTab === "scope" ? (
        <ProcessMobileNav
          processes={groupedProcesses}
          activeProcessCode={activeProcessCode}
          progress={scoredByProcess}
          onJump={scrollToProcess}
        />
      ) : null}
    </>
  );
}
