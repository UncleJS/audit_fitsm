// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "../ui/card";

export default function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: LucideIcon;
}) {
  return (
    <Card className="border-border/80 bg-surface/55">
      <CardContent className="flex items-start justify-between gap-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-fg">{value}</p>
        </div>
        <span className="rounded-2xl border border-border bg-surface-2/80 p-3 text-accent">
          <Icon className="size-4" />
        </span>
      </CardContent>
    </Card>
  );
}
