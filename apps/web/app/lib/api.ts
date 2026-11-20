// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { loginUrlFor } from "./redirect";

export type MeResponse = {
  sub: number;
  email: string;
  name: string;
  orgRoles: Record<string, string[]>;
  /** ISO-8601 UTC ("...Z") expiry of the current session cookie. */
  sessionExpiresAt?: string;
};

export const apiBaseUrl = (): string => {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:1261`;
  }
  return "http://127.0.0.1:1261";
};

let redirectingToLogin = false;

/** Sends the browser to /login, remembering the current page as `next`. */
export const redirectToLogin = (): void => {
  if (typeof window === "undefined" || redirectingToLogin) return;
  const { pathname, search } = window.location;
  if (pathname === "/login") return;
  redirectingToLogin = true;
  window.location.assign(loginUrlFor(`${pathname}${search}`));
};

/** Auth endpoints answer 401 as part of their normal contract; they never trigger a redirect. */
const isAuthEndpoint = (path: string): boolean => path.startsWith("/auth/");

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

  if (response.status === 401 && !isAuthEndpoint(path)) {
    redirectToLogin();
  }

  return response;
}

/** Reads `{ error }` from a failed JSON response, falling back to `fallback`. */
export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof body?.error === "string" && body.error ? body.error : fallback;
}

export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException ? error.name === "AbortError" : (error as { name?: string })?.name === "AbortError";

export const NETWORK_ERROR_MESSAGE = "Unable to reach the server. Check your connection and try again.";

export async function ensureSession(): Promise<MeResponse | null> {
  const response = await fetch(`${apiBaseUrl()}/me`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as MeResponse;
}

/** Saves a blob through a temporary anchor; the object URL is revoked after the click is handled. */
export const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * Downloads an authenticated API resource as a file.
 * Throws an Error with a user-facing message on HTTP or network failure.
 */
export async function downloadFile(path: string, filename: string, fallbackError = "Download failed."): Promise<void> {
  let response: Response;
  try {
    response = await apiFetch(path);
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, fallbackError));
  }
  saveBlob(await response.blob(), filename);
}

export const hasAdminRole = (me: MeResponse | null): boolean => {
  if (!me) return false;
  return Object.values(me.orgRoles)
    .flat()
    .some((role) => role === "org_admin" || role === "system_admin");
};
