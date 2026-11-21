// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { PanelLeft } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ScoredCount } from "../../lib/audit-snapshots";
import { decodeHtmlEntities } from "../../lib/text-format";
import { Card, CardContent } from "../ui/card";

type ProcessNavItem = { processCode: string; processAbbreviation?: string; processName?: string };

/** "GR1: Top Management Commitment & Accountability" -> "Top Management Commitment & Accountability". */
const processDescription = (group: ProcessNavItem): string => {
  const name = decodeHtmlEntities(String(group.processName ?? "")).trim();
  const prefix = `${group.processCode}:`;
  return name.startsWith(prefix) ? name.slice(prefix.length).trim() : name;
};
type ProcessNavProps = {
  processes: ProcessNavItem[];
  activeProcessCode: string;
  onJump: (processCode: string) => void;
  /** Scored/total requirements per process code. */
  progress?: Record<string, ScoredCount>;
  compact?: boolean;
};

/** Muted when nothing is scored, accent while in progress, success when every requirement is scored. */
const progressTone = ({ scored, total }: ScoredCount): string => {
  if (total > 0 && scored >= total) return "text-success-fg";
  if (scored > 0) return "text-accent";
  return "text-muted";
};

function ProgressCount({ count }: { count?: ScoredCount }) {
  if (!count) return null;
  return (
    <span aria-hidden="true" className={`text-xs font-semibold tabular-nums ${progressTone(count)}`}>
      {count.scored}/{count.total}
    </span>
  );
}

function ProcessNavButtons({ processes, activeProcessCode, onJump, progress, compact = false }: ProcessNavProps) {
  return (
    <div className={compact ? "flex gap-2 overflow-x-auto" : "grid gap-2"}>
      {processes.map((group) => {
        const description = processDescription(group);
        const count = progress?.[String(group.processCode)];
        const countText = count ? `${count.scored} of ${count.total} scored` : "";
        const accessibleName = [group.processCode, description, countText].filter(Boolean).join(", ");
        return (
          <button
            key={`${compact ? "mobile" : "desktop"}-${group.processCode}`}
            type="button"
            title={[description, countText].filter(Boolean).join(" · ") || undefined}
            aria-label={accessibleName}
            aria-current={activeProcessCode === String(group.processCode) ? "true" : undefined}
            onClick={() => onJump(group.processCode)}
            className={`rounded-xl border px-3 py-2 text-left text-sm transition ${compact ? "shrink-0 font-medium" : ""} ${
              activeProcessCode === String(group.processCode)
                ? "border-primary/60 bg-primary/10 text-accent"
                : "border-border bg-surface/45 text-fg-secondary hover:border-border-strong hover:text-fg"
            }`}
          >
            {compact ? (
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{group.processCode}</span>
                <ProgressCount count={count} />
              </div>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-medium">{group.processCode}</span>
                    {group.processAbbreviation ? (
                      <span className="text-xs text-muted"> · {group.processAbbreviation}</span>
                    ) : null}
                  </span>
                  <ProgressCount count={count} />
                </div>
                {description ? <div className="mt-1 text-xs leading-snug">{description}</div> : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ProcessSidebarNav({ processes, activeProcessCode, onJump, progress }: ProcessNavProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the highlighted process visible inside the sidebar's own scroll area without moving the page.
  useEffect(() => {
    const container = scrollRef.current;
    const active = container?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!container || !active) return;
    const top = active.offsetTop - container.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight;
    }
  }, [activeProcessCode]);

  return (
    <aside aria-label="Processes" className="hidden xl:block">
      {/* Sticks below the workspace save bar (--ws-sticky) and scrolls on its own, independent of the panels. */}
      <Card className="sticky top-[calc(var(--ws-sticky,6rem)+1rem)] flex max-h-[calc(100dvh-var(--ws-sticky,6rem)-2rem)] flex-col bg-surface/55">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-fg">
            <PanelLeft className="size-4 text-accent" /> Process navigation
          </div>
          <div ref={scrollRef} className="relative -mr-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2">
            <ProcessNavButtons
              processes={processes}
              activeProcessCode={activeProcessCode}
              onJump={onJump}
              progress={progress}
            />
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

export function ProcessMobileNav({ processes, activeProcessCode, onJump, progress }: ProcessNavProps) {
  return (
    <nav
      aria-label="Processes"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur xl:hidden"
    >
      <ProcessNavButtons
        processes={processes}
        activeProcessCode={activeProcessCode}
        onJump={onJump}
        progress={progress}
        compact
      />
    </nav>
  );
}
