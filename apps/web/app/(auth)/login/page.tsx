// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { LockKeyhole } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import PageShell from "../../components/layout/page-shell";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { apiErrorMessage, apiFetch, ensureSession, NETWORK_ERROR_MESSAGE } from "../../lib/api";
import { safeNextPath } from "../../lib/redirect";

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /** Where to go after sign-in: the `next` query parameter if it is a safe relative path, else "/". */
  const nextPath = (): string => safeNextPath(new URLSearchParams(window.location.search).get("next"));

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const me = await ensureSession();
        if (cancelled) return;
        if (me) {
          window.location.replace(nextPath());
          return;
        }
      } catch {
        // Show the form when the API cannot be reached.
      }
      if (!cancelled) setMounted(true);
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);

    try {
      let res: Response;
      try {
        res = await apiFetch("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      } catch {
        setMessage(NETWORK_ERROR_MESSAGE);
        return;
      }

      if (!res.ok) {
        if (res.status === 429) {
          setMessage(await apiErrorMessage(res, "Too many sign-in attempts. Wait a moment and try again."));
        } else if (res.status === 401) {
          setMessage(await apiErrorMessage(res, "Invalid email or password."));
        } else {
          setMessage(await apiErrorMessage(res, "Login failed."));
        }
        return;
      }

      // The session cookie is set by the API; the response body carries no token.
      window.location.replace(nextPath());
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <PageShell className="min-h-[calc(100vh-12rem)] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center text-sm text-muted">Loading…</CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell className="min-h-[calc(100vh-12rem)] items-center justify-center">
      <Card className="w-full max-w-md border-primary/20 bg-surface/85">
        <CardContent className="space-y-6 p-8">
          <div className="space-y-3 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-accent">
              <LockKeyhole className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-fg">Sign in</h1>
              <p className="mt-2 text-sm text-muted">Access the FitSM audit dashboard, workspace, and admin tools.</p>
            </div>
          </div>

          <form onSubmit={login} className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium text-fg-secondary">
                Email
              </label>
              <input
                id="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                type="email"
                autoComplete="username"
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="text-sm font-medium text-fg-secondary">
                Password
              </label>
              <input
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" disabled={submitting} className="w-full justify-center">
              {submitting ? "Signing in..." : "Login"}
            </Button>
          </form>

          {message ? (
            <div
              role="alert"
              className="rounded-2xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger-fg"
            >
              {message}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </PageShell>
  );
}
