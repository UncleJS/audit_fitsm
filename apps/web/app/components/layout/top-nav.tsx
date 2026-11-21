// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui/cn";
import ThemeToggle from "./theme-toggle";

const navItems = [
  { href: "/clients", label: "Dashboard" },
  { href: "/admin", label: "Admin" },
  { href: "/logout", label: "Logout" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-surface/85 backdrop-blur">
      <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/clients"
          className="flex items-center gap-3 rounded-2xl text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span className="flex size-10 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10 text-accent">
            <ShieldCheck className="size-5" />
          </span>
          <span>
            <strong className="block text-sm font-semibold tracking-[0.18em] text-accent uppercase">Audit FitSM</strong>
            <span className="block text-xs text-muted">Assessment workspace</span>
          </span>
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => {
            const active =
              item.href === "/clients"
                ? pathname === "/" || pathname === "/clients" || pathname?.startsWith("/audits/")
                : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  active
                    ? "border-primary/60 bg-primary/10 text-accent"
                    : "border-border bg-surface/60 text-fg-secondary hover:border-border-strong hover:text-fg",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
