// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
export const SESSION_COOKIE = "audit_fitsm_session";

/** Production and staging are served over HTTPS, so the session cookie must never travel in clear text there. */
export const isSecureCookieEnv = (nodeEnv: string | undefined = process.env.NODE_ENV): boolean =>
  nodeEnv === "production" || nodeEnv === "staging";

const secureAttribute = (): string => (isSecureCookieEnv() ? "; Secure" : "");

export const sessionCookieHeader = (token: string, maxAgeSec: number): string =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}${secureAttribute()}`;

export const clearSessionCookieHeader = (): string =>
  `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureAttribute()}`;

export const readSessionCookie = (request: Request): string | null => {
  const raw = request.headers.get("cookie");
  if (!raw) return null;

  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq);
    if (name !== SESSION_COOKIE) continue;
    const value = trimmed.slice(eq + 1);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
};
