import { PanelLeft } from "lucide-react";
import { Card, CardContent } from "../ui/card";

type ProcessNavItem = { processCode: string; processAbbreviation?: string };
type ProcessNavProps = {
  processes: ProcessNavItem[];
  activeProcessCode: string;
  onJump: (processCode: string) => void;
  compact?: boolean;
};

function ProcessNavButtons({ processes, activeProcessCode, onJump, compact = false }: ProcessNavProps) {
  return (
    <div className={compact ? "flex gap-2 overflow-x-auto" : "grid gap-2"}>
      {processes.map((group) => (
        <button
          key={`${compact ? "mobile" : "desktop"}-${group.processCode}`}
          type="button"
          onClick={() => onJump(group.processCode)}
          className={`rounded-xl border px-3 py-2 text-left text-sm transition ${compact ? "shrink-0 font-medium" : ""} ${
            activeProcessCode === String(group.processCode)
              ? "border-sky-400/60 bg-sky-500/10 text-sky-100"
              : "border-slate-800 bg-slate-950/45 text-slate-300 hover:border-slate-600 hover:text-slate-100"
          }`}
        >
          <div className="font-medium">{group.processCode}</div>
          {!compact ? <div className="mt-1 text-xs text-slate-400">{group.processAbbreviation}</div> : null}
        </button>
      ))}
    </div>
  );
}

export function ProcessSidebarNav({ processes, activeProcessCode, onJump }: ProcessNavProps) {
  return (
    <aside aria-label="Processes" className="hidden xl:block">
      <Card className="sticky top-24 bg-slate-950/55">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-50">
            <PanelLeft className="size-4 text-sky-300" /> Process navigation
          </div>
          <ProcessNavButtons processes={processes} activeProcessCode={activeProcessCode} onJump={onJump} />
        </CardContent>
      </Card>
    </aside>
  );
}

export function ProcessMobileNav({ processes, activeProcessCode, onJump }: ProcessNavProps) {
  return (
    <nav
      aria-label="Processes"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 p-3 backdrop-blur xl:hidden"
    >
      <ProcessNavButtons processes={processes} activeProcessCode={activeProcessCode} onJump={onJump} compact />
    </nav>
  );
}
