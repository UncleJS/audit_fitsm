// @ts-nocheck
"use client";

import { useEffect } from "react";
import { LogOut } from "lucide-react";
import PageShell from "../components/layout/page-shell";
import { Card, CardContent } from "../components/ui/card";

export default function LogoutPage() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem("audit_fitsm_token");
    window.location.href = "/login";
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
              <h1 className="text-xl font-semibold text-foreground">Signing out</h1>
              <p className="mt-2 text-sm text-foreground">Clearing the current session and returning to login.</p>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    </>
  );
}
