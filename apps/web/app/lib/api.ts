export type MeResponse = {
  sub: number;
  email: string;
  name: string;
  orgRoles: Record<string, string[]>;
  tokenVersion: number;
};

export const apiBaseUrl = (): string => {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:1261`;
  }
  return "http://127.0.0.1:1261";
};

const redirectToLogin = (): void => {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/login") return;
  window.location.assign("/login");
};

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    headers.set("x-audit-fitsm", "1");
  }
  if (init.body && !headers.has("content-type") && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: init.cache ?? "no-store",
  });

  if (response.status === 401 && !path.startsWith("/auth/login")) {
    redirectToLogin();
  }

  return response;
}

export async function ensureSession(): Promise<MeResponse | null> {
  const response = await fetch(`${apiBaseUrl()}/me`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as MeResponse;
}

export async function downloadAuthenticated(path: string, filename: string): Promise<void> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const hasAdminRole = (me: MeResponse | null): boolean => {
  if (!me) return false;
  return Object.values(me.orgRoles)
    .flat()
    .some((role) => role === "org_admin" || role === "system_admin");
};
