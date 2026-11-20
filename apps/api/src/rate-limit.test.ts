// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { afterEach, describe, expect, it } from "bun:test";
import {
  checkProtectedRateLimit,
  checkRateLimit,
  clientAddress,
  DEFAULT_MAX_BUCKETS,
  normalizeRoutePath,
  rateLimitBucketCount,
  resetRateLimits,
  setRateLimitMaxBuckets,
} from "./rate-limit";

afterEach(() => {
  setRateLimitMaxBuckets(DEFAULT_MAX_BUCKETS);
  resetRateLimits();
});

describe("checkRateLimit", () => {
  it("blocks once the window is exhausted", () => {
    resetRateLimits();
    expect(checkRateLimit("login-test", 60_000, 2).allowed).toBe(true);
    expect(checkRateLimit("login-test", 60_000, 2).allowed).toBe(true);
    const blocked = checkRateLimit("login-test", 60_000, 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("caps the number of buckets by dropping the oldest", () => {
    resetRateLimits();
    setRateLimitMaxBuckets(3);
    for (const key of ["a", "b", "c", "d", "e"]) {
      checkRateLimit(key, 60_000, 1);
    }
    expect(rateLimitBucketCount()).toBe(3);
    // "a" was evicted, so it gets a fresh bucket instead of being limited.
    expect(checkRateLimit("a", 60_000, 1).allowed).toBe(true);
    // "e" is still tracked and limited.
    expect(checkRateLimit("e", 60_000, 1).allowed).toBe(false);
  });

  it("keeps protected (login) buckets when the general map is flooded", () => {
    resetRateLimits();
    setRateLimitMaxBuckets(3);
    expect(checkProtectedRateLimit("login-ip:1.2.3.4", 60_000, 1).allowed).toBe(true);
    for (let i = 0; i < 50; i += 1) {
      checkRateLimit(`1.2.3.4:GET:/junk${i}`, 60_000, 1);
    }
    expect(checkProtectedRateLimit("login-ip:1.2.3.4", 60_000, 1).allowed).toBe(false);
  });
});

describe("normalizeRoutePath", () => {
  it("replaces numeric segments with :id", () => {
    expect(normalizeRoutePath("/audits/12/assessments")).toBe("/audits/:id/assessments");
    expect(normalizeRoutePath("/audits/12/exports/345/download")).toBe("/audits/:id/exports/:id/download");
    expect(normalizeRoutePath("/orgs/7/users/9/roles")).toBe("/orgs/:id/users/:id/roles");
  });

  it("leaves non-numeric segments alone and trims trailing slashes", () => {
    expect(normalizeRoutePath("/auth/login")).toBe("/auth/login");
    expect(normalizeRoutePath("/clients/")).toBe("/clients");
    expect(normalizeRoutePath("/")).toBe("/");
    expect(normalizeRoutePath("/audits/12abc")).toBe("/audits/12abc");
  });
});

describe("clientAddress", () => {
  it("ignores X-Forwarded-For unless the proxy is trusted", () => {
    const request = new Request("http://localhost/auth/login", {
      headers: { "x-forwarded-for": "203.0.113.5" },
    });
    expect(clientAddress(request, null, false)).toBe("local");
    expect(clientAddress(request, null, true)).toBe("203.0.113.5");
  });

  it("uses the rightmost X-Forwarded-For hop with a trusted proxy", () => {
    const request = new Request("http://localhost/auth/login", {
      headers: { "x-forwarded-for": "1.2.3.4, 198.51.100.7 , 203.0.113.9" },
    });
    expect(clientAddress(request, null, true)).toBe("203.0.113.9");
  });

  it("skips empty trailing entries", () => {
    const request = new Request("http://localhost/auth/login", {
      headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9, " },
    });
    expect(clientAddress(request, null, true)).toBe("203.0.113.9");
  });

  it("uses the socket address when a proxy is not trusted", () => {
    const request = new Request("http://localhost/health");
    const server = { requestIP: () => ({ address: "10.1.1.8" }) };
    expect(clientAddress(request, server, false)).toBe("10.1.1.8");
  });
});
