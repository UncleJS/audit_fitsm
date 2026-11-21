// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import "./globals.css";
import type { ReactNode } from "react";
import SiteFooter from "./components/layout/site-footer";
import { THEME_INIT_SCRIPT } from "./lib/theme";

export const metadata = {
  title: "Audit FitSM",
  description: "FitSM assessment and audit workspace",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* The app ships its own dark theme; stop the Dark Reader extension from rewriting SVGs, which breaks hydration. */}
        <meta name="darkreader-lock" />
        {/* Applies the saved theme before first paint so the page does not flash the wrong theme. */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: constant inline script, no user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body suppressHydrationWarning className="flex min-h-screen flex-col">
        <div className="relative flex-1">
          <div className="app-shell-aura pointer-events-none absolute inset-0 -z-10" />
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
