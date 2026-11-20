// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { ArrowRight, FilePlus2 } from "lucide-react";
import Link from "next/link";
import { formatDateOnly, formatLocalTimestamp } from "../../lib/date-format";
import { decodeHtmlEntities } from "../../lib/text-format";
import PageSection from "../layout/page-section";
import { Badge, statusVariant } from "../ui/badge";
import { Button } from "../ui/button";

type AuditListItem = {
  id: number;
  name: string;
  status: string;
  audit_date_UTC: string;
  created_UTC?: string;
  updated_UTC?: string;
};

export default function AuditsSection({
  filters,
  table,
  actions,
}: {
  filters: {
    statusFilter: string;
    setStatusFilter: (value: "all" | "draft" | "in_progress" | "completed") => void;
    searchTerm: string;
    setSearchTerm: (value: string) => void;
    sortBy: string;
    setSortBy: (value: "updated_desc" | "audit_date_desc" | "audit_date_asc" | "name_asc" | "status_asc") => void;
  };
  table: {
    selectedClientId: number | null;
    filteredAudits: AuditListItem[];
    statusSavingByAuditId: Record<string, boolean>;
  };
  actions: {
    onOpenAuditSheet: () => void;
    downloadTrendsCsv: () => void;
    nextStatusForQuickAction: (status: string) => "draft" | "in_progress" | "completed" | null;
    updateAuditStatus: (auditId: number, status: "draft" | "in_progress" | "completed") => void;
    quickActionLabel: (status: string) => string;
  };
}) {
  return (
    <PageSection
      title="2. Audits"
      eyebrow="Execution"
      description="Filter, sort, and transition audits without losing the context of the selected client."
      action={
        <Button variant="secondary" onClick={actions.onOpenAuditSheet}>
          <FilePlus2 className="size-4" /> Register new audit
        </Button>
      }
    >
      <div className="grid gap-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <div className="grid gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium text-fg-secondary">
            Status filter
          </label>
          <select
            id="status-filter"
            value={filters.statusFilter}
            onChange={(event) =>
              filters.setStatusFilter(event.target.value as "all" | "draft" | "in_progress" | "completed")
            }
          >
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="grid gap-2 xl:col-span-2">
          <label htmlFor="search-audits" className="text-sm font-medium text-fg-secondary">
            Search
          </label>
          <input
            id="search-audits"
            value={filters.searchTerm}
            onChange={(event) => filters.setSearchTerm(event.target.value)}
            placeholder="Search by ID, name, status, or date"
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="sort-by" className="text-sm font-medium text-fg-secondary">
            Sort by
          </label>
          <select
            id="sort-by"
            value={filters.sortBy}
            onChange={(event) =>
              filters.setSortBy(
                event.target.value as "updated_desc" | "audit_date_desc" | "audit_date_asc" | "name_asc" | "status_asc",
              )
            }
          >
            <option value="updated_desc">Recently updated</option>
            <option value="audit_date_desc">Audit date (newest)</option>
            <option value="audit_date_asc">Audit date (oldest)</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="status_asc">Status</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button
            variant="secondary"
            className="w-full xl:w-auto"
            onClick={actions.downloadTrendsCsv}
            disabled={!table.selectedClientId}
          >
            Download trends CSV
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-muted lg:hidden">
          Swipe horizontally to view audit actions and links
        </p>
        <div className="overflow-x-auto rounded-2xl border border-border/80">
          {table.filteredAudits.length === 0 ? (
            <div className="grid gap-2 p-6 text-sm text-muted">
              <p className="font-medium text-fg">No audits match the current filters.</p>
              <p>Create a new audit or change the filters to see more records.</p>
            </div>
          ) : (
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Audit date</th>
                  <th>Updated</th>
                  <th>Quick action</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {table.filteredAudits.map((audit) => {
                  const nextStatus = actions.nextStatusForQuickAction(audit.status);
                  const isSaving = !!table.statusSavingByAuditId[String(audit.id)];
                  return (
                    <tr key={audit.id}>
                      <td className="font-mono text-muted">#{audit.id}</td>
                      <td>
                        <div className="font-medium text-fg">{decodeHtmlEntities(audit.name)}</div>
                      </td>
                      <td>
                        <Badge variant={statusVariant(audit.status)}>{audit.status.replace("_", " ")}</Badge>
                      </td>
                      <td>{formatDateOnly(audit.audit_date_UTC)}</td>
                      <td>
                        {audit.updated_UTC
                          ? formatLocalTimestamp(audit.updated_UTC)
                          : formatDateOnly(audit.audit_date_UTC) || "—"}
                      </td>
                      <td>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!nextStatus || isSaving}
                          onClick={() => nextStatus && actions.updateAuditStatus(audit.id, nextStatus)}
                        >
                          {isSaving ? "Saving…" : actions.quickActionLabel(audit.status)}
                        </Button>
                      </td>
                      <td>
                        <Link
                          href={`/audits/${audit.id}`}
                          className="inline-flex items-center gap-2 text-sm font-medium text-accent"
                        >
                          Open workspace <ArrowRight className="size-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PageSection>
  );
}
