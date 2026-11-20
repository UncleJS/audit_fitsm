// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import type { HTMLAttributes } from "react";
import { cn } from "./cn";

const variants = {
  default: "border-border-strong bg-surface-2 text-fg",
  draft: "border-success/40 bg-success/15 text-success-fg",
  in_progress: "border-warning/40 bg-warning/15 text-warning-fg",
  completed: "border-info/40 bg-info/15 text-info-fg",
  archived: "border-border-strong bg-surface-3 text-fg-secondary",
  success: "border-success/40 bg-success/15 text-success-fg",
  warning: "border-warning/40 bg-warning/15 text-warning-fg",
  error: "border-danger/40 bg-danger/15 text-danger-fg",
  info: "border-primary/40 bg-primary/15 text-accent",
} as const;

type BadgeVariant = keyof typeof variants;

export function Badge({
  className,
  children,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.12em]",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function statusVariant(status: string): BadgeVariant {
  if (status === "draft") return "draft";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "archived") return "archived";
  return "default";
}
