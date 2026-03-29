// @ts-nocheck
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import DateOnlyInput from "./components/date-only-input";
import { formatDateOnly } from "./lib/date-format";
import { decodeHtmlEntities } from "./lib/text-format";

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

type RoleRow = { code: string; description: string };
type OrgUserRow = {
  id: number;
  email: string;
  display_name: string;
  is_active: boolean;
  has_active_org_roles: boolean;
  roles: string[];
};

const apiUrlFromEnv = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
const defaultApiUrl = apiUrlFromEnv || "http://127.0.0.1:1261";
const demoToken = process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "";

const authHeaders = (token: string, json = false) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

const sparkline = (values: number[]): string => {
  if (!values.length) return "—";
  const ticks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return values.map(() => "▅").join("");
  }
  return values
    .map((value) => {
      const normalized = (value - min) / (max - min);
      const idx = Math.max(0, Math.min(ticks.length - 1, Math.round(normalized * (ticks.length - 1))));
      return ticks[idx];
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
  const [rolesCatalog, setRolesCatalog] = useState<RoleRow[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUserRow[]>([]);
  const [roleEditsByUserId, setRoleEditsByUserId] = useState<Record<string, string[]>>({});
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRoles, setNewUserRoles] = useState<string[]>(["viewer"]);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [rbacDensity, setRbacDensity] = useState<"comfortable" | "compact">("comfortable");
  const [savingRolesByUserId, setSavingRolesByUserId] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "in_progress" | "completed">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<
    "updated_desc" | "audit_date_desc" | "audit_date_asc" | "name_asc" | "status_asc"
  >("updated_desc");
  const [statusSavingByAuditId, setStatusSavingByAuditId] = useState<Record<string, boolean>>({});
  const [newAuditName, setNewAuditName] = useState("");
  const [newAuditDate, setNewAuditDate] = useState("");
  const [newAuditCertGoalLevel, setNewAuditCertGoalLevel] = useState("3");
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
      setMessage("Unable to load clients. Check token/permissions.");
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

    const rows = (await res.json()) as TrendRow[];
    setTrendRows(rows);
  };

  const loadRoles = async () => {
    const res = await fetch(`${apiUrl}/roles`, {
      headers: authHeaders(authToken),
      cache: "no-store"
    });

    if (!res.ok) {
      setRolesCatalog([]);
      return;
    }

    setRolesCatalog((await res.json()) as RoleRow[]);
  };

  const loadOrgUsers = async (clientId: number) => {
    const res = await fetch(`${apiUrl}/orgs/${clientId}/users`, {
      headers: authHeaders(authToken),
      cache: "no-store"
    });

    if (!res.ok) {
      setOrgUsers([]);
      return;
    }

    const users = (await res.json()) as OrgUserRow[];
    setOrgUsers(users);
    const nextEdits: Record<string, string[]> = {};
    for (const user of users) {
      nextEdits[String(user.id)] = [...(user.roles ?? [])];
    }
    setRoleEditsByUserId(nextEdits);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!apiUrlFromEnv) {
      setApiUrl(`${window.location.protocol}//${window.location.hostname}:1261`);
    }
    const storedToken = window.sessionStorage.getItem("audit_fitsm_token") || "";
    const storedDensity = window.sessionStorage.getItem("audit_fitsm_rbac_density");
    setAuthToken(storedToken || demoToken);
    if (storedDensity === "compact" || storedDensity === "comfortable") {
      setRbacDensity(storedDensity);
    }
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
      setRolesCatalog([]);
      setOrgUsers([]);
      return;
    }
    Promise.all([loadClients(), loadRoles()]);
  }, [authToken]);

  useEffect(() => {
    if (selectedClientId && authToken) {
      Promise.all([loadAudits(selectedClientId), loadTrends(selectedClientId), loadOrgUsers(selectedClientId)]);
    }
  }, [selectedClientId, authToken]);

  if (!mounted) {
    return (
      <main className="container grid" suppressHydrationWarning>
        <section className="card">
          <h1>Audit FitSM Workspace</h1>
          <p>Loading workspace…</p>
        </section>
      </main>
    );
  }

  if (tokenMissing) {
    return (
      <main className="container grid" suppressHydrationWarning>
        <section className="card">
          <h1>Audit FitSM Workspace</h1>
          <p>Redirecting to login…</p>
        </section>
      </main>
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
    .slice(0, 5);

  const trendByAudit = (() => {
    const byAudit = new Map<
      number,
      {
        auditId: number;
        auditDate: string;
        avgSum: number;
        avgCount: number;
        scoredReqSum: number;
        totalReqSum: number;
      }
    >();

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

      const current = byAudit.get(auditId)!;
      const avg = row.average_capability_score;
      if (avg !== null && avg !== undefined && Number.isFinite(Number(avg))) {
        current.avgSum += Number(avg);
        current.avgCount += 1;
      }
      current.scoredReqSum += Number(row.scored_requirements ?? 0);
      current.totalReqSum += Number(row.total_requirements ?? 0);
    }

    const auditMeta = new Map(audits.map((audit) => [audit.id, audit]));

    const summary = [...byAudit.values()].map((item) => {
      const meta = auditMeta.get(item.auditId);
      const averageCapability = item.avgCount > 0 ? item.avgSum / item.avgCount : null;
      return {
        ...item,
        averageCapability,
        name: meta?.name ?? `Audit #${item.auditId}`,
        status: meta?.status ?? "unknown"
      };
    });

    return summary.sort((a, b) => String(a.auditDate).localeCompare(String(b.auditDate)));
  })();

  const trendSparkline = sparkline(
    trendByAudit
      .filter((item) => item.averageCapability !== null)
      .slice(-10)
      .map((item) => Number(item.averageCapability))
  );

  const trendLatest = [...trendByAudit]
    .sort((a, b) => String(b.auditDate).localeCompare(String(a.auditDate)))
    .slice(0, 5);

  const draftCount = audits.filter((audit) => audit.status === "draft").length;
  const inProgressCount = audits.filter((audit) => audit.status === "in_progress").length;
  const completedCount = audits.filter((audit) => audit.status === "completed").length;
  const isRbacCompact = rbacDensity === "compact";
  const rbacTableSpacing = isRbacCompact ? "0 6px" : "0 10px";
  const rbacCellPadding = isRbacCompact ? 7 : 10;
  const rbacRoleGridCols = isRbacCompact ? "repeat(3, minmax(95px, 1fr))" : "repeat(2, minmax(120px, 1fr))";
  const rbacRoleGap = isRbacCompact ? 4 : 6;

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

  const statusBadgeColor = (status: string): string => {
    if (status === "draft") return "#5c6bc0";
    if (status === "in_progress") return "#ef9a3d";
    if (status === "completed") return "#66bb6a";
    return "#90a4ae";
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

    if (!authToken) {
      setMessage("Please login first.");
      return;
    }
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

  const toggleRoleSelection = (roles: string[], roleCode: string): string[] => {
    if (roles.includes(roleCode)) {
      return roles.filter((role) => role !== roleCode);
    }
    return [...roles, roleCode];
  };

  const updateRbacDensity = (density: "comfortable" | "compact") => {
    setRbacDensity(density);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("audit_fitsm_rbac_density", density);
    }
  };

  const createOrgUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    if (!selectedClientId) {
      setMessage("Select a client first.");
      return;
    }
    if (newUserRoles.length === 0) {
      setMessage("Select at least one role.");
      return;
    }

    setIsCreatingUser(true);
    try {
      const res = await fetch(`${apiUrl}/orgs/${selectedClientId}/users`, {
        method: "POST",
        headers: authHeaders(authToken, true),
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          displayName: newUserDisplayName,
          roles: newUserRoles
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "User creation failed.");
        return;
      }

      setMessage("Organization user created.");
      setNewUserEmail("");
      setNewUserDisplayName("");
      setNewUserPassword("");
      setNewUserRoles(["viewer"]);
      await loadOrgUsers(selectedClientId);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const saveUserRoles = async (userId: number) => {
    setMessage("");

    if (!selectedClientId) {
      setMessage("Select a client first.");
      return;
    }

    const key = String(userId);
    const roles = roleEditsByUserId[key] ?? [];
    if (roles.length === 0) {
      setMessage("At least one role is required.");
      return;
    }

    setSavingRolesByUserId((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${apiUrl}/orgs/${selectedClientId}/users/${userId}/roles`, {
        method: "PUT",
        headers: authHeaders(authToken, true),
        body: JSON.stringify({ roles })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "Role update failed.");
        return;
      }

      setMessage(`Roles updated for user ${userId}.`);
      await loadOrgUsers(selectedClientId);
    } finally {
      setSavingRolesByUserId((prev) => ({ ...prev, [key]: false }));
    }
  };

  const archiveUserInClient = async (userId: number) => {
    setMessage("");

    if (!selectedClientId) {
      setMessage("Select a client first.");
      return;
    }

    const key = String(userId);
    setSavingRolesByUserId((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`${apiUrl}/orgs/${selectedClientId}/users/${userId}/roles`, {
        method: "PUT",
        headers: authHeaders(authToken, true),
        body: JSON.stringify({ roles: [] })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "User archive failed.");
        return;
      }

      setMessage(`User ${userId} archived in selected client.`);
      await loadOrgUsers(selectedClientId);
    } finally {
      setSavingRolesByUserId((prev) => ({ ...prev, [key]: false }));
    }
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
    window.location.href = `/audits/${created.id}`;
  };

  return (
    <main className="container grid" suppressHydrationWarning>
      <section className="card">
        <h1>Audit FitSM Workspace</h1>
        <p>
          Select a client, create a new audit, and open the audit workspace with all
          related items grouped under that audit. Client creation is managed on the Admin page.
        </p>
        <p>
          API docs: <a href={`${apiUrl}/docs`}>{`${apiUrl}/docs`}</a>
        </p>
        {message ? <p>{message}</p> : null}
      </section>

      <section className="card grid">
        <h2>1) Clients</h2>
        <div>
          <label htmlFor="client-select">Selected client:</label>{" "}
          {clients.length === 0 ? (
            <>
              <span>No clients available. Create one from </span>
              <a href="/admin">Admin</a>
              <span>.</span>
            </>
          ) : (
            <select
              id="client-select"
              value={selectedClientId ?? ""}
              disabled={tokenMissing}
              onChange={(event) => setSelectedClientId(Number(event.target.value))}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {decodeHtmlEntities(client.name)}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      <section className="card grid">
        <h2>2) Register New Audit</h2>
        <form onSubmit={createAudit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={newAuditName}
            onChange={(event) => setNewAuditName(event.target.value)}
            placeholder="Audit name"
            disabled={tokenMissing}
            required
          />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Cert goal
            <select
              value={newAuditCertGoalLevel}
              onChange={(event) => setNewAuditCertGoalLevel(event.target.value)}
              disabled={tokenMissing}
            >
              <option value="1">1 - Initial</option>
              <option value="2">2 - Repeatable / Partial</option>
              <option value="3">3 - Defined / Complete</option>
              <option value="4">4 - Managed / Quantitatively Controlled</option>
              <option value="5">5 - Optimizing</option>
            </select>
          </label>
          <DateOnlyInput
            id="new-audit-date"
            name="auditDate"
            value={newAuditDate}
            onChange={setNewAuditDate}
            ariaLabel="Audit date"
            disabled={tokenMissing}
            required
          />
          <button type="submit" disabled={tokenMissing}>
            Create & Open Audit
          </button>
        </form>
      </section>

      <section className="card">
        <h2>3) Client Dashboard</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <span>Total audits: {audits.length}</span>
          <span>Draft: {draftCount}</span>
          <span>In progress: {inProgressCount}</span>
          <span>Completed: {completedCount}</span>
        </div>
        <div style={{ marginBottom: 12 }}>
          <strong>Capability trend (latest 10 audits):</strong> {trendSparkline}
        </div>
        <div style={{ marginBottom: 12 }}>
          <button onClick={downloadTrendsCsv} disabled={tokenMissing || !selectedClientId}>
            Download Trends CSV
          </button>
        </div>
        {trendLatest.length === 0 ? (
          <p>No trend data yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Audit</th>
                <th align="left">Date</th>
                <th align="left">Status</th>
                <th align="left">Avg capability</th>
                <th align="left">Scored reqs</th>
              </tr>
            </thead>
            <tbody>
              {trendLatest.map((item) => (
                <tr key={`trend-${item.auditId}`}>
                  <td>{decodeHtmlEntities(item.name)}</td>
                  <td>{formatDateOnly(item.auditDate)}</td>
                  <td>{item.status}</td>
                  <td>
                    {item.averageCapability === null ? "n/a" : Number(item.averageCapability).toFixed(2)}
                  </td>
                  <td>
                    {item.scoredReqSum}/{item.totalReqSum}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>4) Existing Audits for Client</h2>
        {recentlyUpdated.length > 0 ? (
          <div style={{ marginBottom: 12 }}>
            <strong>Recently updated:</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {recentlyUpdated.map((audit) => (
                <a
                  key={`recent-${audit.id}`}
                  href={`/audits/${audit.id}`}
                  style={{
                    display: "inline-block",
                    border: "1px solid #2a355f",
                    borderRadius: 999,
                    padding: "4px 10px",
                    textDecoration: "none"
                  }}
                >
                    #{audit.id} {decodeHtmlEntities(audit.name)}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div
          suppressHydrationWarning
          style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}
        >
          <label htmlFor="status-filter">Filter:</label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as "all" | "draft" | "in_progress" | "completed")
            }
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
          <span>Draft: {draftCount}</span>
          <span>In progress: {inProgressCount}</span>
          <span>Completed: {completedCount}</span>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search audits"
          />
          <label htmlFor="sort-by">Sort:</label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={(event) =>
              setSortBy(
                event.target.value as
                  | "updated_desc"
                  | "audit_date_desc"
                  | "audit_date_asc"
                  | "name_asc"
                  | "status_asc"
              )
            }
          >
            <option value="updated_desc">Recently updated</option>
            <option value="audit_date_desc">Audit date (newest)</option>
            <option value="audit_date_asc">Audit date (oldest)</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="status_asc">Status</option>
          </select>
        </div>
        {filteredAudits.length === 0 ? (
          <p>No audits for selected client.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">ID</th>
                <th align="left">Name</th>
                <th align="left">Status</th>
                <th align="left">Audit date</th>
                <th align="left">Quick action</th>
                <th align="left">Open</th>
              </tr>
            </thead>
            <tbody>
              {filteredAudits.map((audit) => {
                const nextStatus = nextStatusForQuickAction(audit.status);
                const isSaving = !!statusSavingByAuditId[String(audit.id)];
                return (
                <tr key={audit.id}>
                  <td>{audit.id}</td>
                  <td>{decodeHtmlEntities(audit.name)}</td>
                  <td>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: statusBadgeColor(audit.status),
                        color: "#111"
                      }}
                    >
                      {audit.status}
                    </span>
                  </td>
                  <td>{formatDateOnly(audit.audit_date)}</td>
                  <td>
                    <button
                      disabled={!nextStatus || isSaving}
                      onClick={() => nextStatus && updateAuditStatus(audit.id, nextStatus)}
                    >
                      {isSaving ? "Saving..." : quickActionLabel(audit.status)}
                    </button>
                  </td>
                  <td>
                    <a href={`/audits/${audit.id}`}>Open audit workspace</a>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
