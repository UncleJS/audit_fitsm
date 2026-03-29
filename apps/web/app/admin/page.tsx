// @ts-nocheck
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

  return (
    <main className="container grid">
      <section className="card">
        <h1>Admin</h1>
        <p>Manage users, roles, and client-level access.</p>
        {message ? <p>{message}</p> : null}
      </section>

      {!tokenMissing && hasAdminAccess ? (
        <section className="card">
          <h2>RBAC Administration (Selected Client)</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <label htmlFor="admin-client-select">Client:</label>
            <select
              id="admin-client-select"
              value={selectedClientId ?? ""}
              onChange={(event) => setSelectedClientId(Number(event.target.value))}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
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
                      {role.code}
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
                            <td style={{ padding: rbacCellPadding, verticalAlign: "top", fontWeight: 600 }}>{user.display_name}</td>
                            <td style={{ padding: rbacCellPadding, verticalAlign: "top", color: "#c8d4ff" }}>{user.email}</td>
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
                                    {role.code}
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
      ) : null}
    </main>
  );
}
