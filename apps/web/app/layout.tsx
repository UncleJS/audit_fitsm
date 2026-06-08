// @ts-nocheck
import "./globals.css";
import type { ReactNode } from "react";
import TopNav from "./components/layout/top-nav";

export const metadata = {
  title: "Audit FitSM",
  description: "FitSM assessment and audit workspace"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className="min-h-screen">
        <div className="relative min-h-screen">
          <div className="app-shell-aura pointer-events-none absolute inset-0 -z-10" />
          <TopNav />
          <div className="mx-auto w-full max-w-[1664px] px-4 py-4 sm:px-6 lg:px-8">
            <div className="app-page-canvas min-h-[calc(100vh-12rem)] rounded-[32px] border border-slate-800/60">
              {children}
            </div>
          </div>
          <footer className="border-t border-slate-800/80 px-4 py-8 text-center text-sm text-foreground sm:px-6 lg:px-8">
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img
                alt="License Badge"
                src="https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg"
              />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="Frontend Badge" src="https://img.shields.io/badge/frontend-Next.js-000000?logo=nextdotjs" />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="API Badge" src="https://img.shields.io/badge/api-Elysia-1f2937" />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="Runtime Badge" src="https://img.shields.io/badge/runtime-Bun-black" />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="Database Badge" src="https://img.shields.io/badge/database-MariaDB-003545" />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="Container Badge" src="https://img.shields.io/badge/container-Podman-892CA0?logo=podman" />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="Mode Badge" src="https://img.shields.io/badge/mode-rootless-2ea44f" />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="DB Admin Badge" src="https://img.shields.io/badge/db_admin-phpMyAdmin-6C78AF" />
            </a>
            </div>
            <div>
              © Audit FitSM contributors. Licensed under{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
                CC BY 4.0
              </a>
              .
            </div>
            <div className="mt-2">
              FitSM framework attribution:{" "}
              <a href="https://www.fitsm.eu/" target="_blank" rel="noreferrer">
                https://www.fitsm.eu/
              </a>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
