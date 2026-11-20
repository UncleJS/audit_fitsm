// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { PDFDocument, type PDFFont, type PDFPage, type RGB, rgb, StandardFonts } from "pdf-lib";

export type PdfAuditInput = {
  audit: {
    id: number;
    name: string;
    status: string;
    auditDate: string;
    clientName: string;
    generatedAtIso: string;
    leadAuditorName: string;
    scopeSummary: string;
  };
  groupedProcesses: Array<{
    processCode: string;
    processName: string;
    processAbbreviation: string;
    scopeLabel: string;
    certGoalLevel: number | null;
    customGoalLevel: number | null;
    requirements: Array<{
      requirementCode: string;
      requirementText: string;
      scoreLabel: string;
      commentText: string | null;
      evidenceText: string | null;
    }>;
  }>;
};

// The standard PDF fonts only cover WinAnsi (roughly Latin-1 plus typographic quotes and dashes). Map the
// common characters outside it to readable ASCII; anything else that still cannot be encoded becomes "?".
const CHAR_REPLACEMENTS: Record<string, string> = {
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "≈": "~",
  "→": "->",
  "←": "<-",
  "↔": "<->",
  "⇒": "=>",
  "−": "-",
  "‐": "-",
  "‑": "-",
  "‒": "-",
  "―": "-",
  "′": "'",
  "″": '"',
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  " ": " ",
  "​": "",
  "‌": "",
  "‍": "",
  "﻿": "",
  Ł: "L",
  ł: "l",
  Đ: "D",
  đ: "d",
  ı: "i",
  "✓": "v",
  "✔": "v",
  "✗": "x",
  "✘": "x",
};

const COMBINING_MARKS = /[̀-ͯ]/g;

const makeSanitizer = (font: PDFFont) => {
  const cache = new Map<string, string>();
  const encodable = (value: string): boolean => {
    if (!value) return true;
    try {
      font.encodeText(value);
      return true;
    } catch {
      return false;
    }
  };

  const sanitizeChar = (char: string): string => {
    const cached = cache.get(char);
    if (cached !== undefined) return cached;

    let result = "?";
    if (encodable(char)) {
      result = char;
    } else if (char in CHAR_REPLACEMENTS) {
      result = CHAR_REPLACEMENTS[char] ?? "?";
    } else {
      // Accented letters outside WinAnsi (e.g. "ż") fall back to their base letter.
      const base = char.normalize("NFD").replace(COMBINING_MARKS, "");
      if (base && base !== char && encodable(base)) result = base;
    }
    cache.set(char, result);
    return result;
  };

  return (text: string): string => {
    let out = "";
    // for..of iterates by code point, so surrogate pairs (emoji) become a single "?".
    for (const char of text.normalize("NFC")) {
      out += sanitizeChar(char);
    }
    return out;
  };
};

/** Splits a single word that is wider than the line into chunks that each fit. */
const breakWord = (word: string, maxWidth: number, font: PDFFont, size: number): string[] => {
  const chunks: string[] = [];
  let current = "";
  for (const char of word) {
    const candidate = current + char;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
};

/** Wraps already-sanitized text into lines no wider than maxWidth, breaking overlong words. */
export const wrapText = (text: string, maxWidth: number, font: PDFFont, size: number): string[] => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const lines: string[] = [];
  let current = "";

  for (const word of normalized.split(" ")) {
    const pieces = font.widthOfTextAtSize(word, size) > maxWidth ? breakWord(word, maxWidth, font, size) : [word];
    for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = piece;
      }
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
};

type LineStyle = { font: PDFFont; size: number; color: RGB; lineHeight: number; x?: number };

/**
 * Draws text line by line and starts a new page whenever the next line would cross the bottom margin,
 * so blocks taller than one page simply continue on the following page.
 */
class PageWriter {
  private page: PDFPage;
  y: number;
  readonly width: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly margin: number,
  ) {
    this.page = doc.addPage();
    const size = this.page.getSize();
    this.width = size.width;
    this.y = size.height - margin;
  }

  get contentWidth(): number {
    return this.width - this.margin * 2;
  }

  newPage(): void {
    this.page = this.doc.addPage();
    this.y = this.page.getSize().height - this.margin;
  }

  /** Moves to a new page if fewer than `needed` points remain (used to keep headings with their content). */
  ensureSpace(needed: number): void {
    if (this.y - needed < this.margin) this.newPage();
  }

  line(text: string, style: LineStyle): void {
    this.ensureSpace(style.lineHeight);
    this.page.drawText(text, {
      x: style.x ?? this.margin,
      y: this.y,
      size: style.size,
      font: style.font,
      color: style.color,
    });
    this.y -= style.lineHeight;
  }

  /** Draws a label and a wrapped value on the same starting line (title page key/value rows). */
  labelled(label: string, valueLines: string[], labelStyle: LineStyle, valueStyle: LineStyle, valueX: number): void {
    this.ensureSpace(valueStyle.lineHeight);
    this.page.drawText(label, {
      x: this.margin,
      y: this.y,
      size: labelStyle.size,
      font: labelStyle.font,
      color: labelStyle.color,
    });
    for (const valueLine of valueLines) {
      this.line(valueLine, { ...valueStyle, x: valueX });
    }
  }

  gap(points: number): void {
    this.y -= points;
  }
}

export const buildAuditPdfReport = async (input: PdfAuditInput): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  // Helvetica and Helvetica-Bold share the WinAnsi character set, so one sanitizer serves both.
  const clean = makeSanitizer(fontRegular);

  const margin = 50;
  const titleSize = 28;
  const h1 = 18;
  const h2 = 12;
  const body = 10;

  const titleStyle: LineStyle = { font: fontBold, size: titleSize, color: rgb(0.08, 0.1, 0.22), lineHeight: 40 };
  const h1Style: LineStyle = { font: fontBold, size: h1, color: rgb(0.12, 0.16, 0.35), lineHeight: 26 };
  const labelStyle: LineStyle = { font: fontBold, size: h2, color: rgb(0.18, 0.2, 0.32), lineHeight: 16 };
  const valueStyle: LineStyle = { font: fontRegular, size: h2, color: rgb(0.1, 0.1, 0.1), lineHeight: 16 };
  const processStyle: LineStyle = { font: fontBold, size: h2, color: rgb(0.1, 0.16, 0.35), lineHeight: 16 };
  const metaStyle: LineStyle = { font: fontRegular, size: body, color: rgb(0.2, 0.2, 0.2), lineHeight: 12 };
  const reqHeaderStyle: LineStyle = { font: fontBold, size: body, color: rgb(0.09, 0.1, 0.18), lineHeight: 12 };
  const reqTextStyle: LineStyle = { font: fontRegular, size: body, color: rgb(0.1, 0.1, 0.1), lineHeight: 12 };
  const noteStyle: LineStyle = { font: fontRegular, size: body, color: rgb(0.2, 0.2, 0.2), lineHeight: 12 };

  const drawWrapped = (writer: PageWriter, text: string, style: LineStyle) => {
    for (const line of wrapText(clean(text), writer.contentWidth, style.font, style.size)) {
      writer.line(line, style);
    }
  };

  // Title page
  {
    const writer = new PageWriter(doc, margin);
    drawWrapped(writer, "FitSM Audit Report", titleStyle);
    drawWrapped(writer, input.audit.name, { ...h1Style, lineHeight: 28 });

    const labelWidth = 120;
    const titleFields: Array<[string, string]> = [
      ["Client", input.audit.clientName],
      ["Audit ID", String(input.audit.id)],
      ["Status", input.audit.status],
      ["Audit date", input.audit.auditDate],
      ["Generated", input.audit.generatedAtIso],
      ["Lead auditor", input.audit.leadAuditorName || "Not specified"],
      ["Scope summary", input.audit.scopeSummary],
    ];

    for (const [label, value] of titleFields) {
      const valueLines = wrapText(clean(value || "-"), writer.contentWidth - labelWidth, fontRegular, h2);
      writer.labelled(`${label}:`, valueLines, labelStyle, valueStyle, margin + labelWidth);
      writer.gap(4);
    }
  }

  // Full assessment report
  const writer = new PageWriter(doc, margin);
  drawWrapped(writer, "Full Assessment Report", h1Style);

  for (const process of input.groupedProcesses) {
    // Keep the process heading together with at least its meta line and one requirement line.
    writer.ensureSpace(processStyle.lineHeight + metaStyle.lineHeight + 30);
    drawWrapped(
      writer,
      `${process.processCode} - ${process.processName} (${process.processAbbreviation})`,
      processStyle,
    );
    drawWrapped(
      writer,
      `Scope: ${process.scopeLabel} | Cert goal: ${process.certGoalLevel ?? "-"} | Custom goal: ${process.customGoalLevel ?? "-"}`,
      metaStyle,
    );
    writer.gap(6);

    for (const req of process.requirements) {
      writer.ensureSpace(reqHeaderStyle.lineHeight * 2);
      drawWrapped(writer, `${req.requirementCode} | Score: ${req.scoreLabel ?? "Select …"}`, reqHeaderStyle);
      drawWrapped(writer, req.requirementText || "", reqTextStyle);
      drawWrapped(writer, `Comment: ${req.commentText || "-"}`, noteStyle);
      drawWrapped(writer, `Evidence: ${req.evidenceText || "-"}`, noteStyle);
      writer.gap(6);
    }

    writer.gap(8);
  }

  return await doc.save();
};
