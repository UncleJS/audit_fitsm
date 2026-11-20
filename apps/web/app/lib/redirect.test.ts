// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { describe, expect, it } from "bun:test";
import { loginUrlFor, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("keeps relative paths with search and hash", () => {
    expect(safeNextPath("/audits/12?tab=x#top")).toBe("/audits/12?tab=x#top");
  });

  it("defaults to / for missing values", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });

  it("rejects open redirects", () => {
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
    expect(safeNextPath("/\tevil")).toBe("/");
    expect(safeNextPath("audits/1")).toBe("/");
  });

  it("does not bounce back to auth pages", () => {
    expect(safeNextPath("/login?next=/x")).toBe("/");
    expect(safeNextPath("/logout")).toBe("/");
  });
});

describe("loginUrlFor", () => {
  it("encodes the return path", () => {
    expect(loginUrlFor("/audits/3?x=1")).toBe("/login?next=%2Faudits%2F3%3Fx%3D1");
  });

  it("omits next for the root", () => {
    expect(loginUrlFor("/")).toBe("/login");
  });
});
