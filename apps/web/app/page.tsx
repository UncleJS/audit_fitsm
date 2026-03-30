// @ts-nocheck
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, CalendarRange, FileText, Sparkles } from "lucide-react";
import AuditsSection from "./components/dashboard/audits-section";
import ClientFocusSection from "./components/dashboard/client-focus";
import NewAuditSheet from "./components/dashboard/new-audit-sheet";
import StatCard from "./components/dashboard/stat-card";
import TrendViewSection from "./components/dashboard/trend-view";
import PageShell from "./components/layout/page-shell";
import PageSection from "./components/layout/page-section";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";

type ClientRow = { id: number; name: string };
type AuditRow = {
  id: number;
  name: string;
  status: string;
  audit_date: string;
  created_at?: string;
  updated_at?: string;
};

type TrendRow = {
  org_id: number;
  audit_id: number;
  audit_date: string;
  process_id: number;
  process_code: string;
  process_abbreviation: string;
  process_name: string;
  average_capability_score: number | null;
  scored_requirements: number;
  total_requirements: number;
};

const apiUrlFromEnv = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
const defaultApiUrl = apiUrlFromEnv || "http://127.0.0.1:1261";
const demoToken = process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "1" ? process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "" : "";

const authHeaders = (token: string, json = false) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

const sparkline = (values: number[]): string => {
  if (!values.length) return "—";
  const ticks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return values.map(() => "▅").join("");
  return values
    .map((value) => {
      const normalized = (value - min) / (max - min);
      const index = Math.max(0, Math.min(ticks.length - 1, Math.round(normalized * (ticks.length - 1))));
      return ticks[index];
    })
    .join("");
};

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [authToken, setAuthToken] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [trendRows, setTrendRows] = useState<TrendRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "in_progress" | "completed">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"updated_desc" | "audit_date_desc" | "audit_date_asc" | "name_asc" | "status_asc">("updated_desc");
  const [statusSavingByAuditId, setStatusSavingByAuditId] = useState<Record<string, boolean>>({});
  const [newAuditName, setNewAuditName] = useState("");
  const [newAuditDate, setNewAuditDate] = useState("");
  const [newAuditCertGoalLevel, setNewAuditCertGoalLevel] = useState("3");
  const [auditSheetOpen, setAuditSheetOpen] = useState(false);
  const [message, setMessage] = useState("");

  const tokenMissing = useMemo(() => !authToken, [authToken]);

  const loadClients = async () => {
    const res = await fetch(`${apiUrl}/clients`, {
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
      setMessage("Unable to load clients. Check token or permissions.");
      setClients([]);
      return;
    }

    const data = (await res.json()) as ClientRow[];
    setClients(data);
    if (!selectedClientId && data.length) {
      setSelectedClientId(data[0].id);
    }
  };

  const loadAudits = async (clientId: number) => {
    const res = await fetch(`${apiUrl}/orgs/${clientId}/audits`, {
      headers: authHeaders(authToken),
      cache: "no-store"
    });

    if (!res.ok) {
      setAudits([]);
      return;
    }

    setAudits((await res.json()) as AuditRow[]);
  };

  const loadTrends = async (clientId: number) => {
    const res = await fetch(`${apiUrl}/orgs/${clientId}/trends`, {
      headers: authHeaders(authToken),
      cache: "no-store"
    });

    if (!res.ok) {
      setTrendRows([]);
      return;
    }

    setTrendRows((await res.json()) as TrendRow[]);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!apiUrlFromEnv) {
      setApiUrl(`${window.location.protocol}//${window.location.hostname}:1261`);
    }
    const storedToken = window.sessionStorage.getItem("audit_fitsm_token") || "";
    setAuthToken(storedToken || demoToken);
    setNewAuditDate(new Date().toISOString().slice(0, 10));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!authToken && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [mounted, authToken]);

  useEffect(() => {
    if (!authToken) {
      setClients([]);
      setAudits([]);
      setTrendRows([]);
      return;
    }
    void loadClients();
  }, [authToken]);

  useEffect(() => {
    if (selectedClientId && authToken) {
      void Promise.all([loadAudits(selectedClientId), loadTrends(selectedClientId)]);
    }
  }, [selectedClientId, authToken]);

  if (!mounted) {
    return (
      <PageShell>
        <PageSection title="Audit FitSM Workspace" description="Loading your workspace." eyebrow="Dashboard">
          <p className="text-sm text-slate-400">Preparing clients, audits, and trends…</p>
        </PageSection>
      </PageShell>
    );
  }

  if (tokenMissing) {
    return (
      <PageShell>
        <PageSection title="Audit FitSM Workspace" description="Redirecting to login." eyebrow="Dashboard">
          <p className="text-sm text-slate-400">You need to sign in before viewing client workspaces.</p>
        </PageSection>
      </PageShell>
    );
  }

  const filteredAudits = audits
    .filter((audit) => (statusFilter === "all" ? true : audit.status === statusFilter))
    .filter((audit) => {
      if (!searchTerm.trim()) return true;
      const haystack = `${audit.id} ${audit.name} ${audit.status} ${audit.audit_date}`.toLowerCase();
      return haystack.includes(searchTerm.trim().toLowerCase());
    })
    .sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "status_asc") return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
      if (sortBy === "audit_date_asc") return String(a.audit_date).localeCompare(String(b.audit_date));
      if (sortBy === "audit_date_desc") return String(b.audit_date).localeCompare(String(a.audit_date));
      return String(b.updated_at ?? b.audit_date).localeCompare(String(a.updated_at ?? a.audit_date));
    });

  const recentlyUpdated = [...audits]
    .sort((a, b) => String(b.updated_at ?? b.audit_date).localeCompare(String(a.updated_at ?? a.audit_date)))
    .slice(0, 4);

  const trendByAudit = (() => {
    const byAudit = new Map<number, any>();
    for (const row of trendRows) {
      const auditId = Number(row.audit_id);
      if (!byAudit.has(auditId)) {
        byAudit.set(auditId, {
          auditId,
          auditDate: String(row.audit_date),
          avgSum: 0,
          avgCount: 0,
          scoredReqSum: 0,
          totalReqSum: 0
        });
      }

      const current = byAudit.get(auditId);
      const avg = row.average_capability_score;
      if (avg !== null && avg !== undefined && Number.isFinite(Number(avg))) {
        current.avgSum += Number(avg);
        current.avgCount += 1;
      }
      current.scoredReqSum += Number(row.scored_requirements ?? 0);
      current.totalReqSum += Number(row.total_requirements ?? 0);
    }

    const auditMeta = new Map(audits.map((audit) => [audit.id, audit]));
    return [...byAudit.values()]
      .map((item) => {
        const meta = auditMeta.get(item.auditId);
        const averageCapability = item.avgCount > 0 ? item.avgSum / item.avgCount : null;
        return {
          ...item,
          averageCapability,
          name: meta?.name ?? `Audit #${item.auditId}`,
          status: meta?.status ?? "unknown"
        };
      })
      .sort((a, b) => String(a.auditDate).localeCompare(String(b.auditDate)));
  })();

  const trendSparkline = sparkline(
    trendByAudit
      .filter((item) => item.averageCapability !== null)
      .slice(-10)
      .map((item) => Number(item.averageCapability))
  );

  const trendLatest = [...trendByAudit].sort((a, b) => String(b.auditDate).localeCompare(String(a.auditDate))).slice(0, 6);
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
      const res = await fetch(`${apiUrl}/audits/${auditId}/status`, {
        method: "PUT",
        headers: authHeaders(authToken, true),
        body: JSON.stringify({ status: nextStatus })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "Status update failed.");
        return;
      }

      setMessage(`Audit ${auditId} updated to '${nextStatus}'.`);
      if (selectedClientId) {
        await loadAudits(selectedClientId);
      }
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

    const res = await fetch(`${apiUrl}/orgs/${selectedClientId}/exports/csv?report=trends`, {
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
    a.download = `org-${selectedClientId}-trends.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const createAudit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (!selectedClientId) {
      setMessage("Select a client first.");
      return;
    }

    const res = await fetch(`${apiUrl}/orgs/${selectedClientId}/audits`, {
      method: "POST",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({
        name: newAuditName,
        auditDate: newAuditDate,
        certGoalLevel: Number(newAuditCertGoalLevel || "3")
      })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.error ?? "Audit creation failed.");
      return;
    }

    const created = await res.json();
    setAuditSheetOpen(false);
    window.location.href = `/audits/${created.id}`;
  };

  return (
    <PageShell>
      <PageSection
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
              setCertGoalLevel: setNewAuditCertGoalLevel
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

        <div className="grid gap-4 rounded-2xl border border-slate-800/80 bg-slate-950/45 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">API docs</p>
            <p className="text-sm text-slate-400">Open the backend OpenAPI docs directly from the current environment.</p>
          </div>
          <Link href={`${apiUrl}/docs`} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500">
            Open /docs <ArrowRight className="size-4" />
          </Link>
        </div>

        {message ? (
          <div className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{message}</div>
        ) : null}
      </PageSection>

      <ClientFocusSection clients={clients} selectedClientId={selectedClientId} setSelectedClientId={setSelectedClientId} recentlyUpdated={recentlyUpdated} />

      <AuditsSection
        filters={{ statusFilter, setStatusFilter, searchTerm, setSearchTerm, sortBy, setSortBy }}
        table={{ filteredAudits, selectedClientId, statusSavingByAuditId }}
        actions={{
          downloadTrendsCsv,
          nextStatusForQuickAction,
          updateAuditStatus,
          quickActionLabel,
          onOpenAuditSheet: () => setAuditSheetOpen(true)
        }}
      />

      <TrendViewSection trendSparkline={trendSparkline} trendLatest={trendLatest} />
    </PageShell>
  );
}
