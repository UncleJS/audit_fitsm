// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import type { ReactNode } from "react";
import ThemeToggle from "../components/layout/theme-toggle";

/** Layout for sign-in and sign-out: no navigation and no session keepalive. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex justify-end px-4 pt-4 sm:px-6 lg:px-8">
        <ThemeToggle />
      </div>
      {children}
    </>
  );
}
