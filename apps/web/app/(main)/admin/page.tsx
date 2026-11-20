// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { RotateCw, Settings2, Shield, Users } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ClientsTab from "../../components/admin/clients-tab";
import UsersTab from "../../components/admin/users-tab";
import PageSection from "../../components/layout/page-section";
import PageShell from "../../components/layout/page-shell";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import {
  apiErrorMessage,
  apiFetch,
  ensureSession,
  hasAdminRole,
  isAbortError,
  type MeResponse,
  NETWORK_ERROR_MESSAGE,
  redirectToLogin,
} from "../../lib/api";
import { decodeHtmlEntities } from "../../lib/text-format";

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

const toUiError = (
  status: number,
  body: { error?: string; details?: { fieldErrors?: Record<string, unknown> } },
  fallback: string,
): string => {
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

export default function AdminPage() {
  const [mounted, setMounted] = useState(false);
  const [bootError, setBootError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [me, setMe] = useState<MeResponse | null>(null);
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
  const usersControllerRef = useRef<AbortController | null>(null);

  const hasAdminAccess = useMemo(() => hasAdminRole(me), [me]);
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

  const loadClients = async (): Promise<boolean> => {
    try {
      const res = await apiFetch(`/clients`);
      if (!res.ok) {
        setClients([]);
        if (res.status !== 401) setLoadError(await apiErrorMessage(res, "Unable to load clients."));
        return false;
      }

      const data = (await res.json()) as ClientRow[];
      setClients(data);
      setSelectedClientId((current) =>
        current !== null && data.some((client) => client.id === current) ? current : (data[0]?.id ?? null),
      );
      return true;
    } catch {
      setLoadError(`Unable to load clients. ${NETWORK_ERROR_MESSAGE}`);
      return false;
    }
  };

  const loadRoles = async (): Promise<boolean> => {
    try {
      const res = await apiFetch(`/roles`);
      if (!res.ok) {
        setRolesCatalog([]);
        if (res.status !== 401) setLoadError(await apiErrorMessage(res, "Unable to load roles."));
        return false;
      }
      setRolesCatalog((await res.json()) as RoleRow[]);
      return true;
    } catch {
      setLoadError(`Unable to load roles. ${NETWORK_ERROR_MESSAGE}`);
      return false;
    }
  };

  const loadAdminData = async () => {
    setLoadError("");
    await Promise.all([loadClients(), loadRoles()]);
  };

  /** Loads users for a client; a newer call aborts older ones so a stale client's roles never win. */
  const loadOrgUsers = async (clientId: number) => {
    usersControllerRef.current?.abort();
    const controller = new AbortController();
    usersControllerRef.current = controller;
    const { signal } = controller;

    try {
      const res = await apiFetch(`/orgs/${clientId}/users`, { signal });
      if (signal.aborted) return;
      if (!res.ok) {
        setOrgUsers([]);
        setRoleEditsByUserId({});
        if (res.status !== 401) setMessage(await apiErrorMessage(res, "Unable to load users for this client."));
        return;
      }

      const users = (await res.json()) as OrgUserRow[];
      if (signal.aborted) return;
      setOrgUsers(users);
      const nextEdits: Record<string, string[]> = {};
      for (const user of users) nextEdits[String(user.id)] = [...(user.roles ?? [])];
      setRoleEditsByUserId(nextEdits);
    } catch (error) {
      if (signal.aborted || isAbortError(error)) return;
      setOrgUsers([]);
      setRoleEditsByUserId({});
      setMessage(`Unable to load users for this client. ${NETWORK_ERROR_MESSAGE}`);
    }
  };

  const boot = async () => {
    setBootError("");
    setMounted(false);
    try {
      const session = await ensureSession();
      if (!session) {
        redirectToLogin();
        return;
      }
      setMe(session);
    } catch {
      setBootError(`Administrative tools could not be loaded. ${NETWORK_ERROR_MESSAGE}`);
    }
    setMounted(true);
  };

  useEffect(() => {
    try {
      const storedDensity = window.sessionStorage.getItem("audit_fitsm_rbac_density");
      if (storedDensity === "compact" || storedDensity === "comfortable") setRbacDensity(storedDensity);
    } catch {
      // storage unavailable
    }
    void boot();
  }, []);

  useEffect(() => {
    if (!me) return;

    if (!hasAdminAccess) {
      setMessage("Admin role required. Redirecting to Clients page...");
      const timeout = setTimeout(() => {
        window.location.href = "/";
      }, 900);
      return () => clearTimeout(timeout);
    }

    void loadAdminData();
  }, [me, hasAdminAccess]);

  useEffect(() => {
    if (!selectedClientId || !hasAdminAccess) return;
    // Drop the previous client's users and role edits immediately.
    setOrgUsers([]);
    setRoleEditsByUserId({});
    void loadOrgUsers(selectedClientId);
    return () => usersControllerRef.current?.abort();
  }, [selectedClientId, hasAdminAccess]);

  if (!mounted) {
    return (
      <PageShell>
        <PageSection
          headingLevel={1}
          title="Admin workspace"
          eyebrow="Admin"
          description="Loading client and access controls."
        >
          <p className="text-sm text-muted">Preparing administrative tools…</p>
        </PageSection>
      </PageShell>
    );
  }

  if (bootError) {
    return (
      <PageShell>
        <PageSection
          headingLevel={1}
          title="Admin workspace"
          eyebrow="Admin"
          description="Administrative tools could not be loaded."
        >
          <p role="alert" className="text-sm text-danger-fg">
            {bootError}
          </p>
          <Button variant="secondary" onClick={() => void boot()}>
            <RotateCw className="size-4" /> Retry
          </Button>
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
    if (!email.includes("@")) return setMessage("Enter a valid email address.");
    if (displayName.length < 2) return setMessage("Display name must be at least 2 characters.");
    if (password.length < 8) return setMessage("Temporary password must be at least 8 characters.");
    if (newUserRoles.length === 0) return setMessage("Select at least one role.");

    setIsCreatingUser(true);
    try {
      const res = await apiFetch(`/orgs/${selectedClientId}/users`, {
        method: "POST",
        body: JSON.stringify({ email, password, displayName, roles: newUserRoles }),
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
    } catch {
      setMessage(`User creation failed. ${NETWORK_ERROR_MESSAGE}`);
    } finally {
      setIsCreatingUser(false);
    }
  };

  const saveUserRoles = async (userId: number) => {
    setMessage("");
    if (!selectedClientId) return setMessage("Select a client first.");

    const key = String(userId);
    const roles = roleEditsByUserId[key] ?? [];
    if (roles.length === 0)
      return setMessage("At least one role is required. Use Archive in Client to remove all roles.");

    setSavingRolesByUserId((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await apiFetch(`/orgs/${selectedClientId}/users/${userId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roles }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(toUiError(res.status, body, "Role update failed."));
        return;
      }

      setMessage(`Roles updated for user ${userId}.`);
      await loadOrgUsers(selectedClientId);
    } catch {
      setMessage(`Role update failed. ${NETWORK_ERROR_MESSAGE}`);
    } finally {
      setSavingRolesByUserId((prev) => ({ ...prev, [key]: false }));
    }
  };

  const archiveUserInClient = async (userId: number) => {
    setMessage("");
    if (!selectedClientId) return setMessage("Select a client first.");
    if (!window.confirm("Archive this user in the selected client? Their roles in this client will be removed."))
      return;

    const key = String(userId);
    setSavingRolesByUserId((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await apiFetch(`/orgs/${selectedClientId}/users/${userId}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roles: [] }),
      });
      if (!res.ok) {
        setMessage(await apiErrorMessage(res, "User archive failed."));
        return;
      }
      setMessage(`User ${userId} archived in selected client.`);
      await loadOrgUsers(selectedClientId);
    } catch {
      setMessage(`User archive failed. ${NETWORK_ERROR_MESSAGE}`);
    } finally {
      setSavingRolesByUserId((prev) => ({ ...prev, [key]: false }));
    }
  };

  const createClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsCreatingClient(true);
    try {
      const res = await apiFetch(`/clients`, {
        method: "POST",
        body: JSON.stringify({ name: newClientName }),
      });
      if (!res.ok) {
        setMessage(await apiErrorMessage(res, "Client creation failed."));
        return;
      }

      const created = await res.json();
      setNewClientName("");
      setMessage(`Client '${decodeHtmlEntities(created.name)}' created.`);
      await loadClients();
      setSelectedClientId(Number(created.id));
    } catch {
      setMessage(`Client creation failed. ${NETWORK_ERROR_MESSAGE}`);
    } finally {
      setIsCreatingClient(false);
    }
  };

  const messageTone = {
    info: "border-primary/25 bg-primary/10 text-accent",
    success: "border-success/25 bg-success/10 text-success-fg",
    warning: "border-warning/25 bg-warning/10 text-warning-fg",
    error: "border-danger/25 bg-danger/10 text-danger-fg",
  }[messageVariant];

  return (
    <PageShell>
      <PageSection
        headingLevel={1}
        title="Admin workspace"
        eyebrow="Administration"
        description="Manage clients and organization-level access in two clear lanes: client setup and role assignment."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="bg-surface/45">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="rounded-2xl border border-border bg-surface-2/80 p-3 text-accent">
                <Shield className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Admin access</p>
                <p className="mt-2 text-lg font-semibold text-fg">{hasAdminAccess ? "Granted" : "Not granted"}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-surface/45">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="rounded-2xl border border-border bg-surface-2/80 p-3 text-accent">
                <Settings2 className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Clients</p>
                <p className="mt-2 text-lg font-semibold text-fg">{clients.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-surface/45">
            <CardContent className="flex items-center gap-4 p-4">
              <span className="rounded-2xl border border-border bg-surface-2/80 p-3 text-accent">
                <Users className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Users in selected client</p>
                <p className="mt-2 text-lg font-semibold text-fg">{orgUsers.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {message ? (
          <div role="status" className={`rounded-2xl border px-4 py-3 text-sm font-medium ${messageTone}`}>
            {message}
          </div>
        ) : null}

        {loadError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger-fg"
          >
            <span>{loadError}</span>
            <Button size="sm" variant="secondary" onClick={() => void loadAdminData()}>
              <RotateCw className="size-4" /> Retry
            </Button>
          </div>
        ) : null}
      </PageSection>

      {hasAdminAccess ? (
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
              <ClientsTab
                createClient={createClient}
                newClientName={newClientName}
                setNewClientName={setNewClientName}
                isCreatingClient={isCreatingClient}
                clients={clients}
                selectedClientId={selectedClientId}
                setSelectedClientId={setSelectedClientId}
              />
            </TabsContent>

            <TabsContent value="users">
              <UsersTab
                clientControls={{
                  clients,
                  selectedClientId,
                  setSelectedClientId,
                  rbacDensity,
                  updateRbacDensity,
                  roleGridCols,
                }}
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
                  isCreating: isCreatingUser,
                }}
                userTable={{
                  orgUsers,
                  roleEditsByUserId,
                  savingRolesByUserId,
                  saveUserRoles,
                  archiveUserInClient,
                  setRoleEditsByUserId,
                }}
              />
            </TabsContent>
          </Tabs>
        </PageSection>
      ) : null}
    </PageShell>
  );
}
