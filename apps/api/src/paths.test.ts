import { describe, expect, it } from "bun:test";
import { contentDispositionAttachment, resolveExportPath, safeFileSegment } from "./paths";

describe("resolveExportPath", () => {
  it("keeps a relative export path under the exports directory", () => {
    const resolved = resolveExportPath("/workspace/data/exports", "1/audit-2/report.pdf");
    expect(resolved.endsWith("/workspace/data/exports/1/audit-2/report.pdf") || resolved.includes("exports")).toBe(
      true,
    );
    expect(resolved.includes("..")).toBe(false);
  });

  it("rejects parent segments", () => {
    expect(() => resolveExportPath("/workspace/data/exports", "../secret.pdf")).toThrow();
    expect(() => resolveExportPath("/workspace/data/exports", "1/../../etc/passwd")).toThrow();
  });
});

describe("contentDispositionAttachment", () => {
  it("strips quotes and newlines from the filename", () => {
    expect(contentDispositionAttachment('evil"\r\n.pdf')).toBe('attachment; filename="evil.pdf"');
  });
});

describe("safeFileSegment", () => {
  it("limits the segment to safe characters", () => {
    expect(safeFileSegment("Q1 Audit / Final")).toBe("q1-audit-final");
  });
});
