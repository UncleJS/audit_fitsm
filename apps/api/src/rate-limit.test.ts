// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { afterEach, describe, expect, it } from "bun:test";
import {
  checkLoginEmailRateLimit,
  checkLoginIpRateLimit,
  checkProtectedRateLimit,
  checkRateLimit,
  checkRequestRateLimit,
  clientAddress,
  DEFAULT_MAX_BUCKETS,
  normalizeRoutePath,
  rateLimitBucketCount,
  recordLoginSuccess,
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

describe("checkRequestRateLimit", () => {
  const limits = { windowMs: 60_000, maxRequests: 100, maxRequestsPerIp: 5 };

  it("trips the IP-wide cap across different routes", () => {
    for (let i = 0; i < 5; i += 1) {
      expect(checkRequestRateLimit("198.51.100.1", "GET", `/route${i}`, limits).allowed).toBe(true);
    }
    const blocked = checkRequestRateLimit("198.51.100.1", "GET", "/another", limits);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    // Other clients are unaffected.
    expect(checkRequestRateLimit("198.51.100.2", "GET", "/route0", limits).allowed).toBe(true);
  });

  it("still applies the per-route cap below the IP-wide cap", () => {
    const routeLimits = { windowMs: 60_000, maxRequests: 2, maxRequestsPerIp: 100 };
    expect(checkRequestRateLimit("198.51.100.3", "GET", "/clients", routeLimits).allowed).toBe(true);
    expect(checkRequestRateLimit("198.51.100.3", "GET", "/clients", routeLimits).allowed).toBe(true);
    expect(checkRequestRateLimit("198.51.100.3", "GET", "/clients", routeLimits).allowed).toBe(false);
    expect(checkRequestRateLimit("198.51.100.3", "POST", "/clients", routeLimits).allowed).toBe(true);
  });
});

describe("login rate limits", () => {
  const limits = { windowMs: 60_000, maxRequestsPerIp: 1000, maxRequestsPerEmailIp: 3, maxRequestsPerEmailGlobal: 10 };
  const victim = "victim@example.com";

  it("does not lock the victim out when an attacker fails from another IP", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(checkLoginEmailRateLimit(victim, "203.0.113.66", limits).allowed).toBe(true);
    }
    expect(checkLoginEmailRateLimit(victim, "203.0.113.66", limits).allowed).toBe(false);
    // Different casing and whitespace map to the same bucket.
    expect(checkLoginEmailRateLimit("  Victim@Example.COM ", "203.0.113.66", limits).allowed).toBe(false);
    expect(checkLoginEmailRateLimit(victim, "192.0.2.10", limits).allowed).toBe(true);
  });

  it("trips the global per-email cap across many IPs", () => {
    for (let i = 0; i < 10; i += 1) {
      expect(checkLoginEmailRateLimit(victim, `203.0.113.${i}`, limits).allowed).toBe(true);
    }
    const blocked = checkLoginEmailRateLimit(victim, "192.0.2.10", limits);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(checkLoginEmailRateLimit("other@example.com", "192.0.2.10", limits).allowed).toBe(true);
  });

  it("resets the email+IP bucket after a successful login", () => {
    for (let i = 0; i < 2; i += 1) {
      expect(checkLoginEmailRateLimit(victim, "192.0.2.10", limits).allowed).toBe(true);
    }
    // Third attempt succeeds.
    expect(checkLoginEmailRateLimit(victim, "192.0.2.10", limits).allowed).toBe(true);
    recordLoginSuccess(victim, "192.0.2.10");
    for (let i = 0; i < 3; i += 1) {
      expect(checkLoginEmailRateLimit(victim, "192.0.2.10", limits).allowed).toBe(true);
    }
    expect(checkLoginEmailRateLimit(victim, "192.0.2.10", limits).allowed).toBe(false);
  });

  it("does not count successful logins against the global email cap", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(checkLoginEmailRateLimit(victim, `203.0.113.${i}`, limits).allowed).toBe(true);
      recordLoginSuccess(victim, `203.0.113.${i}`);
    }
    expect(checkLoginEmailRateLimit(victim, "192.0.2.10", limits).allowed).toBe(true);
  });

  it("keeps the per-IP login bucket counting every attempt", () => {
    const ipLimits = { ...limits, maxRequestsPerIp: 2 };
    expect(checkLoginIpRateLimit("192.0.2.20", ipLimits).allowed).toBe(true);
    expect(checkLoginIpRateLimit("192.0.2.20", ipLimits).allowed).toBe(true);
    expect(checkLoginIpRateLimit("192.0.2.20", ipLimits).allowed).toBe(false);
  });

  it("keeps login email buckets when the general map is flooded", () => {
    setRateLimitMaxBuckets(3);
    for (let i = 0; i < 3; i += 1) checkLoginEmailRateLimit(victim, "203.0.113.66", limits);
    for (let i = 0; i < 50; i += 1) checkRateLimit(`203.0.113.66:GET:/junk${i}`, 60_000, 1);
    expect(checkLoginEmailRateLimit(victim, "203.0.113.66", limits).allowed).toBe(false);
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
