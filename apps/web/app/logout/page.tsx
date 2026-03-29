// @ts-nocheck
"use client";

import { useEffect } from "react";

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
      <main className="container grid" suppressHydrationWarning>
        <section className="card">
          <p>Signing out…</p>
        </section>
      </main>
    </>
  );
}
