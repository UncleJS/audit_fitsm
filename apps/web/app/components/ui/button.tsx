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
    "border border-sky-400/70 bg-sky-500 text-slate-950 shadow-[0_0_0_1px_rgba(125,211,252,0.2)] hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-300",
  secondary:
    "border border-slate-700 bg-slate-900/80 text-slate-100 hover:border-slate-500 hover:bg-slate-800 disabled:text-slate-500",
  ghost:
    "border border-transparent bg-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-900/80 disabled:text-slate-500",
  danger: "border border-rose-400/60 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 disabled:text-rose-300/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
};

export function Button({ className, variant = "primary", size = "md", active, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 disabled:cursor-not-allowed disabled:opacity-60",
        sizeClasses[size],
        variantClasses[variant],
        active && "border-sky-300 bg-sky-400/20 text-sky-100",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
