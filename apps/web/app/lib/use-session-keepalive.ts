// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { useEffect } from "react";
import { apiFetch } from "./api";
import { type KeepaliveState, shouldRefreshOnTick, shouldRefreshOnVisible } from "./session-keepalive";

const TICK_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Keeps the 15-minute cookie session alive while the user is working:
 * POST /auth/refresh every 5 minutes while the tab is visible and the user was active
 * in the last 15 minutes, and on visibility regain when the session is close to expiry.
 */
export function useSessionKeepalive(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let lastActivityAt = Date.now();
    let lastRefreshAt = 0;
    let expiresAt: number | null = null;
    let inFlight = false;
    let stopped = false;

    const snapshot = (): KeepaliveState => ({
      now: Date.now(),
      visible: document.visibilityState === "visible",
      lastActivityAt,
      lastRefreshAt,
      expiresAt,
    });

    const refresh = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        const res = await apiFetch("/auth/refresh", { method: "POST" });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { expiresInSec?: unknown };
          lastRefreshAt = Date.now();
          const ttl = Number(body.expiresInSec);
          expiresAt = Number.isFinite(ttl) && ttl > 0 ? lastRefreshAt + ttl * 1000 : null;
        } else if (res.status === 401) {
          // Session is gone; the next authenticated request redirects to login.
          stopped = true;
        }
      } catch {
        // Network hiccup: try again on the next tick.
      } finally {
        inFlight = false;
      }
    };

    const markActive = () => {
      lastActivityAt = Date.now();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && shouldRefreshOnVisible(snapshot())) void refresh();
    };

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, markActive, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => {
      if (shouldRefreshOnTick(snapshot())) void refresh();
    }, TICK_MS);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, markActive, { capture: true });
    };
  }, [enabled]);
}
