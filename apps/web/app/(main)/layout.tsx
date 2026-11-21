// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import type { ReactNode } from "react";
import SessionKeepalive from "../components/layout/session-keepalive";
import TopNav from "../components/layout/top-nav";

/** Layout for authenticated pages: top navigation and background session refresh. */
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionKeepalive />
      <TopNav />
      <div className="mx-auto w-full px-4 py-4 sm:px-6 lg:px-8">
        <div className="app-page-canvas min-h-[calc(100vh-12rem)] rounded-[32px] border border-border/60">
          {children}
        </div>
      </div>
    </>
  );
}
