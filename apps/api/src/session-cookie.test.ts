// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { afterEach, describe, expect, it } from "bun:test";
import {
  clearSessionCookieHeader,
  isSecureCookieEnv,
  readSessionCookie,
  SESSION_COOKIE,
  sessionCookieHeader,
} from "./session-cookie";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

describe("sessionCookieHeader", () => {
  it("builds an httpOnly strict cookie without Secure in development", () => {
    process.env.NODE_ENV = "development";
    expect(sessionCookieHeader("a.b c", 900.7)).toBe(
      `${SESSION_COOKIE}=a.b%20c; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`,
    );
  });

  it("adds Secure in production and staging", () => {
    for (const env of ["production", "staging"]) {
      process.env.NODE_ENV = env;
      expect(sessionCookieHeader("tok", 60).endsWith("; Secure")).toBe(true);
      expect(clearSessionCookieHeader().endsWith("; Secure")).toBe(true);
    }
  });

  it("clamps negative max-age and clears with Max-Age=0", () => {
    process.env.NODE_ENV = "test";
    expect(sessionCookieHeader("tok", -5)).toContain("Max-Age=0");
    expect(clearSessionCookieHeader()).toBe(`${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
  });
});

describe("isSecureCookieEnv", () => {
  it("is true only for production-like environments", () => {
    expect(isSecureCookieEnv("production")).toBe(true);
    expect(isSecureCookieEnv("staging")).toBe(true);
    expect(isSecureCookieEnv("development")).toBe(false);
    expect(isSecureCookieEnv(undefined)).toBe(false);
  });
});

describe("readSessionCookie", () => {
  const withCookie = (cookie?: string) =>
    new Request("http://localhost/me", cookie ? { headers: { cookie } } : undefined);

  it("reads and decodes the session cookie among others", () => {
    expect(readSessionCookie(withCookie(`theme=dark; ${SESSION_COOKIE}=a.b%20c; other=1`))).toBe("a.b c");
  });

  it("returns null when absent, empty or malformed", () => {
    expect(readSessionCookie(withCookie())).toBeNull();
    expect(readSessionCookie(withCookie("theme=dark"))).toBeNull();
    expect(readSessionCookie(withCookie(`${SESSION_COOKIE}=`))).toBeNull();
    expect(readSessionCookie(withCookie(`${SESSION_COOKIE}=%E0%A4%A`))).toBeNull();
  });

  it("does not match cookies whose name only starts with the session name", () => {
    expect(readSessionCookie(withCookie(`${SESSION_COOKIE}_old=x`))).toBeNull();
  });
});
