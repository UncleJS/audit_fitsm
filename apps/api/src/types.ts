// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
export type AuthVia = "cookie";

export type AuthPayload = {
  sub: number;
  email: string;
  name: string;
  orgRoles: Record<string, string[]>;
  tokenVersion: number;
};

export type SessionAuth = {
  auth: AuthPayload | null;
  authVia: AuthVia | null;
  /** JWT `exp` (seconds since epoch) of the current session, or null when anonymous. */
  sessionExp: number | null;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec?: number;
};
