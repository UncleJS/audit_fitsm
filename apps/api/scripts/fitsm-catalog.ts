// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
//
// Pure helpers that read the FitSM-6 Assessment and Audit Tool workbook (.ods or .xlsx) into plain rows and turn the
// "3. Assessment" sheet into the process / requirement / guidance catalog. No database access here.
import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

/** One sheet: rows that contain at least one value, each trimmed, with trailing empty cells removed. */
export type SheetRows = string[][];
export type Sheets = Record<string, SheetRows>;

/** Columns read per row; the assessment sheet only uses the first 15. */
export const MAX_COLS = 20;

export const REQUIREMENT_CODE_PATTERN = /^(GR|PR)\d+\.\d+$/;

/** Capability score labels (capability_scores.label) that carry per-requirement guidance, in workbook column order. */
export const GUIDANCE_SCORE_LABELS = ["0", "1", "2", "3", "4"] as const;
export type GuidanceScoreLabel = (typeof GUIDANCE_SCORE_LABELS)[number];

export type CatalogProcess = {
  code: string;
  abbreviation: string;
  name: string;
  kind: "GR" | "PR";
  defaultCertGoal: number;
  sortOrder: number;
};

export type CatalogRequirement = {
  processCode: string;
  code: string;
  requirementText: string;
  sortOrder: number;
};

export type CatalogGuidance = {
  requirementCode: string;
  scoreLabel: GuidanceScoreLabel;
  guidanceText: string;
};

export type Catalog = {
  processes: CatalogProcess[];
  requirements: CatalogRequirement[];
  guidance: CatalogGuidance[];
};

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

// ---------------------------------------------------------------------------------------------------------------------
// Interpretation helpers (shared with import-fitsm.ts)
// ---------------------------------------------------------------------------------------------------------------------

export const capabilityScoreLabel = (raw: string): string => {
  const value = (raw ?? "").trim();
  if (!value) return "Select …";
  if (["0", "1", "2", "3", "4", "Select …"].includes(value)) return value;
  return "Select …";
};

export const scopeCode = (label: string): string => {
  const normalized = (label ?? "").toLowerCase();
  if (normalized.includes("out")) return "OUT_OF_SCOPE";
  return "IN_SCOPE";
};

export const extractProcessCode = (processLabel: string): string => {
  return String(processLabel ?? "")
    .split(":")[0]
    .trim();
};

export const toTargetLevel = (value: unknown, fallback = 2): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 1) return 1;
  if (n > 4) return 4;
  return Math.trunc(n);
};

/**
 * Builds the catalog from the "3. Assessment" sheet, row by row in workbook order:
 * column B = certification goal, C = process label (stored as the process name), D = abbreviation,
 * E = requirement code, F = requirement text, G..K = guidance for capability scores 0..4.
 * Processes and requirements are numbered 1..n in order of first appearance. Empty guidance cells are skipped.
 */
export const buildCatalog = (sheets: Sheets): Catalog => {
  const assessmentRows = sheets["3. Assessment"] ?? [];
  const processes = new Map<string, CatalogProcess>();
  const requirementCount = new Map<string, number>();
  const requirements: CatalogRequirement[] = [];
  const guidance: CatalogGuidance[] = [];

  for (const row of assessmentRows) {
    const requirementCode = row[4] ?? "";
    if (!REQUIREMENT_CODE_PATTERN.test(requirementCode)) continue;

    const processCode = extractProcessCode(row[2]);
    if (!processes.has(processCode)) {
      processes.set(processCode, {
        code: processCode,
        abbreviation: row[3] ?? "",
        name: row[2] ?? processCode,
        kind: processCode.startsWith("GR") ? "GR" : "PR",
        defaultCertGoal: toTargetLevel(row[1] ?? 2, 2),
        sortOrder: processes.size + 1,
      });
      requirementCount.set(processCode, 0);
    }

    const sortOrder = (requirementCount.get(processCode) ?? 0) + 1;
    requirementCount.set(processCode, sortOrder);

    requirements.push({ processCode, code: requirementCode, requirementText: row[5] ?? "", sortOrder });

    GUIDANCE_SCORE_LABELS.forEach((scoreLabel, index) => {
      const guidanceText = row[6 + index] ?? "";
      if (guidanceText) guidance.push({ requirementCode, scoreLabel, guidanceText });
    });
  }

  return { processes: [...processes.values()], requirements, guidance };
};

// ---------------------------------------------------------------------------------------------------------------------
// .ods (OpenDocument spreadsheet)
// ---------------------------------------------------------------------------------------------------------------------

const odsParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
  processEntities: false,
});

const textFromP = (pNode: unknown): string => {
  if (pNode === undefined || pNode === null) return "";
  if (typeof pNode === "string") return pNode.trim();
  if (Array.isArray(pNode)) return pNode.map(textFromP).filter(Boolean).join("\n");
  if (typeof pNode === "object") {
    if ((pNode as any)["#text"]) return String((pNode as any)["#text"]).trim();
    return Object.values(pNode as Record<string, unknown>)
      .map(textFromP)
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

const odsRowToCells = (rowNode: any, maxCols = MAX_COLS): string[] => {
  const cells = asArray(rowNode?.["table-cell"]);
  const result: string[] = [];

  for (const cell of cells) {
    const repeat = Number(cell?.["@_number-columns-repeated"] ?? 1);
    const text = textFromP(cell?.p);

    for (let i = 0; i < repeat; i += 1) {
      result.push(text);
      if (result.length >= maxCols) break;
    }

    if (result.length >= maxCols) break;
  }

  while (result.length > 0 && !result[result.length - 1]) {
    result.pop();
  }

  return result;
};

export const parseOdsSheets = async (zip: JSZip): Promise<Sheets> => {
  const contentXml = await zip.file("content.xml")?.async("string");

  if (!contentXml) {
    throw new Error("ODS content.xml not found");
  }

  const document = odsParser.parse(contentXml);
  const tables = asArray(document?.["document-content"]?.body?.spreadsheet?.table);
  const sheets: Sheets = {};

  for (const table of tables as any[]) {
    const name = String(table?.["@_name"] ?? "");
    if (!name) continue;

    const rows = asArray(table?.["table-row"]);
    const extracted: string[][] = [];

    for (const row of rows as any[]) {
      const rowRepeat = Number(row?.["@_number-rows-repeated"] ?? 1);
      const values = odsRowToCells(row, MAX_COLS);
      const hasValue = values.some((entry) => entry && entry.trim().length > 0);

      if (!hasValue) {
        continue;
      }

      extracted.push(values.map((entry) => entry.trim()));

      if (rowRepeat > 1 && extracted.length > 5000) {
        break;
      }
    }

    sheets[name] = extracted;
  }

  return sheets;
};

// ---------------------------------------------------------------------------------------------------------------------
// .xlsx (Office Open XML spreadsheet)
// ---------------------------------------------------------------------------------------------------------------------

// Entities are decoded by decodeXml below (one controlled pass); whitespace is kept so rich-text runs join correctly.
const xlsxParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
  processEntities: false,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
});

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decodes the predefined XML entities and numeric character references. */
export const decodeXml = (value: string): string =>
  value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity] ?? match;
  });

/** Decodes the OOXML `_xHHHH_` escapes (ECMA-376 ST_Xstring), e.g. `_x000D_` for a carriage return. */
export const decodeOoxmlEscapes = (value: string): string =>
  value.replace(/_x([0-9a-fA-F]{4})_/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));

export const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/g, "\n");

// Raw line breaks are normalised first, as an XML processor would (so `_x000D_` + CRLF becomes one CR + LF), then the
// entities and `_xHHHH_` escapes are decoded and the result is normalised to \n line endings.
const xlsxText = (raw: string): string =>
  normalizeLineEndings(decodeOoxmlEscapes(decodeXml(normalizeLineEndings(raw))));

/** Zero-based column index of a cell reference such as `C12` (→ 2) or `AA3` (→ 26); -1 if there is no column part. */
export const columnIndexFromRef = (ref: string): number => {
  const letters = /^([A-Za-z]+)/.exec(ref ?? "")?.[1];
  if (!letters) return -1;
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
};

const textOfT = (tNode: unknown): string => {
  if (tNode === undefined || tNode === null) return "";
  if (typeof tNode === "string") return tNode;
  if (Array.isArray(tNode)) return tNode.map(textOfT).join("");
  if (typeof tNode === "object") return String((tNode as any)["#text"] ?? "");
  return String(tNode);
};

/** Text of a shared-string item or inline string: a plain `<t>` or the concatenated `<r><t>` runs (phonetic `<rPh>` is ignored). */
const textOfStringItem = (node: any): string => {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return "";
  if (node.t !== undefined) return textOfT(node.t);
  return asArray(node.r)
    .map((run: any) => textOfT(run?.t))
    .join("");
};

const resolveZipPath = (baseDir: string, target: string): string => {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${baseDir}/${target}`.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
};

const xlsxCellValue = (cell: any, sharedStrings: string[]): string => {
  const type = String(cell?.["@_t"] ?? "n");
  if (type === "inlineStr") return xlsxText(textOfStringItem(cell?.is));
  const raw = cell?.v === undefined ? "" : textOfT(cell.v);
  if (raw === "") return "";
  if (type === "s") return sharedStrings[Number(raw)] ?? "";
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return xlsxText(raw);
};

/** Turns one `<row>…</row>` fragment into cells placed by their column reference, capped at maxCols. */
export const xlsxRowToCells = (rowXml: string, sharedStrings: string[], maxCols = MAX_COLS): string[] => {
  const parsed = xlsxParser.parse(rowXml);
  const cells = asArray(parsed?.row?.c);
  const result: string[] = [];
  let nextIndex = 0;

  for (const cell of cells as any[]) {
    const ref = cell?.["@_r"];
    const index = ref ? columnIndexFromRef(String(ref)) : nextIndex;
    nextIndex = (index < 0 ? nextIndex : index) + 1;
    if (index < 0 || index >= maxCols) continue;

    const value = xlsxCellValue(cell, sharedStrings).trim();
    while (result.length < index) result.push("");
    result[index] = value;
  }

  while (result.length > 0 && !result[result.length - 1]) {
    result.pop();
  }

  return result;
};

const readZipText = async (zip: JSZip, path: string): Promise<string | undefined> => {
  const bytes = await zip.file(path)?.async("uint8array");
  return bytes ? new TextDecoder("utf-8").decode(bytes) : undefined;
};

// Rows are scanned with a regex and only rows that hold a value are handed to the XML parser: the assessment sheet
// declares ~1M mostly empty rows (184 MB of XML), which is too much to build into a single object tree.
const ROW_PATTERN = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;

export const parseXlsxSheets = async (zip: JSZip): Promise<Sheets> => {
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  if (!workbookXml) {
    throw new Error("XLSX xl/workbook.xml not found");
  }

  const relsXml = (await readZipText(zip, "xl/_rels/workbook.xml.rels")) ?? "";
  const targetById = new Map<string, string>();
  for (const rel of asArray(xlsxParser.parse(relsXml)?.Relationships?.Relationship) as any[]) {
    targetById.set(String(rel?.["@_Id"] ?? ""), decodeXml(String(rel?.["@_Target"] ?? "")));
  }

  const sharedStringsXml = await readZipText(zip, "xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml
    ? (asArray(xlsxParser.parse(sharedStringsXml)?.sst?.si) as any[]).map((item) => xlsxText(textOfStringItem(item)))
    : [];

  const sheets: Sheets = {};
  const sheetNodes = asArray(xlsxParser.parse(workbookXml)?.workbook?.sheets?.sheet) as any[];

  for (const sheetNode of sheetNodes) {
    const name = decodeXml(String(sheetNode?.["@_name"] ?? ""));
    // removeNSPrefix turns r:id into id.
    const target = targetById.get(String(sheetNode?.["@_id"] ?? ""));
    if (!name || !target) continue;

    const sheetXml = await readZipText(zip, resolveZipPath("xl", target));
    if (!sheetXml) continue;

    const extracted: string[][] = [];
    for (const match of sheetXml.matchAll(ROW_PATTERN)) {
      const rowXml = match[0];
      if (!rowXml.includes("<v>") && !rowXml.includes("<is>")) continue;
      const values = xlsxRowToCells(rowXml, sharedStrings, MAX_COLS);
      if (values.some((entry) => entry.length > 0)) extracted.push(values);
    }

    sheets[name] = extracted;
  }

  return sheets;
};

// ---------------------------------------------------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------------------------------------------------

/** Parses an .ods or .xlsx workbook (detected from its contents) into rows per sheet. */
export const parseWorkbookBuffer = async (buffer: Uint8Array | ArrayBuffer): Promise<Sheets> => {
  const zip = await JSZip.loadAsync(buffer);
  if (zip.file("xl/workbook.xml")) return parseXlsxSheets(zip);
  if (zip.file("content.xml")) return parseOdsSheets(zip);
  throw new Error("Unsupported workbook: expected an .xlsx (xl/workbook.xml) or .ods (content.xml) file");
};

export const parseWorkbook = async (filePath: string): Promise<Sheets> => parseWorkbookBuffer(await readFile(filePath));

/** Former import-fitsm.ts name, kept as an alias of parseWorkbook. */
export const parseSheets = parseWorkbook;
