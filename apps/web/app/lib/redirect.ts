// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

const PLACEHOLDER_ORIGIN = "http://relative.invalid";

/**
 * Returns `raw` when it is a safe same-site relative path ("/..."), otherwise "/".
 * Rejects protocol-relative ("//host"), backslash tricks ("/\\host"), absolute URLs,
 * control characters and auth pages that would loop or sign the user out.
 */
export const safeNextPath = (raw: string | null | undefined): string => {
  if (!raw) return "/";
  const value = String(raw);
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return "/";

  let parsed: URL;
  try {
    parsed = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return "/";
  }
  if (parsed.origin !== PLACEHOLDER_ORIGIN) return "/";
  if (parsed.pathname === "/login" || parsed.pathname === "/logout") return "/";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
};

/** Builds the login URL that brings the user back to `currentPath` afterwards. */
export const loginUrlFor = (currentPath: string | null | undefined): string => {
  const next = safeNextPath(currentPath);
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
};
