// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

// Cells a spreadsheet may evaluate as a formula: a leading =, +, -, @, tab or carriage return,
// optionally after leading spaces (some spreadsheet apps trim those before evaluating).
const FORMULA_PREFIX = /^[ ]*[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  // Real numbers (including negatives) are data, not formulas: keep them numeric.
  if (typeof value === "number" || typeof value === "bigint") return String(value);

  let text = String(value);
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  if (NEEDS_QUOTES.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const rowsToCsv = (rows: ReadonlyArray<object>): string => {
  if (!rows.length) return "";
  const first = rows[0] as Record<string, unknown>;
  const headers = Object.keys(first);
  const lines = [headers.map((header) => csvEscape(header)).join(",")];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(headers.map((header) => csvEscape(record[header])).join(","));
  }
  return lines.join("\n");
};
