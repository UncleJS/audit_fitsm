// @ts-nocheck
import Link from "next/link";
import { ArrowRight, FilePlus2 } from "lucide-react";
import PageSection from "../layout/page-section";
import { Badge, statusVariant } from "../ui/badge";
import { Button } from "../ui/button";
import { formatDateOnly, formatLocalTimestamp } from "../../lib/date-format";
import { decodeHtmlEntities } from "../../lib/text-format";

export default function AuditsSection({
  filters,
  table,
  actions
}) {
  return (
    <PageSection
      title="2. Audits"
      eyebrow="Execution"
      description="Filter, sort, and transition audits without losing the context of the selected client."
      action={<Button variant="secondary" onClick={actions.onOpenAuditSheet}><FilePlus2 className="size-4" /> Register new audit</Button>}
    >
      <div className="grid gap-3 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <div className="grid gap-2">
          <label htmlFor="status-filter" className="text-sm font-medium text-slate-300">Status filter</label>
          <select id="status-filter" value={filters.statusFilter} onChange={(event) => filters.setStatusFilter(event.target.value)}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div className="grid gap-2 xl:col-span-2">
          <label htmlFor="search-audits" className="text-sm font-medium text-slate-300">Search</label>
          <input id="search-audits" value={filters.searchTerm} onChange={(event) => filters.setSearchTerm(event.target.value)} placeholder="Search by ID, name, status, or date" />
        </div>
        <div className="grid gap-2">
          <label htmlFor="sort-by" className="text-sm font-medium text-slate-300">Sort by</label>
          <select id="sort-by" value={filters.sortBy} onChange={(event) => filters.setSortBy(event.target.value)}>
            <option value="updated_desc">Recently updated</option>
            <option value="audit_date_desc">Audit date (newest)</option>
            <option value="audit_date_asc">Audit date (oldest)</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="status_asc">Status</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button variant="secondary" className="w-full xl:w-auto" onClick={actions.downloadTrendsCsv} disabled={!table.selectedClientId}>Download trends CSV</Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-slate-500 lg:hidden">Swipe horizontally to view audit actions and links</p>
        <div className="overflow-x-auto rounded-2xl border border-slate-800/80">
          {table.filteredAudits.length === 0 ? (
            <div className="grid gap-2 p-6 text-sm text-slate-400">
              <p className="font-medium text-slate-200">No audits match the current filters.</p>
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
                      <td className="font-mono text-slate-400">#{audit.id}</td>
                      <td><div className="font-medium text-slate-50">{decodeHtmlEntities(audit.name)}</div></td>
                      <td><Badge variant={statusVariant(audit.status)}>{audit.status.replace("_", " ")}</Badge></td>
                      <td>{formatDateOnly(audit.audit_date)}</td>
                      <td>{formatLocalTimestamp(audit.updated_at ?? audit.audit_date)}</td>
                      <td><Button size="sm" variant="secondary" disabled={!nextStatus || isSaving} onClick={() => nextStatus && actions.updateAuditStatus(audit.id, nextStatus)}>{isSaving ? "Saving…" : actions.quickActionLabel(audit.status)}</Button></td>
                      <td><Link href={`/audits/${audit.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-sky-300">Open workspace <ArrowRight className="size-4" /></Link></td>
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
