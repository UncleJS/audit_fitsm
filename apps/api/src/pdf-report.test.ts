// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { describe, expect, it } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { buildAuditPdfReport, type PdfAuditInput } from "./pdf-report";

const baseInput = (overrides: { commentText?: string; evidenceText?: string; requirementText?: string }) =>
  ({
    audit: {
      id: 1,
      name: "Audit łż≥ 中文 😀",
      status: "draft",
      auditDate: "2026-11-20",
      clientName: "Klient „Zażółć” – test",
      generatedAtIso: "2026-11-20 10:00:00 UTC",
      leadAuditorName: "Łukasz Żółw",
      scopeSummary: "In scope processes: 1; Out of scope processes: 0",
    },
    groupedProcesses: [
      {
        processCode: "PR1",
        processName: "Service portfolio ≤ management",
        processAbbreviation: "SPM",
        scopeLabel: "In scope",
        certGoalLevel: 3,
        customGoalLevel: null,
        requirements: [
          {
            requirementCode: "PR1.1",
            requirementText: overrides.requirementText ?? "Requirement with ≥ and → arrows",
            scoreLabel: "2",
            commentText: overrides.commentText ?? "łż≥ 中文 😀",
            evidenceText: overrides.evidenceText ?? null,
          },
        ],
      },
    ],
  }) satisfies PdfAuditInput;

describe("buildAuditPdfReport", () => {
  it("renders non-WinAnsi characters without throwing", async () => {
    const bytes = await buildAuditPdfReport(baseInput({}));
    expect(bytes.byteLength).toBeGreaterThan(0);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("breaks a 10k-character word and paginates blocks taller than a page", async () => {
    const longWord = "x".repeat(10_000);
    const longParagraph = Array.from({ length: 2_000 }, (_, i) => `word${i}`).join(" ");
    const bytes = await buildAuditPdfReport(
      baseInput({ commentText: longWord, evidenceText: longParagraph, requirementText: "中文 😀".repeat(500) }),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(3);
  });
});
