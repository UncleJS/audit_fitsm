// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { describe, expect, it } from "bun:test";
import JSZip from "jszip";
import {
  buildCatalog,
  capabilityScoreLabel,
  columnIndexFromRef,
  extractProcessCode,
  parseWorkbookBuffer,
  type Sheets,
  toTargetLevel,
  xlsxRowToCells,
} from "./fitsm-catalog";
import { generateSeedSql, validateCatalog } from "./generate-fitsm-seed";

// Placeholder texts only; no workbook content is reproduced here.
const assessmentRow = (goal: string, processLabel: string, abbreviation: string, code: string, text: string) => [
  "In scope",
  goal,
  processLabel,
  abbreviation,
  code,
  text,
  `${code} g0`,
  `${code} g1`,
  `${code} g2`,
  `${code} g3`,
  `${code} g4`,
  "Select …",
];

const fixture: Sheets = {
  "3. Assessment": [
    ["Header A", "Header B", "Process", "Abbr", "Code", "Requirement"],
    assessmentRow("3", "GR1: Alpha", "AAA", "GR1.1", "Alpha one"),
    assessmentRow("3", "GR1: Alpha", "AAA", "GR1.2", "Alpha two"),
    assessmentRow("7", "GR2: Beta", "BBB", "GR2.1", "Beta one"),
    ["", "", "", "", "not a code"],
    [...assessmentRow("", "PR1: Gamma", "CCC", "PR1.1", "Gamma one").slice(0, 8), "", "", "PR1.1 g4"],
    assessmentRow("2", "PR1: Gamma", "CCC", "PR1.2", "Gamma two"),
  ],
};

describe("buildCatalog", () => {
  const catalog = buildCatalog(fixture);

  it("collects processes in order of first appearance", () => {
    expect(catalog.processes).toEqual([
      { code: "GR1", abbreviation: "AAA", name: "GR1: Alpha", kind: "GR", defaultCertGoal: 3, sortOrder: 1 },
      { code: "GR2", abbreviation: "BBB", name: "GR2: Beta", kind: "GR", defaultCertGoal: 4, sortOrder: 2 },
      // An empty goal cell reads as 0 and is clamped to level 1, as the importer always did.
      { code: "PR1", abbreviation: "CCC", name: "PR1: Gamma", kind: "PR", defaultCertGoal: 1, sortOrder: 3 },
    ]);
  });

  it("numbers requirements per process and skips non-requirement rows", () => {
    expect(
      catalog.requirements.map((item) => [item.processCode, item.code, item.requirementText, item.sortOrder]),
    ).toEqual([
      ["GR1", "GR1.1", "Alpha one", 1],
      ["GR1", "GR1.2", "Alpha two", 2],
      ["GR2", "GR2.1", "Beta one", 1],
      ["PR1", "PR1.1", "Gamma one", 1],
      ["PR1", "PR1.2", "Gamma two", 2],
    ]);
  });

  it("maps guidance columns G..K to scores 0..4 and skips empty cells", () => {
    expect(catalog.guidance.filter((item) => item.requirementCode === "GR1.1")).toEqual(
      ["0", "1", "2", "3", "4"].map((label) => ({
        requirementCode: "GR1.1",
        scoreLabel: label as "0",
        guidanceText: `GR1.1 g${label}`,
      })),
    );
    expect(catalog.guidance.filter((item) => item.requirementCode === "PR1.1").map((item) => item.scoreLabel)).toEqual([
      "0",
      "1",
      "4",
    ]);
    expect(catalog.guidance).toHaveLength(23);
  });

  it("generates deterministic upsert SQL with escaped literals", () => {
    const withQuote = buildCatalog({
      "3. Assessment": [assessmentRow("2", "GR1: It's", "AAA", "GR1.1", "Line 1\nLine 'two'")],
    });
    expect(validateCatalog(withQuote)).toEqual([]);
    const sql = generateSeedSql(withQuote);
    expect(sql).toBe(generateSeedSql(withQuote));
    expect(sql).toContain("('GR1', 'AAA', 'GR1: It\\'s', 'GR', 1, 2)");
    expect(sql).toContain("SELECT 'GR1.1' AS code, 'Line 1\\nLine \\'two\\'' AS requirement_text, 1 AS sort_order");
    expect(sql).toContain("updated_UTC = UTC_TIMESTAMP(3)");
    expect(sql).not.toContain("updated_at");
  });
});

describe("interpretation helpers", () => {
  it("extracts process codes and clamps target levels", () => {
    expect(extractProcessCode("PR12: Something")).toBe("PR12");
    expect(toTargetLevel("9")).toBe(4);
    expect(toTargetLevel("x", 2)).toBe(2);
    expect(capabilityScoreLabel("3")).toBe("3");
    expect(capabilityScoreLabel("n/a")).toBe("Select …");
  });
});

describe("xlsx parsing", () => {
  it("maps cell references to column indexes", () => {
    expect(columnIndexFromRef("A1")).toBe(0);
    expect(columnIndexFromRef("C12")).toBe(2);
    expect(columnIndexFromRef("Z9")).toBe(25);
    expect(columnIndexFromRef("AA3")).toBe(26);
    expect(columnIndexFromRef("12")).toBe(-1);
  });

  it("keeps sparse cells at their column positions", () => {
    const row = '<row r="4"><c r="C4" t="s"><v>1</v></c><c r="F4"><v>42</v></c><c r="Z4" t="s"><v>0</v></c></row>';
    expect(xlsxRowToCells(row, ["zero", "one"])).toEqual(["", "", "one", "", "", "42"]);
  });

  it("reads shared strings, rich text, inline strings and escapes from a workbook", async () => {
    const zip = new JSZip();
    zip.file(
      "xl/workbook.xml",
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        '<sheet name="Other &amp; Notes" sheetId="1" r:id="rId1"/><sheet name="3. Assessment" sheetId="2" r:id="rId2"/>' +
        "</sheets></workbook>",
    );
    zip.file(
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    );
    zip.file(
      "xl/sharedStrings.xml",
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4">' +
        "<si><t>GR1: Placeholder &amp; Co</t></si>" +
        '<si><r><t xml:space="preserve">Rich </t></r><r><rPr><b/></rPr><t>bold</t></r><r><t xml:space="preserve"> run</t></r></si>' +
        '<si><t xml:space="preserve">  first line_x000D_\r\nsecond line &#8211; end  </t></si>' +
        "<si><t>GR1.1</t></si></sst>",
    );
    zip.file(
      "xl/worksheets/sheet1.xml",
      '<worksheet><sheetData><row r="1"><c r="B1" t="inlineStr"><is><t>inline</t></is></c></row></sheetData></worksheet>',
    );
    zip.file(
      "xl/worksheets/sheet2.xml",
      "<worksheet><sheetData>" +
        '<row r="1" spans="1:3"/>' +
        '<row r="2"><c r="A2" s="1"/><c r="B2" s="2"/></row>' +
        '<row r="3"><c r="B3"><f>X</f><v>3</v></c><c r="C3" t="s"><v>0</v></c><c r="D3" t="inlineStr"><is><r><t>A</t></r><r><t>B</t></r></is></c>' +
        '<c r="E3" t="s"><v>3</v></c><c r="F3" t="s"><v>2</v></c><c r="G3" t="s"><v>1</v></c><c r="H3" t="b"><v>1</v></c></row>' +
        "</sheetData></worksheet>",
    );

    const sheets = await parseWorkbookBuffer(await zip.generateAsync({ type: "uint8array" }));
    expect(sheets["Other & Notes"]).toEqual([["", "inline"]]);
    expect(sheets["3. Assessment"]).toEqual([
      ["", "3", "GR1: Placeholder & Co", "AB", "GR1.1", "first line\nsecond line – end", "Rich bold run", "TRUE"],
    ]);

    const catalog = buildCatalog(sheets);
    expect(catalog.processes[0]).toMatchObject({ code: "GR1", name: "GR1: Placeholder & Co", defaultCertGoal: 3 });
    expect(catalog.requirements[0]?.requirementText).toBe("first line\nsecond line – end");
    expect(catalog.guidance[0]).toEqual({ requirementCode: "GR1.1", scoreLabel: "0", guidanceText: "Rich bold run" });
  });
});
