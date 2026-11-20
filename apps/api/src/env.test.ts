// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { describe, expect, it } from "bun:test";
import { parsePositiveNumber } from "./env";

describe("parsePositiveNumber", () => {
  it("returns the fallback when unset or blank", () => {
    expect(parsePositiveNumber("X", undefined, 42)).toBe(42);
    expect(parsePositiveNumber("X", "  ", 42)).toBe(42);
  });

  it("parses valid positive numbers", () => {
    expect(parsePositiveNumber("X", "900", 1)).toBe(900);
    expect(parsePositiveNumber("X", "1.5", 1)).toBe(1.5);
  });

  it("throws on NaN, zero, negatives and infinity", () => {
    expect(() => parsePositiveNumber("X", "abc", 1)).toThrow("X");
    expect(() => parsePositiveNumber("X", "0", 1)).toThrow();
    expect(() => parsePositiveNumber("X", "-5", 1)).toThrow();
    expect(() => parsePositiveNumber("X", "Infinity", 1)).toThrow();
  });
});
