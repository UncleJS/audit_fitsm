// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { describe, expect, it } from "bun:test";
import { type KeepaliveState, shouldRefreshOnTick, shouldRefreshOnVisible } from "./session-keepalive";

const MIN = 60 * 1000;
const base = (overrides: Partial<KeepaliveState> = {}): KeepaliveState => ({
  now: 100 * MIN,
  visible: true,
  lastActivityAt: 99 * MIN,
  lastRefreshAt: 94 * MIN,
  expiresAt: null,
  ...overrides,
});

describe("shouldRefreshOnTick", () => {
  it("refreshes an active, visible tab after the interval", () => {
    expect(shouldRefreshOnTick(base())).toBe(true);
  });

  it("waits until the interval has passed", () => {
    expect(shouldRefreshOnTick(base({ lastRefreshAt: 97 * MIN }))).toBe(false);
  });

  it("skips hidden tabs", () => {
    expect(shouldRefreshOnTick(base({ visible: false }))).toBe(false);
  });

  it("skips idle users", () => {
    expect(shouldRefreshOnTick(base({ lastActivityAt: 80 * MIN }))).toBe(false);
  });

  it("refreshes early when expiry is near", () => {
    expect(shouldRefreshOnTick(base({ lastRefreshAt: 99 * MIN, expiresAt: 102 * MIN }))).toBe(true);
  });
});

describe("shouldRefreshOnVisible", () => {
  it("refreshes when the session is close to expiry", () => {
    expect(shouldRefreshOnVisible(base({ expiresAt: 103 * MIN }))).toBe(true);
  });

  it("does not refresh when plenty of time is left", () => {
    expect(shouldRefreshOnVisible(base({ expiresAt: 112 * MIN }))).toBe(false);
  });

  it("does not refresh for idle users", () => {
    expect(shouldRefreshOnVisible(base({ lastActivityAt: 70 * MIN, expiresAt: 101 * MIN }))).toBe(false);
  });
});
