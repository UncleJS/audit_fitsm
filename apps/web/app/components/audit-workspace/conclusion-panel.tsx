// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import PageSection from "../layout/page-section";
import { Button } from "../ui/button";

/** Overall audit conclusion (lead auditor / org admin only). */
export function ConclusionPanel({
  conclusionEdit,
  setConclusionEdit,
  canLeadEdit,
  saveSectionNow,
  autosave,
}: {
  conclusionEdit: string;
  setConclusionEdit: (value: string) => void;
  canLeadEdit: boolean;
  saveSectionNow: (section: "conclusion") => unknown;
  autosave: { requestSave: (section: "conclusion") => void };
}) {
  return (
    <PageSection
      title="5. Conclusion"
      eyebrow="Wrap-up"
      description="Record the overall conclusion separately from detailed notes and requirement evidence."
      action={
        <Button onClick={() => void saveSectionNow("conclusion")} disabled={!canLeadEdit}>
          <Save className="size-4" /> Save conclusion
        </Button>
      }
    >
      <label htmlFor="audit-conclusion" className="text-sm font-medium text-fg-secondary">
        Conclusion
      </label>
      <textarea
        id="audit-conclusion"
        rows={8}
        value={conclusionEdit}
        disabled={!canLeadEdit}
        onChange={(event) => setConclusionEdit(event.target.value)}
        onBlur={() => autosave.requestSave("conclusion")}
        placeholder="Enter audit conclusion"
      />
      <div className="text-sm text-muted">
        <Link href="/" className="inline-flex items-center gap-2 text-accent">
          <ArrowLeft className="size-4" /> Back to clients and audits
        </Link>
      </div>
    </PageSection>
  );
}
