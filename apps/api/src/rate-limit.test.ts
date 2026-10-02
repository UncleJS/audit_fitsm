import { describe, expect, it } from "bun:test";
import { checkRateLimit, clientAddress, resetRateLimits } from "./rate-limit";

describe("checkRateLimit", () => {
  it("blocks once the window is exhausted", () => {
    resetRateLimits();
    expect(checkRateLimit("login-test", 60_000, 2).allowed).toBe(true);
    expect(checkRateLimit("login-test", 60_000, 2).allowed).toBe(true);
    const blocked = checkRateLimit("login-test", 60_000, 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
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

  it("uses the socket address when a proxy is not trusted", () => {
    const request = new Request("http://localhost/health");
    const server = { requestIP: () => ({ address: "10.1.1.8" }) };
    expect(clientAddress(request, server, false)).toBe("10.1.1.8");
  });
});
