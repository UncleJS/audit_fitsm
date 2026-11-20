// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, DEFAULT_THEME, isTheme, type Theme } from "../../lib/theme";

/** Header button that switches between the dark (default) and light themes and remembers the choice. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    // The inline head script has already applied the saved theme; mirror it in state.
    const current = document.documentElement.dataset.theme;
    setTheme(isTheme(current) ? current : DEFAULT_THEME);
  }, []);

  const isLight = theme === "light";
  const toggle = () => {
    const next: Theme = isLight ? "dark" : "light";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Light theme"
      aria-pressed={isLight}
      title={isLight ? "Switch to dark theme" : "Switch to light theme"}
      className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-surface/60 text-fg-secondary transition hover:border-border-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {isLight ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
    </button>
  );
}
