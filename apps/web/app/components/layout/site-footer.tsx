// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

/** Shared site footer, rendered once by the root layout on every page. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-border/80 px-4 py-6 text-center text-sm text-muted sm:px-6 lg:px-8">
      <p>
        © 2026 UncleJS — Licensed under{" "}
        <a
          href="https://www.gnu.org/licenses/agpl-3.0.txt"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-fg"
        >
          AGPL-3.0-or-later
        </a>
      </p>
      <p className="mt-2">
        FitSM framework attribution:{" "}
        <a
          href="https://www.fitsm.eu/"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2 hover:text-fg"
        >
          https://www.fitsm.eu/
        </a>
      </p>
    </footer>
  );
}
