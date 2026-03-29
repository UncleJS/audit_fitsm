// @ts-nocheck
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Audit FitSM",
  description: "FitSM assessment and audit workspace"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <header style={{ borderBottom: "1px solid #2a355f", background: "#0d1630", position: "sticky", top: 0, zIndex: 5 }}>
          <nav
            aria-label="Primary"
            style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 20px", flexWrap: "wrap" }}
          >
            <strong style={{ marginRight: 8 }}>Audit FitSM</strong>
            <a href="/clients">Clients</a>
            <span aria-hidden="true">|</span>
            <a href="/admin">Admin</a>
            <span aria-hidden="true">|</span>
            <a href="/logout">Logout</a>
          </nav>
        </header>
        {children}
        <footer style={{ borderTop: "1px solid #2a355f", marginTop: 24, padding: 16, textAlign: "center" }}>
          <div style={{ marginBottom: 8 }}>
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img
                alt="License Badge"
                src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg"
              />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="Runtime Badge" src="https://img.shields.io/badge/runtime-Bun-black" />
            </a>{" "}
            <a href="https://img.shields.io" target="_blank" rel="noreferrer">
              <img alt="Database Badge" src="https://img.shields.io/badge/database-MariaDB-003545" />
            </a>
          </div>
          <div>
            © Audit FitSM contributors. Licensed under{" "}
            <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">
              CC BY-NC-SA 4.0
            </a>
            .
          </div>
        </footer>
      </body>
    </html>
  );
}
