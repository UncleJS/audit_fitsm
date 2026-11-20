// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { describe, expect, it } from "bun:test";
import { csvEscape, rowsToCsv } from "./csv";

describe("csvEscape", () => {
  it("prefixes spreadsheet formulas", () => {
    expect(csvEscape("=SUM(1,1)")).toBe('"\'=SUM(1,1)"');
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("+1")).toBe("'+1");
    expect(csvEscape("-1")).toBe("'-1");
    expect(csvEscape("  =1")).toBe("'  =1");
  });

  it("neutralizes leading tab and carriage return", () => {
    expect(csvEscape("\tcmd")).toBe("'\tcmd");
    expect(csvEscape("\r=cmd")).toBe('"\'\r=cmd"');
  });

  it("keeps real numbers numeric, including negatives", () => {
    expect(csvEscape(-5)).toBe("-5");
    expect(csvEscape(3.25)).toBe("3.25");
    expect(csvEscape(0)).toBe("0");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvEscape('say "hi", friend')).toBe('"say ""hi"", friend"');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
    expect(csvEscape("lone\rcarriage")).toBe('"lone\rcarriage"');
  });

  it("returns empty for null and undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});

describe("rowsToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("neutralizes formula cells in data rows", () => {
    expect(rowsToCsv([{ note: "=1+1" }])).toBe("note\n'=1+1");
  });

  it("escapes headers the same way as cells", () => {
    expect(rowsToCsv([{ "a,b": 1, "=x": 2 }])).toBe('"a,b",\'=x\n1,2');
  });
});
