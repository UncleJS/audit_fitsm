// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { usePathname } from "next/navigation";
import { useSessionKeepalive } from "../../lib/use-session-keepalive";

const UNAUTHENTICATED_PATHS = new Set(["/login", "/logout"]);

/** Refreshes the cookie session in the background on every authenticated page. */
export default function SessionKeepalive() {
  const pathname = usePathname();
  useSessionKeepalive(!UNAUTHENTICATED_PATHS.has(pathname ?? ""));
  return null;
}
