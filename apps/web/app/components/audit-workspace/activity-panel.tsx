// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { History } from "lucide-react";
import { formatLocalTimestamp } from "../../lib/date-format";
import { decodeHtmlEntities } from "../../lib/text-format";
import PageSection from "../layout/page-section";
import { Card, CardContent } from "../ui/card";

const parseAuditEventJson = (value: unknown): any | null => {
  if (!value) return null;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

export const auditEventLabel = (eventType: string): string => {
  if (eventType === "status_changed") return "Status changed";
  if (eventType === "detail_response_changed") return "Audit detail updated";
  if (eventType === "conclusion_changed") return "Conclusion updated";
  if (eventType === "assessment_archived") return "Assessment archived";
  if (eventType === "assessment_restored") return "Assessment restored";
  return eventType;
};

export const auditEventSummary = (event: any): string => {
  const oldValue = parseAuditEventJson(event.old_value_json);
  const newValue = parseAuditEventJson(event.new_value_json);

  if (event.event_type === "status_changed") {
    return `${oldValue?.status ?? "unknown"} → ${newValue?.status ?? "unknown"}`;
  }

  if (event.event_type === "detail_response_changed") {
    return `Field: ${event.entity_key || "unknown"}`;
  }

  if (event.event_type === "conclusion_changed") {
    return newValue?.conclusionText ? "Conclusion text updated" : "Conclusion cleared";
  }

  if (event.event_type === "assessment_archived" || event.event_type === "assessment_restored") {
    return `Assessment #${event.entity_key || "?"}`;
  }

  return event.entity_key ? `Target: ${event.entity_key}` : "";
};

/** Audit-level activity timeline (times in the viewer's local zone). */
export function ActivityPanel({ workspace }: { workspace: any }) {
  return (
    <PageSection
      title="3. Audit activity"
      eyebrow="Timeline"
      description="Review status changes, saved updates, and archived or restored assessments in local time."
    >
      {(workspace.auditEvents ?? []).length === 0 ? (
        <p className="text-sm text-muted">No audit-level activity recorded yet.</p>
      ) : (
        <div className="grid gap-3">
          {(workspace.auditEvents ?? []).map((event: any) => {
            const summary = auditEventSummary(event);
            return (
              <Card key={`audit-event-${event.id}`} className="bg-surface/45">
                <CardContent className="flex flex-col gap-2 p-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-fg">
                      <History className="size-4 text-accent" />{" "}
                      <strong>{auditEventLabel(String(event.event_type))}</strong>
                    </div>
                    <p className="text-sm text-fg-secondary">
                      {summary ? decodeHtmlEntities(summary) : "No summary available."}
                    </p>
                    {event.actor_name ? (
                      <p className="text-xs uppercase tracking-[0.14em] text-muted">
                        Actor: {decodeHtmlEntities(event.actor_name)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted">{formatLocalTimestamp(event.created_at)}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageSection>
  );
}
