// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { Save } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { decodeHtmlEntities } from "../../lib/text-format";
import PageSection from "../layout/page-section";
import { Button } from "../ui/button";

/** Structured audit detail responses and notes. */
export function DetailsPanel({
  workspace,
  detailEdits,
  setDetailEdits,
  canEdit,
  saveSectionNow,
  autosave,
}: {
  workspace: any;
  detailEdits: Record<string, any>;
  setDetailEdits: Dispatch<SetStateAction<Record<string, any>>>;
  canEdit: boolean;
  saveSectionNow: (section: "details") => unknown;
  autosave: { requestSave: (section: "details") => void };
}) {
  return (
    <PageSection
      title="4. Audit details"
      eyebrow="Context"
      description="Capture structured responses and notes that support the process scoring."
      action={
        <Button variant="secondary" onClick={() => void saveSectionNow("details")} disabled={!canEdit}>
          <Save className="size-4" /> Save details
        </Button>
      }
    >
      <div className="overflow-x-auto rounded-2xl border border-border/80">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th>Field</th>
              <th>Response</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {(workspace.details ?? []).map((detail: any) => {
              const edit = detailEdits[String(detail.field_key)] ?? {
                fieldKey: detail.field_key,
                responseText: "",
                noteText: "",
              };
              return (
                <tr key={detail.field_key}>
                  <td>
                    <div className="font-semibold text-fg">{decodeHtmlEntities(detail.label)}</div>
                    {detail.guidance_text ? (
                      <div className="mt-2 text-sm text-muted">{decodeHtmlEntities(detail.guidance_text)}</div>
                    ) : null}
                  </td>
                  <td>
                    <textarea
                      aria-label={`${detail.label} response`}
                      rows={3}
                      value={edit.responseText}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setDetailEdits((prev) => ({
                          ...prev,
                          [String(detail.field_key)]: { ...edit, responseText: event.target.value },
                        }))
                      }
                      onBlur={() => autosave.requestSave("details")}
                    />
                  </td>
                  <td>
                    <textarea
                      aria-label={`${detail.label} notes`}
                      rows={3}
                      value={edit.noteText}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setDetailEdits((prev) => ({
                          ...prev,
                          [String(detail.field_key)]: { ...edit, noteText: event.target.value },
                        }))
                      }
                      onBlur={() => autosave.requestSave("details")}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PageSection>
  );
}
