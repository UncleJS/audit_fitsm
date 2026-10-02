import { describe, expect, it } from "bun:test";
import { csvEscape, rowsToCsv } from "./csv";

describe("csvEscape", () => {
  it("prefixes spreadsheet formulas", () => {
    expect(csvEscape("=SUM(1,1)")).toBe('"\'=SUM(1,1)"');
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("+1")).toBe("'+1");
    expect(csvEscape("-1")).toBe("'-1");
  });

  it("quotes commas and quotes", () => {
    expect(csvEscape('say "hi", friend')).toBe('"say ""hi"", friend"');
  });
});

describe("rowsToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("neutralizes formula cells in data rows", () => {
    expect(rowsToCsv([{ note: "=1+1" }])).toBe("note\n'=1+1");
  });
});
