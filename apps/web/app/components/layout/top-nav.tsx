"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../ui/cn";

const navItems = [
  { href: "/clients", label: "Dashboard" },
  { href: "/admin", label: "Admin" },
  { href: "/logout", label: "Logout" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/clients" className="flex items-center gap-3 text-slate-50">
          <span className="flex size-10 items-center justify-center rounded-2xl border border-sky-500/40 bg-sky-500/10 text-sky-200">
            <ShieldCheck className="size-5" />
          </span>
          <span>
            <strong className="block text-sm font-semibold tracking-[0.18em] text-sky-200 uppercase">
              Audit FitSM
            </strong>
            <span className="block text-xs text-slate-400">Assessment workspace</span>
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
                  "rounded-xl border px-3 py-2 text-sm font-medium transition",
                  active
                    ? "border-sky-400/60 bg-sky-500/10 text-sky-100"
                    : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-600 hover:text-slate-100",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
