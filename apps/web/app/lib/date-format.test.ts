import { describe, expect, it } from "bun:test";
import { formatDateOnly, formatLocalTimestamp } from "./date-format";

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
});
