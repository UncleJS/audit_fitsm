// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import Link from "next/link";
import { decodeHtmlEntities } from "../../lib/text-format";
import PageSection from "../layout/page-section";

type ClientOption = { id: number; name: string };
type RecentAudit = { id: number; name: string };

export default function ClientFocusSection({
  clients,
  selectedClientId,
  setSelectedClientId,
  recentlyUpdated,
}: {
  clients: ClientOption[];
  selectedClientId: number | null;
  setSelectedClientId: (id: number) => void;
  recentlyUpdated: RecentAudit[];
}) {
  return (
    <PageSection
      title="1. Client focus"
      eyebrow="Selection"
      description="Anchor the rest of the page to one client before creating or reviewing audits."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="grid gap-2">
          <label htmlFor="client-select" className="text-sm font-medium text-fg-secondary">
            Selected client
          </label>
          {clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-strong bg-surface/40 p-4 text-sm text-muted">
              No clients available yet. Create one from the <Link href="/admin">Admin</Link> page.
            </div>
          ) : (
            <select
              id="client-select"
              value={selectedClientId ?? ""}
              onChange={(event) => setSelectedClientId(Number(event.target.value))}
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {decodeHtmlEntities(client.name)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="rounded-2xl border border-border/80 bg-surface/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Recently updated</p>
          {recentlyUpdated.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No audits updated for the selected client yet.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {recentlyUpdated.map((audit) => (
                <Link
                  key={audit.id}
                  href={`/audits/${audit.id}`}
                  className="rounded-full border border-border-strong bg-surface-2/80 px-3 py-2 text-sm text-fg hover:border-primary/60"
                >
                  #{audit.id} {decodeHtmlEntities(audit.name)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageSection>
  );
}
