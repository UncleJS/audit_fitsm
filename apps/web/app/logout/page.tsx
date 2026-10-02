"use client";

import { LogOut } from "lucide-react";
import { useEffect } from "react";
import PageShell from "../components/layout/page-shell";
import { Card, CardContent } from "../components/ui/card";
import { apiFetch } from "../lib/api";

export default function LogoutPage() {
  useEffect(() => {
    let cancelled = false;
    const signOut = async () => {
      try {
        await apiFetch("/auth/logout", { method: "POST" });
      } catch {
        // still leave the page if the API is unreachable
      }
      if (!cancelled) {
        window.location.href = "/login";
      }
    };
    void signOut();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <style jsx global>{`
        header, footer { display: none !important; }
      `}</style>
      <PageShell className="min-h-[calc(100vh-3rem)] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/80 text-sky-200">
              <LogOut className="size-6" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-slate-50">Signing out</h1>
              <p className="mt-2 text-sm text-slate-400">Clearing the current session and returning to login.</p>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    </>
  );
}
