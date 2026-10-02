import type { HTMLAttributes } from "react";
import { cn } from "./cn";

const variants = {
  default: "border-slate-700 bg-slate-900 text-slate-200",
  draft: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  in_progress: "border-amber-400/40 bg-amber-400/15 text-amber-100",
  completed: "border-violet-400/40 bg-violet-400/15 text-violet-100",
  archived: "border-slate-600 bg-slate-800 text-slate-300",
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-100",
  error: "border-rose-500/40 bg-rose-500/15 text-rose-100",
  info: "border-sky-500/40 bg-sky-500/15 text-sky-100",
} as const;

type BadgeVariant = keyof typeof variants;

export function Badge({ className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const variant = (props.variant as BadgeVariant) ?? "default";
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
