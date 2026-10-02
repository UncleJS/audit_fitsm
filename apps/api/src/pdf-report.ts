import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";

type PdfAuditInput = {
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

const wrapText = (text: string, maxWidth: number, font: PDFFont, size: number): string[] => {
  if (!text) return [""];
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
};

export const buildAuditPdfReport = async (input: PdfAuditInput): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  const titleSize = 28;
  const h1 = 18;
  const h2 = 12;
  const body = 10;

  // Title page
  {
    const page = doc.addPage();
    const { width, height } = page.getSize();
    let y = height - margin;

    page.drawText("FitSM Audit Report", {
      x: margin,
      y,
      size: titleSize,
      font: fontBold,
      color: rgb(0.08, 0.1, 0.22),
    });
    y -= 40;

    page.drawText(input.audit.name, {
      x: margin,
      y,
      size: h1,
      font: fontBold,
      color: rgb(0.12, 0.16, 0.35),
    });
    y -= 28;

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
      page.drawText(`${label}:`, {
        x: margin,
        y,
        size: h2,
        font: fontBold,
        color: rgb(0.18, 0.2, 0.32),
      });

      const wrapped = wrapText(value || "-", width - margin * 2 - 120, fontRegular, h2);
      let localY = y;
      for (const line of wrapped) {
        page.drawText(line, {
          x: margin + 120,
          y: localY,
          size: h2,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        });
        localY -= 16;
      }
      y = localY - 4;
    }
  }

  // Full assessment report
  let page = doc.addPage();
  let { width, height } = page.getSize();
  let y = height - margin;

  const ensureSpace = (needed: number) => {
    if (y - needed < margin) {
      page = doc.addPage();
      ({ width, height } = page.getSize());
      y = height - margin;
    }
  };

  page.drawText("Full Assessment Report", {
    x: margin,
    y,
    size: h1,
    font: fontBold,
    color: rgb(0.08, 0.1, 0.22),
  });
  y -= 26;

  for (const process of input.groupedProcesses) {
    ensureSpace(40);
    page.drawText(`${process.processCode} - ${process.processName} (${process.processAbbreviation})`, {
      x: margin,
      y,
      size: h2,
      font: fontBold,
      color: rgb(0.1, 0.16, 0.35),
    });
    y -= 16;

    page.drawText(
      `Scope: ${process.scopeLabel} | Cert goal: ${process.certGoalLevel ?? "-"} | Custom goal: ${process.customGoalLevel ?? "-"}`,
      {
        x: margin,
        y,
        size: body,
        font: fontRegular,
        color: rgb(0.2, 0.2, 0.2),
      },
    );
    y -= 18;

    for (const req of process.requirements) {
      const reqHeader = `${req.requirementCode} | Score: ${req.scoreLabel ?? "Select …"}`;
      const reqText = wrapText(req.requirementText || "", width - margin * 2, fontRegular, body);
      const commentText = wrapText(`Comment: ${req.commentText || "-"}`, width - margin * 2, fontRegular, body);
      const evidenceText = wrapText(`Evidence: ${req.evidenceText || "-"}`, width - margin * 2, fontRegular, body);
      const blockHeight = 14 + reqText.length * 12 + commentText.length * 12 + evidenceText.length * 12 + 10;

      ensureSpace(blockHeight);

      page.drawText(reqHeader, {
        x: margin,
        y,
        size: body,
        font: fontBold,
        color: rgb(0.09, 0.1, 0.18),
      });
      y -= 12;

      for (const line of reqText) {
        page.drawText(line, {
          x: margin,
          y,
          size: body,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= 12;
      }

      for (const line of commentText) {
        page.drawText(line, {
          x: margin,
          y,
          size: body,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
      }

      for (const line of evidenceText) {
        page.drawText(line, {
          x: margin,
          y,
          size: body,
          font: fontRegular,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 12;
      }

      y -= 6;
    }

    y -= 8;
  }

  return await doc.save();
};
