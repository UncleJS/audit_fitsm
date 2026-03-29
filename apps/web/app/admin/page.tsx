// @ts-nocheck
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { decodeHtmlEntities } from "../lib/text-format";

type ClientRow = { id: number; name: string };
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

const toUiError = (status: number, body: any, fallback: string): string => {
  const raw = String(body?.error ?? "").toLowerCase();

  if (
    status === 409 &&
    raw.includes("already scoped to another client")
  ) {
    return "This user already belongs to another client. Only system admins can assign users across multiple clients.";
  }

  if (status === 400 && raw.includes("invalid user payload")) {
    const fieldErrors = body?.details?.fieldErrors ?? {};
    const messages = Object.entries(fieldErrors)
      .flatMap(([field, values]) =>
        Array.isArray(values)
          ? values.map((value) => `${field}: ${String(value)}`)
          : []
      )
      .filter(Boolean);

    if (messages.length) {
      return `Invalid user payload — ${messages.join(" | ")}`;
    }

    return "Invalid user payload — check email format, display name (min 2 chars), password (min 8 chars), and roles.";
  }

  return String(body?.error ?? fallback);
};

const parseJwtPayload = (token: string): any | null => {
  try {
    const payloadPart = String(token || "").split(".")[1] || "";
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
    const json = typeof atob === "function" ? atob(padded) : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const hasAdminRoleFromToken = (token: string): boolean => {
  const payload = parseJwtPayload(token);
  const orgRoles = payload?.orgRoles;
  if (!orgRoles || typeof orgRoles !== "object") return false;
  return Object.values(orgRoles)
    .flat()
    .some((role) => role === "org_admin" || role === "system_admin");
};

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [authToken, setAuthToken] = useState("");
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [isCreatingClient, setIsCreatingClient] = useState(false);
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
  const [message, setMessage] = useState("");

  const tokenMissing = useMemo(() => !authToken, [authToken]);
  const hasAdminAccess = useMemo(() => hasAdminRoleFromToken(authToken), [authToken]);
  const messageVariant = useMemo<"info" | "success" | "warning" | "error">(() => {
    const text = String(message || "").toLowerCase();
    if (!text) return "info";
    if (text.includes("already belongs to another client")) return "warning";
    if (text.includes("failed") || text.includes("error") || text.includes("forbidden")) return "error";
    if (text.includes("created") || text.includes("updated") || text.includes("archived")) return "success";
    return "info";
  }, [message]);

  const isRbacCompact = rbacDensity === "compact";
  const rbacTableSpacing = isRbacCompact ? "0 6px" : "0 10px";
  const rbacCellPadding = isRbacCompact ? 7 : 10;
  const rbacRoleGridCols = isRbacCompact ? "repeat(3, minmax(95px, 1fr))" : "repeat(2, minmax(120px, 1fr))";
  const rbacRoleGap = isRbacCompact ? 4 : 6;

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
      setClients([]);
      return;
    }

    const data = (await res.json()) as ClientRow[];
    setClients(data);
    if (!selectedClientId && data.length) {
      setSelectedClientId(data[0].id);
    }
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
      setRolesCatalog([]);
      setOrgUsers([]);
      return;
    }

    if (!hasAdminAccess) {
      setMessage("Admin role required. Redirecting to Clients page...");
      const t = setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.href = "/clients";
        }
      }, 900);
      return () => clearTimeout(t);
    }

    Promise.all([loadClients(), loadRoles()]);
  }, [authToken, hasAdminAccess]);

  useEffect(() => {
    if (selectedClientId && authToken && hasAdminAccess) {
      loadOrgUsers(selectedClientId);
    }
  }, [selectedClientId, authToken, hasAdminAccess]);

  if (!mounted) {
    return (
      <main className="container grid" suppressHydrationWarning>
        <section className="card">
          <h1>Admin</h1>
          <p>Loading admin workspace…</p>
        </section>
      </main>
    );
  }

  if (tokenMissing) {
    return (
      <main className="container grid" suppressHydrationWarning>
        <section className="card">
          <h1>Admin</h1>
          <p>Redirecting to login…</p>
        </section>
      </main>
    );
  }

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

    const email = newUserEmail.trim();
    const displayName = newUserDisplayName.trim();
    const password = newUserPassword;

    if (!selectedClientId) {
      setMessage("Select a client first.");
      return;
    }
    if (!email || !email.includes("@")) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (displayName.length < 2) {
      setMessage("Display name must be at least 2 characters.");
      return;
    }
    if (password.length < 8) {
      setMessage("Temporary password must be at least 8 characters.");
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
          email,
          password,
          displayName,
          roles: newUserRoles
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(toUiError(res.status, body, "User creation failed."));
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
      setMessage("At least one role is required. Use Archive in Client to remove all roles.");
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
        setMessage(toUiError(res.status, body, "Role update failed."));
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

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    setIsCreatingClient(true);
    try {
      const res = await fetch(`${apiUrl}/clients`, {
        method: "POST",
        headers: authHeaders(authToken, true),
        body: JSON.stringify({ name: newClientName })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "Client creation failed.");
        return;
      }

      const created = await res.json();
      setNewClientName("");
      setMessage(`Client '${decodeHtmlEntities(created.name)}' created.`);
      await loadClients();
      setSelectedClientId(Number(created.id));
    } finally {
      setIsCreatingClient(false);
    }
  };

  return (
    <main className="container grid">
      <section className="card">
        <h1>Admin</h1>
        <p>Manage users, roles, and client-level access.</p>
        {message ? (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: 10,
              borderRadius: 10,
              border:
                messageVariant === "warning"
                  ? "1px solid #f6c343"
                  : messageVariant === "error"
                    ? "1px solid #f87171"
                    : messageVariant === "success"
                      ? "1px solid #4ade80"
                      : "1px solid #60a5fa",
              background:
                messageVariant === "warning"
                  ? "#2b2308"
                  : messageVariant === "error"
                    ? "#2c1212"
                    : messageVariant === "success"
                      ? "#0f2a1b"
                      : "#0f1f3a",
              color:
                messageVariant === "warning"
                  ? "#fde68a"
                  : messageVariant === "error"
                    ? "#fecaca"
                    : messageVariant === "success"
                      ? "#bbf7d0"
                      : "#bfdbfe",
              padding: "10px 12px",
              fontWeight: 600
            }}
          >
            {message}
          </div>
        ) : null}
      </section>

      {!tokenMissing && hasAdminAccess ? (
        <>
          <section className="card">
            <h2>1) Client Administration</h2>
            <form onSubmit={createClient} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
                placeholder="New client name"
                required
              />
              <button type="submit" disabled={isCreatingClient}>
                {isCreatingClient ? "Creating..." : "Create Client"}
              </button>
            </form>
          </section>

          <section className="card">
            <h2>2) RBAC Administration (Selected Client)</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <label htmlFor="admin-client-select">Client:</label>
            <select
              id="admin-client-select"
              value={selectedClientId ?? ""}
              onChange={(event) => setSelectedClientId(Number(event.target.value))}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {decodeHtmlEntities(client.name)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ color: "#c8d4ff" }}>Density:</span>
            <button
              type="button"
              onClick={() => updateRbacDensity("comfortable")}
              style={{
                border: rbacDensity === "comfortable" ? "1px solid #8ab4ff" : "1px solid #2a355f",
                background: rbacDensity === "comfortable" ? "#1b2854" : "#111936",
                color: "#e6ecff"
              }}
            >
              Comfortable
            </button>
            <button
              type="button"
              onClick={() => updateRbacDensity("compact")}
              style={{
                border: rbacDensity === "compact" ? "1px solid #8ab4ff" : "1px solid #2a355f",
                background: rbacDensity === "compact" ? "#1b2854" : "#111936",
                color: "#e6ecff"
              }}
            >
              Compact
            </button>
          </div>

          {!selectedClientId ? (
            <p>Select a client to manage users and roles.</p>
          ) : (
            <>
              <form onSubmit={createOrgUser} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    type="email"
                    placeholder="User email"
                    value={newUserEmail}
                    onChange={(event) => setNewUserEmail(event.target.value)}
                    required
                  />
                  <input
                    placeholder="Display name"
                    value={newUserDisplayName}
                    onChange={(event) => setNewUserDisplayName(event.target.value)}
                    minLength={2}
                    required
                  />
                  <input
                    type="password"
                    placeholder="Temporary password"
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    minLength={8}
                    required
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {rolesCatalog.map((role) => (
                    <label key={`new-role-${role.code}`}>
                      <input
                        type="checkbox"
                        checked={newUserRoles.includes(role.code)}
                        onChange={() => setNewUserRoles((prev) => toggleRoleSelection(prev, role.code))}
                      />{" "}
                      {decodeHtmlEntities(role.code)}
                    </label>
                  ))}
                </div>
                <div>
                  <button type="submit" disabled={isCreatingUser || !selectedClientId}>
                    {isCreatingUser ? "Creating..." : "Create User in Client"}
                  </button>
                </div>
              </form>

              {orgUsers.length === 0 ? (
                <p>No users found for this client (or you do not have org admin access).</p>
              ) : (
                <>
                  <p style={{ marginBottom: 8 }}>
                    Tip: click <strong>Archive in Client</strong> to remove all org roles (archive-only). To restore,
                    re-select at least one role and click <strong>Save Roles</strong>.
                  </p>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: rbacTableSpacing }}>
                    <thead>
                      <tr>
                        <th align="left" style={{ padding: "0 10px 6px" }}>Name</th>
                        <th align="left" style={{ padding: "0 10px 6px" }}>Email</th>
                        <th align="left" style={{ padding: "0 10px 6px" }}>User Active</th>
                        <th align="left" style={{ padding: "0 10px 6px" }}>Org Access</th>
                        <th align="left" style={{ padding: "0 10px 6px" }}>Roles</th>
                        <th align="left" style={{ padding: "0 10px 6px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orgUsers.map((user, index) => {
                        const key = String(user.id);
                        const editRoles = roleEditsByUserId[key] ?? user.roles;
                        const saving = !!savingRolesByUserId[key];
                        const rowBg = index % 2 === 0 ? "#0f1834" : "#121e40";
                        return (
                          <tr
                            key={`org-user-${user.id}`}
                            style={{
                              background: rowBg,
                              boxShadow: "inset 0 0 0 1px #2a355f",
                              opacity: user.has_active_org_roles ? 1 : 0.85
                            }}
                          >
                            <td style={{ padding: rbacCellPadding, verticalAlign: "top", fontWeight: 600 }}>{decodeHtmlEntities(user.display_name)}</td>
                            <td style={{ padding: rbacCellPadding, verticalAlign: "top", color: "#c8d4ff" }}>{decodeHtmlEntities(user.email)}</td>
                            <td style={{ padding: rbacCellPadding, verticalAlign: "top" }}>{user.is_active ? "Yes" : "No"}</td>
                            <td style={{ padding: rbacCellPadding, verticalAlign: "top" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  background: user.has_active_org_roles ? "#59d97f" : "#ffb86b",
                                  color: "#111"
                                }}
                              >
                                {user.has_active_org_roles ? "Active" : "Archived"}
                              </span>
                            </td>
                            <td style={{ padding: rbacCellPadding, verticalAlign: "top" }}>
                              <div style={{ display: "grid", gridTemplateColumns: rbacRoleGridCols, gap: rbacRoleGap }}>
                                {rolesCatalog.map((role) => (
                                  <label
                                    key={`user-${user.id}-${role.code}`}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      border: "1px solid #2a355f",
                                      borderRadius: 8,
                                      padding: isRbacCompact ? "2px 6px" : "4px 8px"
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={editRoles.includes(role.code)}
                                      onChange={() =>
                                        setRoleEditsByUserId((prev) => ({
                                          ...prev,
                                          [key]: toggleRoleSelection(prev[key] ?? user.roles, role.code)
                                        }))
                                      }
                                    />{" "}
                                    {decodeHtmlEntities(role.code)}
                                  </label>
                                ))}
                              </div>
                            </td>
                            <td style={{ padding: rbacCellPadding, verticalAlign: "top" }}>
                              <div style={{ display: "grid", gap: 8 }}>
                                <button onClick={() => saveUserRoles(user.id)} disabled={saving || tokenMissing}>
                                  {saving ? "Saving..." : "Save Roles"}
                                </button>
                                <button
                                  onClick={() => archiveUserInClient(user.id)}
                                  disabled={saving || tokenMissing || !user.has_active_org_roles}
                                >
                                  Archive in Client
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
          </section>
        </>
      ) : null}
    </main>
  );
}
