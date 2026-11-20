// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { describe, expect, it } from "bun:test";
import { formatDateOnly, formatLocalTimestamp, isValidDateOnly, localDateString } from "./date-format";

describe("formatDateOnly", () => {
  it("keeps a date-only value", () => {
    expect(formatDateOnly("2026-10-02")).toBe("2026-10-02");
  });

  it("trims a timestamp down to the date", () => {
    expect(formatDateOnly("2026-10-02 18:04:01")).toBe("2026-10-02");
  });

  it("returns an empty string for missing values", () => {
    expect(formatDateOnly(null)).toBe("");
  });
});

describe("formatLocalTimestamp", () => {
  it("returns an em dash for missing values", () => {
    expect(formatLocalTimestamp("")).toBe("—");
  });

  it("formats a UTC timestamp in local time", () => {
    const formatted = formatLocalTimestamp("2026-10-02 18:04:01");
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("treats a Z suffix and a missing offset the same", () => {
    expect(formatLocalTimestamp("2026-10-02T18:04:01Z")).toBe(formatLocalTimestamp("2026-10-02 18:04:01"));
  });

  it("accepts a ±HH:MM offset", () => {
    expect(formatLocalTimestamp("2026-10-02T20:04:01+02:00")).toBe(formatLocalTimestamp("2026-10-02T18:04:01Z"));
    expect(formatLocalTimestamp("2026-10-02T13:04:01-05:00")).toBe(formatLocalTimestamp("2026-10-02T18:04:01Z"));
  });

  it("accepts a ±HHMM offset", () => {
    expect(formatLocalTimestamp("2026-10-02T20:04:01+0200")).toBe(formatLocalTimestamp("2026-10-02T18:04:01Z"));
    expect(formatLocalTimestamp("2026-10-02T13:04:01-0500")).toBe(formatLocalTimestamp("2026-10-02T18:04:01Z"));
  });

  it("returns unparseable input unchanged", () => {
    expect(formatLocalTimestamp("not a date")).toBe("not a date");
  });
});

describe("localDateString", () => {
  it("uses the local calendar date", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59, 0))).toBe("2026-01-05");
    expect(localDateString(new Date(2026, 11, 31, 0, 0, 1))).toBe("2026-12-31");
  });
});

describe("isValidDateOnly", () => {
  it("accepts real yyyy-MM-dd dates", () => {
    expect(isValidDateOnly("2026-11-08")).toBe(true);
    expect(isValidDateOnly("2024-02-29")).toBe(true);
  });

  it("rejects partial, malformed or impossible dates", () => {
    expect(isValidDateOnly("2026-11")).toBe(false);
    expect(isValidDateOnly("11/08/2026")).toBe(false);
    expect(isValidDateOnly("2026-02-30")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
  });
});
