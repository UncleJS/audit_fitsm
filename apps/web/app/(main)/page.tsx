// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { ArrowRight, Building2, CalendarRange, FileText, RotateCw, Sparkles } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import AuditsSection from "../components/dashboard/audits-section";
import ClientFocusSection from "../components/dashboard/client-focus";
import NewAuditSheet from "../components/dashboard/new-audit-sheet";
import StatCard from "../components/dashboard/stat-card";
import TrendViewSection from "../components/dashboard/trend-view";
import PageSection from "../components/layout/page-section";
import PageShell from "../components/layout/page-shell";
import { Button } from "../components/ui/button";
import { apiBaseUrl, apiErrorMessage, apiFetch, downloadFile, isAbortError, NETWORK_ERROR_MESSAGE } from "../lib/api";
import { localDateString } from "../lib/date-format";
import { aggregateTrendsByAudit, latestTrends, type TrendRow, trendSparkline } from "../lib/trends";

type ClientRow = { id: number; name: string };
type AuditRow = {
  id: number;
  name: string;
  status: string;
  audit_date_UTC: string;
  created_UTC?: string;
  updated_UTC?: string;
};

export default function HomePage() {
  const [clientsState, setClientsState] = useState<"loading" | "ready" | "error">("loading");
  const [clientsError, setClientsError] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [clientDataError, setClientDataError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "in_progress" | "completed">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<
    "updated_desc" | "audit_date_desc" | "audit_date_asc" | "name_asc" | "status_asc"
  >("updated_desc");
  const [statusSavingByAuditId, setStatusSavingByAuditId] = useState<Record<string, boolean>>({});
  const [newAuditName, setNewAuditName] = useState("");
  const [newAuditDate, setNewAuditDate] = useState("");
  const [newAuditCertGoalLevel, setNewAuditCertGoalLevel] = useState("3");
  const [auditSheetOpen, setAuditSheetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const clientDataControllerRef = useRef<AbortController | null>(null);

  const loadClients = async () => {
    setClientsState("loading");
    setClientsError("");
    try {
      const res = await apiFetch(`/clients`);
      if (!res.ok) {
        if (res.status === 401) return; // apiFetch is redirecting to login
        setClients([]);
        setClientsError(await apiErrorMessage(res, "Unable to load clients. Check your permissions."));
        setClientsState("error");
        return;
      }

      const data = (await res.json()) as ClientRow[];
      setClients(data);
      setSelectedClientId((current) =>
        current !== null && data.some((client) => client.id === current) ? current : (data[0]?.id ?? null),
      );
      setClientsState("ready");
    } catch {
      setClientsError(NETWORK_ERROR_MESSAGE);
      setClientsState("error");
    }
  };

  /** Loads audits and trends for a client; a newer call aborts older ones so stale data never wins. */
  const loadClientData = async (clientId: number) => {
    clientDataControllerRef.current?.abort();
    const controller = new AbortController();
    clientDataControllerRef.current = controller;
    const { signal } = controller;
    setClientDataError("");

    const fetchJson = async <T,>(path: string, fallback: string): Promise<T> => {
      const res = await apiFetch(path, { signal });
      if (!res.ok) throw new Error(await apiErrorMessage(res, fallback));
      return (await res.json()) as T;
    };

    const [auditsResult, trendsResult] = await Promise.allSettled([
      fetchJson<AuditRow[]>(`/orgs/${clientId}/audits`, "Unable to load audits for this client."),
      fetchJson<TrendRow[]>(`/orgs/${clientId}/trends`, "Unable to load trends for this client."),
    ]);
    if (signal.aborted) return;

    const errors: string[] = [];
    const describe = (reason: unknown, fallback: string) =>
      isAbortError(reason)
        ? ""
        : reason instanceof TypeError
          ? NETWORK_ERROR_MESSAGE
          : reason instanceof Error
            ? reason.message
            : fallback;

    if (auditsResult.status === "fulfilled") {
      setAudits(auditsResult.value);
    } else {
      setAudits([]);
      errors.push(describe(auditsResult.reason, "Unable to load audits for this client."));
    }
    if (trendsResult.status === "fulfilled") {
      setTrendRows(trendsResult.value);
    } else {
      setTrendRows([]);
      errors.push(describe(trendsResult.reason, "Unable to load trends for this client."));
    }
    setClientDataError([...new Set(errors.filter(Boolean))].join(" "));
  };

  useEffect(() => {
    setNewAuditDate(localDateString());
    void loadClients();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setAudits([]);
      setTrendRows([]);
      return;
    }
    // Clear the previous client's rows right away so they never show under the new selection.
    setAudits([]);
    setTrendRows([]);
    void loadClientData(selectedClientId);
    return () => clientDataControllerRef.current?.abort();
  }, [selectedClientId]);

  if (clientsState === "loading" && clients.length === 0) {
    return (
      <PageShell>
        <PageSection
          headingLevel={1}
          title="Audit FitSM Workspace"
          description="Loading your workspace."
          eyebrow="Dashboard"
        >
          <p className="text-sm text-muted">Preparing clients, audits, and trends…</p>
        </PageSection>
      </PageShell>
    );
  }

  if (clientsState === "error") {
    return (
      <PageShell>
        <PageSection
          headingLevel={1}
          title="Audit FitSM Workspace"
          description="The dashboard could not be loaded."
          eyebrow="Dashboard"
        >
          <p role="alert" className="text-sm text-danger-fg">
            {clientsError}
          </p>
          <Button variant="secondary" onClick={() => void loadClients()}>
            <RotateCw className="size-4" /> Retry
          </Button>
        </PageSection>
      </PageShell>
    );
  }

  const filteredAudits = audits
    .filter((audit) => (statusFilter === "all" ? true : audit.status === statusFilter))
    .filter((audit) => {
      if (!searchTerm.trim()) return true;
      const haystack = `${audit.id} ${audit.name} ${audit.status} ${audit.audit_date_UTC}`.toLowerCase();
      return haystack.includes(searchTerm.trim().toLowerCase());
    })
    .sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "status_asc") return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
      if (sortBy === "audit_date_asc") return String(a.audit_date_UTC).localeCompare(String(b.audit_date_UTC));
      if (sortBy === "audit_date_desc") return String(b.audit_date_UTC).localeCompare(String(a.audit_date_UTC));
      return String(b.updated_UTC ?? b.audit_date_UTC).localeCompare(String(a.updated_UTC ?? a.audit_date_UTC));
    });

  const recentlyUpdated = [...audits]
    .sort((a, b) => String(b.updated_UTC ?? b.audit_date_UTC).localeCompare(String(a.updated_UTC ?? a.audit_date_UTC)))
    .slice(0, 4);

  const trendByAudit = aggregateTrendsByAudit(trendRows, audits);
  const trendLine = trendSparkline(trendByAudit);
  const trendLatest = latestTrends(trendByAudit);
  const draftCount = audits.filter((audit) => audit.status === "draft").length;
  const inProgressCount = audits.filter((audit) => audit.status === "in_progress").length;
  const completedCount = audits.filter((audit) => audit.status === "completed").length;

  const nextStatusForQuickAction = (status: string): "draft" | "in_progress" | "completed" | null => {
    if (status === "draft") return "in_progress";
    if (status === "in_progress") return "completed";
    if (status === "completed") return "in_progress";
    return null;
  };

  const quickActionLabel = (status: string): string => {
    if (status === "draft") return "Start";
    if (status === "in_progress") return "Complete";
    if (status === "completed") return "Re-open";
    return "Update";
  };

  const updateAuditStatus = async (auditId: number, nextStatus: "draft" | "in_progress" | "completed") => {
    setMessage("");
    const key = String(auditId);
    setStatusSavingByAuditId((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await apiFetch(`/audits/${auditId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        setMessage(await apiErrorMessage(res, "Status update failed."));
        return;
      }

      setMessage(`Audit ${auditId} updated to '${nextStatus}'.`);
      if (selectedClientId) {
        await loadClientData(selectedClientId);
      }
    } catch {
      setMessage(`Status update failed. ${NETWORK_ERROR_MESSAGE}`);
    } finally {
      setStatusSavingByAuditId((prev) => ({ ...prev, [key]: false }));
    }
  };

  const downloadTrendsCsv = async () => {
    setMessage("");
    if (!selectedClientId) {
      setMessage("Select a client first.");
      return;
    }

    try {
      await downloadFile(
        `/orgs/${selectedClientId}/exports/csv?report=trends`,
        `org-${selectedClientId}-trends.csv`,
        "CSV download failed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CSV download failed.");
    }
  };

  const createAudit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (!selectedClientId) {
      setMessage("Select a client first.");
      return;
    }

    let created: { id: number };
    try {
      const res = await apiFetch(`/orgs/${selectedClientId}/audits`, {
        method: "POST",
        body: JSON.stringify({
          name: newAuditName,
          auditDate: newAuditDate,
          certGoalLevel: Number(newAuditCertGoalLevel || "3"),
        }),
      });

      if (!res.ok) {
        setMessage(await apiErrorMessage(res, "Audit creation failed."));
        return;
      }
      created = await res.json();
    } catch {
      setMessage(`Audit creation failed. ${NETWORK_ERROR_MESSAGE}`);
      return;
    }

    setAuditSheetOpen(false);
    window.location.href = `/audits/${created.id}`;
  };

  return (
    <PageShell>
      <PageSection
        headingLevel={1}
        title="Audit portfolio dashboard"
        eyebrow="Dashboard"
        description="Select a client, create a new audit, and work through trends and active assessments with clearer separation between planning, execution, and review."
        action={
          <NewAuditSheet
            sheet={{ open: auditSheetOpen, onOpenChange: setAuditSheetOpen }}
            form={{
              onSubmit: createAudit,
              name: newAuditName,
              setName: setNewAuditName,
              date: newAuditDate,
              setDate: setNewAuditDate,
              certGoalLevel: newAuditCertGoalLevel,
              setCertGoalLevel: setNewAuditCertGoalLevel,
            }}
          />
        }
      >
        <div className="grid gap-4 xl:grid-cols-4">
          <StatCard label="Clients" value={clients.length} icon={Building2} />
          <StatCard label="Draft audits" value={draftCount} icon={FileText} />
          <StatCard label="In progress" value={inProgressCount} icon={CalendarRange} />
          <StatCard label="Completed" value={completedCount} icon={Sparkles} />
        </div>

        <div className="grid gap-4 rounded-2xl border border-border/80 bg-surface/45 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-2">
            <p className="text-sm font-medium text-fg-secondary">API docs</p>
            <p className="text-sm text-muted">Open the backend OpenAPI docs directly from the current environment.</p>
          </div>
          <Link
            href={`${apiBaseUrl()}/docs`}
            className="inline-flex items-center gap-2 rounded-xl border border-border-strong bg-surface-2 px-4 py-2 text-sm font-medium text-fg hover:border-border-strong"
          >
            Open /docs <ArrowRight className="size-4" />
          </Link>
        </div>

        {message ? (
          <div
            role="status"
            className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-accent"
          >
            {message}
          </div>
        ) : null}

        {clientDataError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger-fg"
          >
            <span>{clientDataError}</span>
            {selectedClientId ? (
              <Button size="sm" variant="secondary" onClick={() => void loadClientData(selectedClientId)}>
                <RotateCw className="size-4" /> Retry
              </Button>
            ) : null}
          </div>
        ) : null}
      </PageSection>

      <ClientFocusSection
        clients={clients}
        selectedClientId={selectedClientId}
        setSelectedClientId={setSelectedClientId}
        recentlyUpdated={recentlyUpdated}
      />

      <AuditsSection
        filters={{ statusFilter, setStatusFilter, searchTerm, setSearchTerm, sortBy, setSortBy }}
        table={{ filteredAudits, selectedClientId, statusSavingByAuditId }}
        actions={{
          downloadTrendsCsv,
          nextStatusForQuickAction,
          updateAuditStatus,
          quickActionLabel,
          onOpenAuditSheet: () => setAuditSheetOpen(true),
        }}
      />

      <TrendViewSection trendSparkline={trendLine} trendLatest={trendLatest} />
    </PageShell>
  );
}
