// @ts-nocheck
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Settings2, Shield, Users } from "lucide-react";
import ClientsTab from "../components/admin/clients-tab";
import UsersTab from "../components/admin/users-tab";
import PageShell from "../components/layout/page-shell";
import PageSection from "../components/layout/page-section";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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
const demoToken = process.env.NEXT_PUBLIC_ENABLE_DEMO_AUTH === "1" ? process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "" : "";

const authHeaders = (token: string, json = false) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

const toUiError = (status: number, body: any, fallback: string): string => {
  const raw = String(body?.error ?? "").toLowerCase();
  if (status === 409 && raw.includes("already scoped to another client")) {
    return "This user already belongs to another client. Only system admins can assign users across multiple clients.";
  }
  if (status === 400 && raw.includes("invalid user payload")) {
    const fieldErrors = body?.details?.fieldErrors ?? {};
    const messages = Object.entries(fieldErrors)
      .flatMap(([field, values]) => (Array.isArray(values) ? values.map((value) => `${field}: ${String(value)}`) : []))
      .filter(Boolean);
    if (messages.length) return `Invalid user payload — ${messages.join(" | ")}`;
    return "Invalid user payload — check email format, display name, password length, and roles.";
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

// Cosmetic only: decodes the (unverified) JWT to decide which admin tabs to
// render. This is NOT a security boundary — every admin action is authorized
// server-side (see isSystemAdmin / hasOrgRole checks in apps/api/src/index.ts).
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
  const roleGridCols = isRbacCompact ? "grid-cols-3" : "grid-cols-2";

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
    if (!selectedClientId && data.length) setSelectedClientId(data[0].id);
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
    for (const user of users) nextEdits[String(user.id)] = [...(user.roles ?? [])];
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
    if (storedDensity === "compact" || storedDensity === "comfortable") setRbacDensity(storedDensity);
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
      const timeout = setTimeout(() => {
        if (typeof window !== "undefined") window.location.href = "/clients";
      }, 900);
      return () => clearTimeout(timeout);
    }

    void Promise.all([loadClients(), loadRoles()]);
  }, [authToken, hasAdminAccess]);

  useEffect(() => {
    if (selectedClientId && authToken && hasAdminAccess) {
      void loadOrgUsers(selectedClientId);
    }
  }, [selectedClientId, authToken, hasAdminAccess]);

  if (!mounted) {
    return (
      <PageShell>
        <PageSection title="Admin workspace" eyebrow="Admin" description="Loading client and access controls.">
          <p className="text-sm text-foreground">Preparing administrative tools…</p>
        </PageSection>
      </PageShell>
    );
  }

  if (tokenMissing) {
    return (
      <PageShell>
        <PageSection title="Admin workspace" eyebrow="Admin" description="Redirecting to login.">
          <p className="text-sm text-foreground">You need an authenticated admin session to continue.</p>
        </PageSection>
      </PageShell>
    );
  }

  const toggleRoleSelection = (roles: string[], roleCode: string): string[] => {
    if (roles.includes(roleCode)) return roles.filter((role) => role !== roleCode);
    return [...roles, roleCode];
  };

  const updateRbacDensity = (density: "comfortable" | "compact") => {
    setRbacDensity(density);
    if (typeof window !== "undefined") window.sessionStorage.setItem("audit_fitsm_rbac_density", density);
  };

  const createOrgUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

    const email = newUserEmail.trim();
    const displayName = newUserDisplayName.trim();
    const password = newUserPassword;
    if (!selectedClientId) return setMessage("Select a client first.");
    if (!email || !email.includes("@")) return setMessage("Enter a valid email address.");
    if (displayName.length < 2) return setMessage("Display name must be at least 2 characters.");
    if (password.length < 8) return setMessage("Temporary password must be at least 8 characters.");
    if (newUserRoles.length === 0) return setMessage("Select at least one role.");

    setIsCreatingUser(true);
    try {
      const res = await fetch(`${apiUrl}/orgs/${selectedClientId}/users`, {
        method: "POST",
        headers: authHeaders(authToken, true),
        body: JSON.stringify({ email, password, displayName, roles: newUserRoles })
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
    if (!selectedClientId) return setMessage("Select a client first.");

    const key = String(userId);
    const roles = roleEditsByUserId[key] ?? [];
    if (roles.length === 0) return setMessage("At least one role is required. Use Archive in Client to remove all roles.");

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
    if (!selectedClientId) return setMessage("Select a client first.");

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

  const messageTone = {
    info: "border-sky-500/25 bg-sky-500/10 text-sky-100",
    success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100",
    warning: "border-amber-500/25 bg-amber-500/10 text-amber-100",
    error: "border-rose-500/25 bg-rose-500/10 text-rose-100"
  }[messageVariant];

  return (
    <PageShell>
      <PageSection
        title="Admin workspace"
        eyebrow="Administration"
        description="Manage clients and organization-level access in two clear lanes: client setup and role assignment."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="bg-slate-950/45">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-sky-200"><Shield className="size-4" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Admin access</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{hasAdminAccess ? "Granted" : "Checking"}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-950/45">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-sky-200"><Settings2 className="size-4" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Clients</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{clients.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-950/45">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-sky-200"><Users className="size-4" /></span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">Users in selected client</p>
                <p className="mt-2 text-lg font-semibold text-foreground">{orgUsers.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {message ? <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${messageTone}`}>{message}</div> : null}
      </PageSection>

      {!tokenMissing && hasAdminAccess ? (
        <PageSection
          title="Administrative tasks"
          eyebrow="Work areas"
          description="Use tabs to switch between client setup and per-client RBAC without mixing the workflows."
        >
          <Tabs defaultValue="clients" className="w-full">
            <TabsList>
              <TabsTrigger value="clients">Clients</TabsTrigger>
              <TabsTrigger value="users">Users & roles</TabsTrigger>
            </TabsList>

            <TabsContent value="clients">
              <ClientsTab createClient={createClient} newClientName={newClientName} setNewClientName={setNewClientName} isCreatingClient={isCreatingClient} clients={clients} selectedClientId={selectedClientId} setSelectedClientId={setSelectedClientId} />
            </TabsContent>

            <TabsContent value="users">
              <UsersTab
                clientControls={{ clients, selectedClientId, setSelectedClientId, rbacDensity, updateRbacDensity, roleGridCols }}
                createUserForm={{
                  onSubmit: createOrgUser,
                  email: newUserEmail,
                  setEmail: setNewUserEmail,
                  displayName: newUserDisplayName,
                  setDisplayName: setNewUserDisplayName,
                  password: newUserPassword,
                  setPassword: setNewUserPassword,
                  rolesCatalog,
                  selectedRoles: newUserRoles,
                  setSelectedRoles: setNewUserRoles,
                  toggleRoleSelection,
                  isCreating: isCreatingUser
                }}
                userTable={{
                  orgUsers,
                  roleEditsByUserId,
                  savingRolesByUserId,
                  saveUserRoles,
                  archiveUserInClient,
                  tokenMissing,
                  setRoleEditsByUserId
                }}
              />
            </TabsContent>
          </Tabs>
        </PageSection>
      ) : null}
    </PageShell>
  );
}
