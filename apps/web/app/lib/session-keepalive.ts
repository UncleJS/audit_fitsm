// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

export const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const SESSION_ACTIVITY_WINDOW_MS = 15 * 60 * 1000;
export const SESSION_NEAR_EXPIRY_MS = 5 * 60 * 1000;

export type KeepaliveState = {
  now: number;
  visible: boolean;
  lastActivityAt: number;
  /** 0 when no refresh has happened yet in this tab. */
  lastRefreshAt: number;
  /** Epoch ms when the session is known to expire, or null when unknown. */
  expiresAt: number | null;
};

/** Periodic check: refresh every interval while the tab is visible and the user was recently active. */
export const shouldRefreshOnTick = (state: KeepaliveState): boolean => {
  if (!state.visible) return false;
  if (state.now - state.lastActivityAt >= SESSION_ACTIVITY_WINDOW_MS) return false;
  if (state.expiresAt !== null && state.expiresAt - state.now < SESSION_NEAR_EXPIRY_MS) return true;
  return state.now - state.lastRefreshAt >= SESSION_REFRESH_INTERVAL_MS;
};

/** Visibility regained: refresh only when the session is near (or past) expiry, or its expiry is unknown and stale. */
export const shouldRefreshOnVisible = (state: KeepaliveState): boolean => {
  if (state.now - state.lastActivityAt >= SESSION_ACTIVITY_WINDOW_MS) return false;
  if (state.expiresAt !== null) return state.expiresAt - state.now < SESSION_NEAR_EXPIRY_MS;
  return state.now - state.lastRefreshAt >= SESSION_REFRESH_INTERVAL_MS;
};
