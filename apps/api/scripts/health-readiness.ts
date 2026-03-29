// @ts-nocheck
import { spawnSync } from "node:child_process";
import type { RowDataPacket } from "mysql2";
import { config } from "../src/config";
import { getDb } from "../src/db";

type Mode = "basic" | "extended" | "strict";

const modeArg = String(process.argv[2] ?? "strict").toLowerCase();
if (!["basic", "extended", "strict"].includes(modeArg)) {
  throw new Error("Invalid mode. Use basic|extended|strict");
}
const mode = modeArg as Mode;

const apiBase = process.env.API_BASE_URL ?? `http://127.0.0.1:${config.appPort}`;
const webBase = process.env.WEB_BASE_URL ?? "http://127.0.0.1:1260";
const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD ?? "ChangeMe123!";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fail = (message: string): never => {
  throw new Error(message);
};

const waitForHttp = async (
  url: string,
  label: string,
  options?: { attempts?: number; delayMs?: number; accept?: (res: Response) => boolean }
): Promise<Response> => {
  const attempts = Math.max(1, options?.attempts ?? 45);
  const delayMs = Math.max(100, options?.delayMs ?? 1000);
  const accept = options?.accept ?? ((res: Response) => res.ok);

  let lastError = "";
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (accept(response)) {
        return response;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (i < attempts) {
      await sleep(delayMs);
    }
  }

  fail(`${label} failed after ${attempts} attempts (${lastError || "unknown error"})`);
};

const main = async () => {
  const db = getDb();
  const checks: string[] = [];

  // DB readiness
  const [dbRows] = await db.query<RowDataPacket[]>("SELECT 1 AS db_ok");
  if (Number(dbRows?.[0]?.db_ok ?? 0) !== 1) {
    fail("DB ping failed");
  }
  checks.push("db:ping");

  const [migrationRows] = await db.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS applied_count FROM schema_migrations"
  );
  const appliedCount = Number(migrationRows?.[0]?.applied_count ?? 0);
  if (appliedCount < 1) {
    fail("No migrations have been applied");
  }
  checks.push(`db:migrations:${appliedCount}`);

  // API health + readiness
  const healthRes = await waitForHttp(`${apiBase}/health`, "API health", {
    accept: (res) => res.status === 200
  });
  const healthJson = await healthRes.json();
  if (String(healthJson?.status ?? "") !== "ok") {
    fail(`Unexpected /health payload: ${JSON.stringify(healthJson)}`);
  }
  checks.push("api:health");

  const readyRes = await waitForHttp(`${apiBase}/ready`, "API readiness", {
    accept: (res) => res.status === 200
  });
  const readyJson = await readyRes.json();
  if (String(readyJson?.status ?? "") !== "ready") {
    fail(`Unexpected /ready payload: ${JSON.stringify(readyJson)}`);
  }
  checks.push("api:ready");

  // Web check (Next dev can warm up on first request)
  await waitForHttp(webBase, "Web UI", {
    attempts: 90,
    delayMs: 1000,
    accept: (res) => res.status >= 200 && res.status < 400
  });
  checks.push("web:http");

  if (mode === "extended" || mode === "strict") {
    const loginRes = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
      signal: AbortSignal.timeout(7000)
    });
    if (!loginRes.ok) {
      fail(`Auth login failed: ${loginRes.status} ${await loginRes.text()}`);
    }

    const loginJson = await loginRes.json();
    const token = String(loginJson?.accessToken ?? "");
    if (!token) {
      fail("Auth login returned empty accessToken");
    }

    const meRes = await fetch(`${apiBase}/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(7000)
    });
    if (!meRes.ok) {
      fail(`GET /me failed: ${meRes.status} ${await meRes.text()}`);
    }
    checks.push("auth:login+me");
  }

  if (mode === "strict") {
    const run = spawnSync("bun", ["scripts/integration-suite.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        API_BASE_URL: apiBase,
        TEST_ADMIN_EMAIL: adminEmail,
        TEST_ADMIN_PASSWORD: adminPassword
      },
      stdio: "inherit"
    });

    if (run.status !== 0) {
      fail(`integration-suite failed with exit code ${run.status ?? "unknown"}`);
    }
    checks.push("integration:suite");
  }

  await db.end();

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        apiBase,
        webBase,
        checks
      },
      null,
      2
    )
  );
};

await main();
