// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
  children: ReactNode;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "btn-primary border border-primary/70 bg-primary text-primary-contrast shadow-[0_0_0_1px_var(--shadow)] hover:bg-primary-hover hover:text-primary-contrast disabled:bg-surface-3 disabled:text-fg-secondary",
  secondary:
    "border border-border-strong bg-surface-2/80 text-fg hover:border-border-strong hover:bg-surface-3 disabled:text-muted",
  ghost:
    "border border-transparent bg-transparent text-fg-secondary hover:border-border-strong hover:bg-surface-2/80 disabled:text-muted",
  danger: "border border-danger/60 bg-danger/15 text-danger-fg hover:bg-danger/25 disabled:text-danger-fg/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function Button({ className, variant = "primary", size = "md", active, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60",
        sizeClasses[size],
        variantClasses[variant],
        active && "border-primary bg-primary/20 text-accent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
