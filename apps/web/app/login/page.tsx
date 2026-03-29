// @ts-nocheck
"use client";

import { FormEvent, useEffect, useState } from "react";

const apiUrlFromEnv = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";
const defaultApiUrl = apiUrlFromEnv || "http://127.0.0.1:1261";

export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  const [apiUrl, setApiUrl] = useState(defaultApiUrl);
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!apiUrlFromEnv) {
      setApiUrl(`${window.location.protocol}//${window.location.hostname}:1261`);
    }

    const token = window.sessionStorage.getItem("audit_fitsm_token") || "";
    if (token) {
      window.location.href = "/clients";
      return;
    }

    setMounted(true);
  }, []);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);

    try {
      const res = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "Login failed.");
        return;
      }

      const body = await res.json();
      const token = String(body.accessToken ?? "");
      if (!token) {
        setMessage("Login failed: missing access token.");
        return;
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("audit_fitsm_token", token);
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
        <main className="container grid" suppressHydrationWarning>
          <section className="card">
            <p>Loading…</p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <style jsx global>{`
        header, footer { display: none !important; }
      `}</style>
      <main className="container grid" suppressHydrationWarning>
        <section className="card">
          <form onSubmit={login} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" type="email" required />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
              type="password"
              required
            />
            <button type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Login"}
            </button>
          </form>
          {message ? <p style={{ color: "#ff9b9b" }}>{message}</p> : null}
        </section>
      </main>
    </>
  );
}
