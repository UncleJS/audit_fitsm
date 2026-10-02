"use client";

import { LockKeyhole } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import PageShell from "../components/layout/page-shell";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { apiFetch, ensureSession } from "../lib/api";

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const me = await ensureSession();
        if (cancelled) return;
        if (me) {
          window.location.href = "/clients";
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
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(body.error ?? "Login failed.");
        return;
      }

      window.location.href = "/clients";
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <>
        <style jsx global>{`
          header, footer { display: none !important; }
        `}</style>
        <PageShell className="min-h-[calc(100vh-3rem)] items-center justify-center">
          <Card className="w-full max-w-md">
            <CardContent className="p-8 text-center text-sm text-slate-400">Loading…</CardContent>
          </Card>
        </PageShell>
      </>
    );
  }

  return (
    <>
      <style jsx global>{`
        header, footer { display: none !important; }
      `}</style>
      <PageShell className="min-h-[calc(100vh-3rem)] items-center justify-center">
        <Card className="w-full max-w-md border-sky-500/20 bg-slate-950/85">
          <CardContent className="space-y-6 p-8">
            <div className="space-y-3 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-200">
                <LockKeyhole className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-50">Sign in</h1>
                <p className="mt-2 text-sm text-slate-400">
                  Access the FitSM audit dashboard, workspace, and admin tools.
                </p>
              </div>
            </div>

            <form onSubmit={login} className="grid gap-4">
              <div className="grid gap-2">
                <label htmlFor="email" className="text-sm font-medium text-slate-300">
                  Email
                </label>
                <input
                  id="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  type="email"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="password" className="text-sm font-medium text-slate-300">
                  Password
                </label>
                <input
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  type="password"
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
                className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
              >
                {message}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </PageShell>
    </>
  );
}
