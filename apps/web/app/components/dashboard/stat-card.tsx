// @ts-nocheck
import { Card, CardContent } from "../ui/card";

export default function StatCard({ label, value, icon: Icon }) {
  return (
    <Card className="border-slate-800/80 bg-slate-950/55">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <span className="rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-sky-200">
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}
