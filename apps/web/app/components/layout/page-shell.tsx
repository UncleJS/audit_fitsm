// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import type { ReactNode } from "react";
import { cn } from "../ui/cn";

export default function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8", className)}>{children}</main>
  );
}
