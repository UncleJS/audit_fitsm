// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import PageShell from "../../components/layout/page-shell";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { apiFetch } from "../../lib/api";
import { flushPendingSaves } from "../../lib/pending-saves";

// Sign-out needs an explicit click: logout revokes every session of the user, so merely loading this page
// (for example from a link or redirect on another site) must not trigger it.
export default function LogoutPage() {
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    // Let any audit workspace finish saving before the session is revoked.
    await flushPendingSaves();
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // still leave the page if the API is unreachable
    }
    window.location.replace("/login");
  };

  return (
    <PageShell className="min-h-[calc(100vh-12rem)] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface-2/80 text-accent">
            <LogOut className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-fg">{signingOut ? "Signing out" : "Sign out?"}</h1>
            <p className="mt-2 text-sm text-muted">
              {signingOut
                ? "Clearing the session and returning to login."
                : "This ends your session on every device you are signed in on."}
            </p>
          </div>
          <div className="flex gap-3">
            <Button type="button" onClick={() => void signOut()} disabled={signingOut}>
              Sign out
            </Button>
            {!signingOut ? (
              <Link
                href="/"
                className="inline-flex items-center rounded-xl border border-border px-4 py-2 text-sm text-fg-secondary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Cancel
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
