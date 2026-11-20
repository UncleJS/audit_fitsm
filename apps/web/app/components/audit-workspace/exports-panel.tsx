// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { formatLocalTimestamp } from "../../lib/date-format";
import PageSection from "../layout/page-section";
import { Button } from "../ui/button";

export const formatBytes = (value?: number) => {
  const bytes = Number(value ?? 0);
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/** Stored PDF exports for the audit, with per-file download. */
export function ExportsPanel({
  pdfExports,
  canExport,
  downloadingExportId,
  downloadPdfExport,
}: {
  pdfExports: any[];
  canExport: boolean;
  downloadingExportId: number | null;
  downloadPdfExport: (exportId: number, fileName: string) => void | Promise<void>;
}) {
  return (
    <PageSection
      title="2. Exports"
      eyebrow="Outputs"
      description="Generate and retrieve stored exports without leaving the audit context."
    >
      {pdfExports.length === 0 ? (
        <p className="text-sm text-muted">No stored PDF exports yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border/80">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>Generated</th>
                <th>File</th>
                <th>Size</th>
                <th>Current</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {pdfExports.map((item: any) => (
                <tr key={item.id}>
                  <td>{formatLocalTimestamp(item.generated_at)}</td>
                  <td>{item.file_name}</td>
                  <td>{formatBytes(item.file_size_bytes)}</td>
                  <td>{item.is_current ? "Yes" : "No"}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canExport || downloadingExportId === Number(item.id)}
                      onClick={() => downloadPdfExport(Number(item.id), String(item.file_name))}
                    >
                      {downloadingExportId === Number(item.id) ? "Downloading…" : "Download"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageSection>
  );
}
