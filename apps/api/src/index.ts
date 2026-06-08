// @ts-nocheck
import { mkdir, readFile as readFileFs, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Elysia from "elysia";
import { jwt } from "@elysiajs/jwt";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "./config";
import { getDb } from "./db";
import { hasRole, type RoleCode } from "./rbac";
import { buildAuditPdfReport } from "./pdf-report";

type AuthPayload = {
  sub: number;
  email: string;
  name: string;
  orgRoles: Record<string, string[]>;
  tokenVersion: number;
};

const openApiDoc = JSON.parse(
  await readFileFs(new URL("../openapi/openapi.json", import.meta.url), "utf8")
);

const db = getDb();

// Runs fn inside a single transaction, committing on success and rolling back
// on any error so multi-statement writes never leave partial state.
async function withTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback failure; original error is rethrown below
    }
    throw err;
  } finally {
    conn.release();
  }
}

const corsAllowedOrigins = new Set(config.cors.allowedOrigins);
let tokenVersionColumnExistsPromise: Promise<boolean> | null = null;
const tableExistsPromiseByName = new Map<string, Promise<boolean>>();

const swaggerCsp = [
  "default-src 'self'",
  "style-src 'self' https://unpkg.com 'unsafe-inline'",
  "script-src 'self' https://unpkg.com 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' https://unpkg.com data:",
  "frame-ancestors 'none'"
].join("; ");

const defaultCsp = "default-src 'self'; frame-ancestors 'none'";

const hasTable = async (tableName: string): Promise<boolean> => {
  if (!tableExistsPromiseByName.has(tableName)) {
    tableExistsPromiseByName.set(
      tableName,
      db
        .query<RowDataPacket[]>(
          `SELECT 1
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = ?
             AND TABLE_NAME = ?
           LIMIT 1`,
          [config.db.database, tableName]
        )
        .then(([rows]) => rows.length > 0)
        .catch(() => false)
    );
  }

  return tableExistsPromiseByName.get(tableName)!;
};

// NOTE: the result is cached for the process lifetime. A migration that adds the
// token_version column while the API is running will not be observed until the
// process restarts; restart the API after applying migrations.
const hasTokenVersionColumn = async (): Promise<boolean> => {
  tokenVersionColumnExistsPromise ??= db
    .query<RowDataPacket[]>(
      `SELECT 1
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'token_version'
       LIMIT 1`,
      [config.db.database]
    )
    .then(([rows]) => rows.length > 0)
    .catch(() => false);

  return tokenVersionColumnExistsPromise;
};

const buildOrgRoles = (roleRows: RowDataPacket[]): Record<string, string[]> => {
  const orgRoles: Record<string, string[]> = {};
  for (const roleRow of roleRows) {
    const key = String(roleRow.org_id);
    if (!orgRoles[key]) {
      orgRoles[key] = [];
    }
    orgRoles[key].push(String(roleRow.role_code));
  }
  return orgRoles;
};

const revokeUserSessions = async (userId: number): Promise<void> => {
  if (await hasTokenVersionColumn()) {
    await db.execute(
      `UPDATE users
       SET token_version = token_version + 1,
           updated_at_UTC = UTC_TIMESTAMP(3)
       WHERE id = ? AND archived_at_UTC IS NULL`,
      [userId]
    );
    return;
  }

  await db.execute(
    `UPDATE users
     SET updated_at_UTC = UTC_TIMESTAMP(3)
     WHERE id = ? AND archived_at_UTC IS NULL`,
    [userId]
  );
};

const recordAuditEvent = async (
  auditId: number,
  eventType: string,
  actorUserId: number,
  oldValue: unknown,
  newValue: unknown,
  entityType: "audit" | "detail" | "conclusion" | "status" | "assessment" = "audit",
  entityKey: string | null = null
): Promise<void> => {
  if (!(await hasTable("audit_events"))) {
    return;
  }

  await db.execute(
    `INSERT INTO audit_events
     (audit_id, event_type, entity_type, entity_key, old_value_json, new_value_json, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      auditId,
      eventType,
      entityType,
      entityKey,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
      actorUserId
    ]
  );
};

const getContentSecurityPolicy = (request: Request): string => {
  const pathname = new URL(request.url).pathname;
  return pathname === "/docs" ? swaggerCsp : defaultCsp;
};

const applyCorsHeaders = (set: any, request: Request): void => {
  const origin = request.headers.get("origin");
  if (!origin) return;

  const allowAny = corsAllowedOrigins.has("*");
  const sameHostWebOrigin = (() => {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(request.url);
      return originUrl.hostname === requestUrl.hostname && originUrl.port === "1260";
    } catch {
      return false;
    }
  })();

  if (!allowAny && !corsAllowedOrigins.has(origin) && !sameHostWebOrigin) return;

  set.headers["Access-Control-Allow-Origin"] = allowAny ? "*" : origin;
  set.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
  set.headers["Access-Control-Allow-Headers"] = "authorization,content-type";
  set.headers["Access-Control-Expose-Headers"] = "x-total-count";
  set.headers["Access-Control-Max-Age"] = "86400";
  set.headers["Vary"] = "Origin";
};

const extractBearer = (authorization?: string): string | null => {
  if (!authorization) return null;
  if (!authorization.startsWith("Bearer ")) return null;
  return authorization.slice(7).trim();
};

const hasOrgRole = (auth: AuthPayload | null, orgId: number, minimumRole: RoleCode): boolean => {
  if (!auth) return false;
  const allRoles = [
    ...(auth.orgRoles[String(orgId)] ?? []),
    ...(Object.values(auth.orgRoles).flat().includes("system_admin") ? ["system_admin"] : [])
  ];

  return hasRole(allRoles, minimumRole);
};

const isSystemAdmin = (auth: AuthPayload | null): boolean => {
  if (!auth) return false;
  return Object.values(auth.orgRoles).flat().includes("system_admin");
};

const getUserScope = async (
  userId: number
): Promise<{ orgIds: number[]; hasSystemAdmin: boolean }> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT our.org_id, r.code AS role_code
     FROM org_user_roles our
     JOIN roles r ON r.id = our.role_id AND r.archived_at_UTC IS NULL
     WHERE our.user_id = ?
       AND our.archived_at_UTC IS NULL`,
    [userId]
  );

  const orgIds = Array.from(new Set(rows.map((row) => Number(row.org_id)).filter((value) => Number.isFinite(value))));
  const hasSystemAdminRole = rows.some((row) => String(row.role_code) === "system_admin");

  return {
    orgIds,
    hasSystemAdmin: hasSystemAdminRole
  };
};

const getAccessibleOrgIds = (auth: AuthPayload | null): number[] => {
  if (!auth) return [];
  return Object.entries(auth.orgRoles)
    .filter(([, roles]) => roles.length > 0)
    .map(([orgId]) => Number(orgId))
    .filter((value) => Number.isFinite(value));
};

const getAuditMeta = async (
  auditId: number
): Promise<{ orgId: number; status: string } | null> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT org_id, status
     FROM audits
     WHERE id = ? AND archived_at_UTC IS NULL
     LIMIT 1`,
    [auditId]
  );

  if (!rows.length) return null;
  return {
    orgId: Number(rows[0].org_id),
    status: String(rows[0].status)
  };
};

const canAccessAudit = async (
  auth: AuthPayload | null,
  auditId: number,
  minimumRole: RoleCode,
  options?: { requireUnlockedForWrite?: boolean }
): Promise<{ allowed: boolean; orgId: number | null; status: string | null; reason?: string }> => {
  const meta = await getAuditMeta(auditId);
  if (!meta) return { allowed: false, orgId: null, status: null };

  if (!hasOrgRole(auth, meta.orgId, minimumRole)) {
    return {
      allowed: false,
      orgId: meta.orgId,
      status: meta.status
    };
  }

  if (options?.requireUnlockedForWrite) {
    if (meta.status === "completed" && !hasOrgRole(auth, meta.orgId, "lead_auditor")) {
      return {
        allowed: false,
        orgId: meta.orgId,
        status: meta.status,
        reason: "Audit is completed and locked for non-lead roles"
      };
    }
  }

  return {
    allowed: true,
    orgId: meta.orgId,
    status: meta.status
  };
};

const allowedStatusTransitions = (currentStatus: string): string[] => {
  switch (currentStatus) {
    case "draft":
      return ["in_progress"];
    case "in_progress":
      return ["completed"];
    case "completed":
      return ["in_progress"];
    default:
      return [];
  }
};

const unauthorized = { error: "Unauthorized" };
const forbidden = { error: "Forbidden" };

const safeFileSegment = (value: string): string =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(/\r?\n/g, " ");
  if (/^[\t ]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const rowsToCsv = (rows: RowDataPacket[]): string => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape((row as any)[h])).join(","));
  }
  return lines.join("\n");
};

const fileTs = (): string => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const createClientSchema = z.object({
  name: z.string().trim().min(2).max(191)
});

const createAuditSchema = z.object({
  name: z.string().trim().min(2).max(255),
  auditDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  certGoalLevel: z.coerce.number().int().min(1).max(5).default(3)
});

const updateStatusSchema = z.object({
  status: z.enum(["draft", "in_progress", "completed"])
});

const createOrgUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(2).max(191),
  roles: z.array(z.string().min(1)).min(1)
});

const updateOrgUserRolesSchema = z.object({
  roles: z.array(z.string().min(1)).min(0)
});

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const checkRateLimit = (key: string): { allowed: boolean; retryAfterSec?: number } => {
  const now = Date.now();
  const windowMs = Math.max(1000, config.rateLimit.windowMs);
  const maxRequests = Math.max(1, config.rateLimit.maxRequests);

  const current = rateBuckets.get(key);
  if (!current || now >= current.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  }

  current.count += 1;
  rateBuckets.set(key, current);
  return { allowed: true };
};

// Per-account failed-login throttling. The IP rate limiter alone does not stop
// a distributed brute force against a single account, so failures are also
// counted per email and the account is briefly locked once the threshold is hit.
const failedLoginBuckets = new Map<string, { count: number; resetAt: number }>();
const maxFailedLogins = Math.max(1, Number(process.env.LOGIN_MAX_FAILED ?? 5));
const failedLoginWindowMs = Math.max(1000, Number(process.env.LOGIN_LOCKOUT_WINDOW_MS ?? 15 * 60 * 1000));

const loginLockKey = (email: string): string => email.trim().toLowerCase();

const isLoginLocked = (email: string): { locked: boolean; retryAfterSec?: number } => {
  const bucket = failedLoginBuckets.get(loginLockKey(email));
  if (!bucket || Date.now() >= bucket.resetAt) {
    return { locked: false };
  }
  if (bucket.count >= maxFailedLogins) {
    return { locked: true, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000)) };
  }
  return { locked: false };
};

const registerFailedLogin = (email: string): void => {
  const key = loginLockKey(email);
  const now = Date.now();
  const bucket = failedLoginBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    failedLoginBuckets.set(key, { count: 1, resetAt: now + failedLoginWindowMs });
    return;
  }
  bucket.count += 1;
  failedLoginBuckets.set(key, bucket);
};

const clearFailedLogins = (email: string): void => {
  failedLoginBuckets.delete(loginLockKey(email));
};

// Bounded pagination for list endpoints. Defaults keep responses small and cap
// the maximum page size so a single request cannot pull an unbounded result set.
const parsePagination = (
  query: Record<string, unknown> | undefined,
  opts?: { defaultLimit?: number; maxLimit?: number }
): { limit: number; offset: number } => {
  const defaultLimit = opts?.defaultLimit ?? 50;
  const maxLimit = opts?.maxLimit ?? 200;
  const rawLimit = Number((query as any)?.limit);
  const rawOffset = Number((query as any)?.offset);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now >= bucket.resetAt) {
      rateBuckets.delete(key);
    }
  }
  for (const [key, bucket] of failedLoginBuckets.entries()) {
    if (now >= bucket.resetAt) {
      failedLoginBuckets.delete(key);
    }
  }
}, 30000).unref?.();

const app = new Elysia()
  .use(
    jwt({
      name: "jwt",
      secret: config.jwtSecret
    })
  )
  .onRequest(({ set, request }) => {
    applyCorsHeaders(set, request);

    if (request.method === "OPTIONS") {
      set.status = 204;
      return "";
    }

    const ip = String(request.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    const method = request.method;
    const route = new URL(request.url).pathname;
    const bucketKey = `${ip}:${method}:${route}`;
    const rate = checkRateLimit(bucketKey);

    if (!rate.allowed) {
      set.status = 429;
      set.headers["retry-after"] = String(rate.retryAfterSec ?? 1);
      return { error: "Rate limit exceeded" };
    }
  })
  .onAfterHandle(({ set, request }) => {
    applyCorsHeaders(set, request);
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["x-frame-options"] = "DENY";
    set.headers["referrer-policy"] = "same-origin";
    set.headers["x-permitted-cross-domain-policies"] = "none";
    set.headers["content-security-policy"] = getContentSecurityPolicy(request);
  })
  .derive(async ({ headers, jwt }) => {
    const token = extractBearer(headers.authorization);
    if (!token) {
      return { auth: null as AuthPayload | null };
    }

    const payload = await jwt.verify(token);
    if (!payload || typeof payload !== "object") {
      return { auth: null as AuthPayload | null };
    }

    const exp = Number((payload as any).exp ?? 0);
    if (exp && Date.now() >= exp * 1000) {
      return { auth: null as AuthPayload | null };
    }

    const userId = Number((payload as any).sub);
    const tokenVersion = Number((payload as any).tokenVersion);
    if (!Number.isInteger(userId) || !Number.isInteger(tokenVersion)) {
      return { auth: null as AuthPayload | null };
    }

    const tokenVersionColumnExists = await hasTokenVersionColumn();
    const [userRows] = await db.query<RowDataPacket[]>(
      tokenVersionColumnExists
        ? `SELECT id, email, display_name, is_active, token_version
           FROM users
           WHERE id = ? AND archived_at_UTC IS NULL
           LIMIT 1`
        : `SELECT id, email, display_name, is_active
           FROM users
           WHERE id = ? AND archived_at_UTC IS NULL
           LIMIT 1`,
      [userId]
    );

    if (!userRows.length) {
      return { auth: null as AuthPayload | null };
    }

    const user = userRows[0];
    if (Number(user.is_active) !== 1) {
      return { auth: null as AuthPayload | null };
    }

    if (tokenVersionColumnExists && Number(user.token_version) !== tokenVersion) {
      return { auth: null as AuthPayload | null };
    }

    return {
      auth: {
        sub: userId,
        email: String(user.email),
        name: String(user.display_name),
        orgRoles: ((payload as any).orgRoles ?? {}) as Record<string, string[]>,
        tokenVersion
      } satisfies AuthPayload
    };
  })
  .options("/*", ({ set, request }) => {
    applyCorsHeaders(set, request);
    set.status = 204;
    return "";
  })
  .options("*", ({ set, request }) => {
    applyCorsHeaders(set, request);
    set.status = 204;
    return "";
  })
  .get("/health", () => ({ status: "ok", service: "audit-fitsm-api" }))
  .get("/ready", async ({ set }) => {
    const startedAt = Date.now();
    try {
      const [dbRows] = await db.query<RowDataPacket[]>("SELECT 1 AS db_ok");
      const dbOk = Number(dbRows?.[0]?.db_ok ?? 0) === 1;
      if (!dbOk) {
        throw new Error("Database ping failed");
      }

      const [migrationRows] = await db.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS applied_count FROM schema_migrations"
      );

      return {
        status: "ready",
        checks: {
          db: {
            status: "ok",
            latencyMs: Date.now() - startedAt
          },
          migrations: {
            status: "ok",
            appliedCount: Number(migrationRows?.[0]?.applied_count ?? 0)
          }
        }
      };
    } catch (error) {
      set.status = 503;
      return {
        status: "not_ready",
        error: error instanceof Error ? error.message : "Unknown readiness failure"
      };
    }
  })
  .get("/openapi.json", ({ auth, set }) => {
    if (process.env.NODE_ENV === "production" && !auth) {
      set.status = 401;
      return unauthorized;
    }
    return openApiDoc;
  })
  .get("/docs", ({ set, auth }) => {
    if (process.env.NODE_ENV === "production" && !auth) {
      set.status = 401;
      return unauthorized;
    }

    set.headers["content-type"] = "text/html; charset=utf-8";
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Audit FitSM API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui'
      });
    </script>
  </body>
</html>`;
  })
  .post("/auth/login", async ({ body, set, jwt }) => {
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: "Invalid login payload", details: parsed.error.flatten() };
    }
    const payload = parsed.data;

    const lock = isLoginLocked(payload.email);
    if (lock.locked) {
      set.status = 429;
      if (lock.retryAfterSec) set.headers["retry-after"] = String(lock.retryAfterSec);
      return { error: "Too many failed login attempts. Try again later." };
    }

    const tokenVersionColumnExists = await hasTokenVersionColumn();
    const [users] = await db.query<RowDataPacket[]>(
      tokenVersionColumnExists
        ? `SELECT id, email, password_hash, display_name, auth_provider, is_active, token_version
           FROM users
           WHERE email = ? AND archived_at_UTC IS NULL
           LIMIT 1`
        : `SELECT id, email, password_hash, display_name, auth_provider, is_active
           FROM users
           WHERE email = ? AND archived_at_UTC IS NULL
           LIMIT 1`,
      [payload.email]
    );

    if (!users.length || users[0].auth_provider !== "local" || !users[0].is_active) {
      registerFailedLogin(payload.email);
      set.status = 401;
      return { error: "Invalid credentials" };
    }

    const valid = await Bun.password.verify(payload.password, String(users[0].password_hash));
    if (!valid) {
      registerFailedLogin(payload.email);
      set.status = 401;
      return { error: "Invalid credentials" };
    }

    clearFailedLogins(payload.email);

    const [roleRows] = await db.query<RowDataPacket[]>(
      `SELECT our.org_id, r.code AS role_code
       FROM org_user_roles our
       JOIN roles r ON r.id = our.role_id AND r.archived_at_UTC IS NULL
       WHERE our.user_id = ? AND our.archived_at_UTC IS NULL`,
      [users[0].id]
    );

    const orgRoles = buildOrgRoles(roleRows);
    const nowSec = Math.floor(Date.now() / 1000);

    const token = await jwt.sign({
      sub: Number(users[0].id),
      email: String(users[0].email),
      name: String(users[0].display_name),
      orgRoles,
      tokenVersion: Number(users[0].token_version ?? 1),
      iat: nowSec,
      exp: nowSec + config.jwtTtlSec
    } satisfies AuthPayload);

    await db.execute(
      "UPDATE users SET last_login_at_UTC = UTC_TIMESTAMP(3) WHERE id = ?",
      [users[0].id]
    );

    return { accessToken: token };
  })
  .get("/me", ({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    return auth;
  })
  .get("/clients", async ({ auth, query, set }) => {
    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const { limit, offset } = parsePagination(query);

    if (isSystemAdmin(auth)) {
      const [countRows] = await db.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM organizations WHERE archived_at_UTC IS NULL"
      );
      set.headers["x-total-count"] = String(Number(countRows[0]?.total ?? 0));

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id, name, created_at_UTC, updated_at_UTC
         FROM organizations
         WHERE archived_at_UTC IS NULL
         ORDER BY name ASC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      return rows;
    }

    const orgIds = getAccessibleOrgIds(auth);
    if (!orgIds.length) {
      set.headers["x-total-count"] = "0";
      return [];
    }

    const placeholders = orgIds.map(() => "?").join(",");
    set.headers["x-total-count"] = String(orgIds.length);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, name, created_at_UTC, updated_at_UTC
       FROM organizations
       WHERE archived_at_UTC IS NULL AND id IN (${placeholders})
       ORDER BY name ASC
       LIMIT ? OFFSET ?`,
      [...orgIds, limit, offset]
    );

    return rows;
  })
  .post("/clients", async ({ auth, body, set }) => {
    const parsed = createClientSchema.safeParse(body);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!isSystemAdmin(auth)) {
      set.status = 403;
      return forbidden;
    }
    if (!parsed.success) {
      set.status = 400;
      return { error: "Invalid client payload", details: parsed.error.flatten() };
    }
    const clientName = parsed.data.name;

    const [existingRows] = await db.query<RowDataPacket[]>(
      `SELECT id
       FROM organizations
       WHERE name = ? AND archived_at_UTC IS NULL
       LIMIT 1`,
      [clientName]
    );

    if (existingRows.length) {
      set.status = 409;
      return { error: "Client already exists" };
    }

    const orgId = await withTransaction(async (conn) => {
      const [insertOrg] = await conn.execute(
        `INSERT INTO organizations (name)
         VALUES (?)`,
        [clientName]
      );

      const newOrgId = Number((insertOrg as any).insertId);

      const [roleRows] = await conn.query<RowDataPacket[]>(
        `SELECT id
         FROM roles
         WHERE code = 'org_admin' AND archived_at_UTC IS NULL
         LIMIT 1`
      );

      if (roleRows.length) {
        await conn.execute(
          `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE created_at_UTC = org_user_roles.created_at_UTC`,
          [newOrgId, auth.sub, Number(roleRows[0].id), auth.sub]
        );
      }

      return newOrgId;
    });

    set.status = 201;
    return { id: orgId, name: clientName };
  })
  .get("/roles", async ({ auth, set }) => {
    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const includeSystemRole = isSystemAdmin(auth);
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT code, description
       FROM roles
       WHERE archived_at_UTC IS NULL
         ${includeSystemRole ? "" : "AND code <> 'system_admin'"}
       ORDER BY id ASC`
    );
    return rows;
  })
  .get("/orgs/:orgId/users", async ({ auth, params, query, set }) => {
    const orgId = Number(params.orgId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!hasOrgRole(auth, orgId, "org_admin")) {
      set.status = 403;
      return forbidden;
    }

    const { limit, offset } = parsePagination(query);

    const [countRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM users u
       JOIN org_user_roles our ON our.user_id = u.id AND our.org_id = ?
       WHERE u.archived_at_UTC IS NULL`,
      [orgId]
    );
    set.headers["x-total-count"] = String(Number(countRows[0]?.total ?? 0));

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         u.id,
         u.email,
         u.display_name,
         u.is_active,
         MAX(CASE WHEN our.archived_at_UTC IS NULL THEN 1 ELSE 0 END) AS has_active_org_roles,
         GROUP_CONCAT(
           DISTINCT CASE WHEN our.archived_at_UTC IS NULL AND r.archived_at_UTC IS NULL THEN r.code END
           ORDER BY r.id SEPARATOR ','
         ) AS roles_csv
       FROM users u
       JOIN org_user_roles our ON our.user_id = u.id AND our.org_id = ?
       LEFT JOIN roles r ON r.id = our.role_id
       WHERE u.archived_at_UTC IS NULL
       GROUP BY u.id, u.email, u.display_name, u.is_active
       ORDER BY u.display_name ASC, u.email ASC
       LIMIT ? OFFSET ?`,
      [orgId, limit, offset]
    );

    return rows.map((row) => ({
      id: Number(row.id),
      email: String(row.email),
      display_name: String(row.display_name),
      is_active: Number(row.is_active) === 1,
      has_active_org_roles: Number(row.has_active_org_roles) === 1,
      roles: String(row.roles_csv || "")
        .split(",")
        .map((role) => role.trim())
        .filter(Boolean)
    }));
  })
  .post("/orgs/:orgId/users", async ({ auth, params, body, set }) => {
    const orgId = Number(params.orgId);
    const parsed = createOrgUserSchema.safeParse(body);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!hasOrgRole(auth, orgId, "org_admin")) {
      set.status = 403;
      return forbidden;
    }
    if (!parsed.success) {
      set.status = 400;
      return { error: "Invalid user payload", details: parsed.error.flatten() };
    }

    const payload = parsed.data;

    const [existingUsers] = await db.query<RowDataPacket[]>(
      `SELECT id
       FROM users
       WHERE email = ? AND archived_at_UTC IS NULL
       LIMIT 1`,
      [payload.email]
    );

    const [roleRows] = await db.query<RowDataPacket[]>(
      `SELECT id, code
       FROM roles
       WHERE code IN (${payload.roles.map(() => "?").join(",")})
         AND archived_at_UTC IS NULL`,
      payload.roles
    );

    const roleCodes = roleRows.map((row) => String(row.code));
    const missingRoles = payload.roles.filter((role) => !roleCodes.includes(role));
    if (missingRoles.length) {
      set.status = 400;
      return { error: "Unknown role codes", missingRoles };
    }
    if (roleCodes.includes("system_admin")) {
      set.status = 403;
      return { error: "system_admin role cannot be assigned via org endpoint" };
    }

    const passwordHash = await Bun.password.hash(payload.password, {
      algorithm: "argon2id"
    });

    let userId: number;
    let shouldRevokeUserSessions = false;
    if (existingUsers.length) {
      userId = Number(existingUsers[0].id);

      const scope = await getUserScope(userId);
      const hasOtherOrgs = scope.orgIds.some((id) => id !== orgId);
      if (hasOtherOrgs && !scope.hasSystemAdmin) {
        set.status = 409;
        return {
          error: "User is already scoped to another client. Non-system-admin users can belong to only one client"
        };
      }

      await db.execute(
        `UPDATE users
         SET display_name = ?, password_hash = ?, is_active = 1, updated_at_UTC = UTC_TIMESTAMP(3)
         WHERE id = ? AND archived_at_UTC IS NULL`,
        [payload.displayName, passwordHash, userId]
      );
      shouldRevokeUserSessions = true;
    } else {
      const [insertUser] = await db.execute(
        `INSERT INTO users (email, password_hash, display_name, auth_provider)
         VALUES (?, ?, ?, 'local')`,
        [payload.email, passwordHash, payload.displayName]
      );
      userId = Number((insertUser as any).insertId);
    }

    for (const role of roleRows) {
      await db.execute(
        `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE archived_at_UTC = NULL, created_at_UTC = org_user_roles.created_at_UTC`,
        [orgId, userId, Number(role.id), auth.sub]
      );
    }

    if (shouldRevokeUserSessions) {
      await revokeUserSessions(userId);
    }

    set.status = 201;
    return { id: userId, email: payload.email, roles: roleCodes };
  })
  .put("/orgs/:orgId/users/:userId/roles", async ({ auth, params, body, set }) => {
    const orgId = Number(params.orgId);
    const userId = Number(params.userId);
    const parsed = updateOrgUserRolesSchema.safeParse(body);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!hasOrgRole(auth, orgId, "org_admin")) {
      set.status = 403;
      return forbidden;
    }
    if (!parsed.success) {
      set.status = 400;
      return { error: "Invalid roles payload", details: parsed.error.flatten() };
    }

    const roleCodesRequested = Array.from(new Set(parsed.data.roles));
    if (roleCodesRequested.includes("system_admin")) {
      set.status = 403;
      return { error: "system_admin role cannot be assigned via org endpoint" };
    }

    const [userRows] = await db.query<RowDataPacket[]>(
      `SELECT id FROM users WHERE id = ? AND archived_at_UTC IS NULL LIMIT 1`,
      [userId]
    );
    if (!userRows.length) {
      set.status = 404;
      return { error: "User not found" };
    }

    const [currentRoleRows] = await db.query<RowDataPacket[]>(
      `SELECT r.code
       FROM org_user_roles our
       JOIN roles r ON r.id = our.role_id AND r.archived_at_UTC IS NULL
       WHERE our.org_id = ?
         AND our.user_id = ?
         AND our.archived_at_UTC IS NULL
       ORDER BY r.code ASC`,
      [orgId, userId]
    );
    const currentRoleCodes = currentRoleRows.map((row) => String(row.code)).sort();

    if (roleCodesRequested.length === 0) {
      const [archiveResult] = await db.execute(
        `UPDATE org_user_roles
         SET archived_at_UTC = UTC_TIMESTAMP(3)
         WHERE org_id = ?
           AND user_id = ?
           AND archived_at_UTC IS NULL`,
        [orgId, userId]
      );

      if (Number((archiveResult as any).affectedRows ?? 0) > 0) {
        await revokeUserSessions(userId);
      }

      return { userId, roles: [], archivedInOrg: true };
    }

    const scope = await getUserScope(userId);
    const hasOtherOrgs = scope.orgIds.some((id) => id !== orgId);
    if (hasOtherOrgs && !scope.hasSystemAdmin) {
      set.status = 409;
      return {
        error: "User is already scoped to another client. Non-system-admin users can belong to only one client"
      };
    }

    const [roleRows] = await db.query<RowDataPacket[]>(
      `SELECT id, code
       FROM roles
       WHERE code IN (${roleCodesRequested.map(() => "?").join(",")})
         AND archived_at_UTC IS NULL`,
      roleCodesRequested
    );

    const foundCodes = roleRows.map((row) => String(row.code));
    const missingRoles = roleCodesRequested.filter((role) => !foundCodes.includes(role));
    if (missingRoles.length) {
      set.status = 400;
      return { error: "Unknown role codes", missingRoles };
    }

    const placeholders = roleCodesRequested.map(() => "?").join(",");
    await db.execute(
      `UPDATE org_user_roles our
       JOIN roles r ON r.id = our.role_id
       SET our.archived_at_UTC = UTC_TIMESTAMP(3)
       WHERE our.org_id = ?
         AND our.user_id = ?
         AND our.archived_at_UTC IS NULL
         AND r.archived_at_UTC IS NULL
         AND r.code NOT IN (${placeholders})`,
      [orgId, userId, ...roleCodesRequested]
    );

    for (const role of roleRows) {
      await db.execute(
        `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by, archived_at_UTC)
         VALUES (?, ?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE archived_at_UTC = NULL, created_at_UTC = org_user_roles.created_at_UTC`,
        [orgId, userId, Number(role.id), auth.sub]
      );
    }

    const nextRoleCodes = [...foundCodes].sort();
    if (JSON.stringify(currentRoleCodes) !== JSON.stringify(nextRoleCodes)) {
      await revokeUserSessions(userId);
    }

    return { userId, roles: foundCodes, archivedInOrg: false };
  })
  .get("/orgs/:orgId/audits", async ({ auth, params, query, set }) => {
    const orgId = Number(params.orgId);
    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!hasOrgRole(auth, orgId, "viewer")) {
      set.status = 403;
      return forbidden;
    }

    const { limit, offset } = parsePagination(query);

    const [countRows] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM audits WHERE org_id = ? AND archived_at_UTC IS NULL",
      [orgId]
    );
    set.headers["x-total-count"] = String(Number(countRows[0]?.total ?? 0));

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, org_id, name, status, audit_date, created_at_UTC, updated_at_UTC
       FROM audits
       WHERE org_id = ? AND archived_at_UTC IS NULL
       ORDER BY audit_date DESC, id DESC
       LIMIT ? OFFSET ?`,
      [orgId, limit, offset]
    );

    return rows;
  })
  .post("/orgs/:orgId/audits", async ({ auth, params, body, set }) => {
    const orgId = Number(params.orgId);
    const parsed = createAuditSchema.safeParse(body);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!hasOrgRole(auth, orgId, "lead_auditor")) {
      set.status = 403;
      return forbidden;
    }
    if (!parsed.success) {
      set.status = 400;
      return { error: "Invalid audit payload", details: parsed.error.flatten() };
    }
    const payload = parsed.data;

    const auditId = await withTransaction(async (conn) => {
      const [result] = await conn.execute(
        `INSERT INTO audits (org_id, name, audit_date, status, created_by)
         VALUES (?, ?, ?, 'draft', ?)`,
        [orgId, payload.name, payload.auditDate, auth.sub]
      );

      const newAuditId = Number((result as any).insertId);

      const [scopeRows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM scope_options WHERE code = 'IN_SCOPE' AND archived_at_UTC IS NULL LIMIT 1"
      );
      const inScopeId = scopeRows.length ? Number(scopeRows[0].id) : null;

      if (inScopeId) {
        await conn.execute(
           `INSERT INTO audit_scope_targets (audit_id, process_id, cert_goal_level, custom_goal_level, scope_option_id, updated_by)
            SELECT ?, p.id, ?, NULL, ?, ?
            FROM processes p
            WHERE p.archived_at_UTC IS NULL`,
          [newAuditId, payload.certGoalLevel, inScopeId, auth.sub]
        );
      }

      const [selectScoreRows] = await conn.query<RowDataPacket[]>(
        "SELECT id FROM capability_scores WHERE label = 'Select …' AND archived_at_UTC IS NULL LIMIT 1"
      );
      const selectScoreId = selectScoreRows.length ? Number(selectScoreRows[0].id) : null;

      await conn.execute(
        `INSERT INTO audit_assessments (audit_id, requirement_id, capability_score_id, updated_by)
         SELECT ?, r.id, ?, ?
         FROM requirements r
         WHERE r.archived_at_UTC IS NULL`,
        [newAuditId, selectScoreId, auth.sub]
      );

      return newAuditId;
    });

    set.status = 201;
    return { id: auditId };
  })
  .put("/audits/:auditId/status", async ({ auth, params, body, set }) => {
    const auditId = Number(params.auditId);
    const parsed = updateStatusSchema.safeParse(body);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    if (!parsed.success) {
      set.status = 400;
      return { error: "Invalid status payload", details: parsed.error.flatten() };
    }
    const payload = parsed.data;

    const access = await canAccessAudit(auth, auditId, "lead_auditor");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const transitions = allowedStatusTransitions(String(access.status));
    if (!transitions.includes(payload.status)) {
      set.status = 409;
      return {
        error: `Invalid status transition from '${access.status}' to '${payload.status}'`,
        allowedTransitions: transitions
      };
    }

    const completedAt = payload.status === "completed" ? "UTC_TIMESTAMP(3)" : "NULL";

    await db.execute(
      `UPDATE audits
       SET status = ?, completed_at_UTC = ${completedAt}, updated_by = ?, updated_at_UTC = UTC_TIMESTAMP(3)
       WHERE id = ? AND archived_at_UTC IS NULL`,
      [payload.status, auth.sub, auditId]
    );

    await recordAuditEvent(
      auditId,
      "status_changed",
      auth.sub,
      { status: access.status },
      { status: payload.status },
      "status"
    );

    return { id: auditId, status: payload.status };
  })
  .put("/audits/:auditId/scope-targets", async ({ auth, params, body, set }) => {
    const auditId = Number(params.auditId);
    const payload = body as {
      items?: Array<{
        processCode: string;
        certGoalLevel: number;
        customGoalLevel?: number | null;
        scopeCode: "IN_SCOPE" | "OUT_OF_SCOPE";
      }>;
    };

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "lead_auditor", {
      requireUnlockedForWrite: true
    });
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return access.reason ? { error: access.reason } : forbidden;
    }
    if (String(access.status) !== "draft") {
      set.status = 409;
      return { error: "Scope and cert goals are editable only while audit is draft" };
    }
    if (!payload.items?.length) {
      set.status = 400;
      return { error: "items are required" };
    }

    const [processRows] = await db.query<RowDataPacket[]>(
      "SELECT id, code FROM processes WHERE archived_at_UTC IS NULL"
    );
    const processIdByCode = new Map<string, number>();
    for (const row of processRows) processIdByCode.set(String(row.code), Number(row.id));

    const [scopeRows] = await db.query<RowDataPacket[]>(
      "SELECT id, code FROM scope_options WHERE archived_at_UTC IS NULL"
    );
    const scopeIdByCode = new Map<string, number>();
    for (const row of scopeRows) scopeIdByCode.set(String(row.code), Number(row.id));

    const [levelRows] = await db.query<RowDataPacket[]>("SELECT level FROM target_levels");
    const validLevels = new Set<number>(levelRows.map((row) => Number(row.level)));

    // Validate goal levels up front so an invalid value returns a 400 instead of
    // surfacing a raw foreign-key error, and so the batch is rejected atomically.
    for (const item of payload.items) {
      if (!validLevels.has(Number(item.certGoalLevel))) {
        set.status = 400;
        return { error: `Invalid certGoalLevel: ${item.certGoalLevel}` };
      }
      if (
        item.customGoalLevel !== null &&
        item.customGoalLevel !== undefined &&
        !validLevels.has(Number(item.customGoalLevel))
      ) {
        set.status = 400;
        return { error: `Invalid customGoalLevel: ${item.customGoalLevel}` };
      }
    }

    await withTransaction(async (conn) => {
      for (const item of payload.items) {
        const processId = processIdByCode.get(item.processCode);
        const scopeOptionId = scopeIdByCode.get(item.scopeCode);
        if (!processId || !scopeOptionId) continue;

        await conn.execute(
          `INSERT INTO audit_scope_targets
             (audit_id, process_id, cert_goal_level, custom_goal_level, scope_option_id, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             cert_goal_level = VALUES(cert_goal_level),
             custom_goal_level = VALUES(custom_goal_level),
             scope_option_id = VALUES(scope_option_id),
             updated_by = VALUES(updated_by),
             updated_at_UTC = UTC_TIMESTAMP(3)`,
          [
            auditId,
            processId,
            Number(item.certGoalLevel),
            item.customGoalLevel ?? null,
            scopeOptionId,
            auth.sub
          ]
        );
      }
    });

    return { updated: payload.items.length };
  })
  .put("/audits/:auditId/assessments", async ({ auth, params, body, set }) => {
    const auditId = Number(params.auditId);
    const payload = body as {
      items?: Array<{
        requirementCode: string;
        scoreLabel: string;
        commentText?: string | null;
        evidenceText?: string | null;
      }>;
    };

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "auditor", {
      requireUnlockedForWrite: true
    });
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return access.reason ? { error: access.reason } : forbidden;
    }
    if (!payload.items?.length) {
      set.status = 400;
      return { error: "items are required" };
    }

    const [reqRows] = await db.query<RowDataPacket[]>(
      "SELECT id, code FROM requirements WHERE archived_at_UTC IS NULL"
    );
    const requirementIdByCode = new Map<string, number>();
    for (const row of reqRows) requirementIdByCode.set(String(row.code), Number(row.id));

    const [scoreRows] = await db.query<RowDataPacket[]>(
      "SELECT id, label FROM capability_scores WHERE archived_at_UTC IS NULL"
    );
    const scoreIdByLabel = new Map<string, number>();
    for (const row of scoreRows) scoreIdByLabel.set(String(row.label), Number(row.id));

    let written = 0;

    for (const item of payload.items) {
      const requirementId = requirementIdByCode.get(item.requirementCode);
      const scoreId = scoreIdByLabel.get(item.scoreLabel) ?? scoreIdByLabel.get("Select …") ?? null;
      if (!requirementId) continue;

      const [existingRows] = await db.query<RowDataPacket[]>(
        `SELECT id, capability_score_id, comment_text, evidence_text
         FROM audit_assessments
         WHERE audit_id = ? AND requirement_id = ? AND archived_at_UTC IS NULL
         LIMIT 1`,
        [auditId, requirementId]
      );

      if (!existingRows.length) {
        const [insertResult] = await db.execute(
          `INSERT INTO audit_assessments
             (audit_id, requirement_id, capability_score_id, comment_text, evidence_text, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            auditId,
            requirementId,
            scoreId,
            item.commentText ?? null,
            item.evidenceText ?? null,
            auth.sub
          ]
        );

        const assessmentId = Number((insertResult as any).insertId);
        await db.execute(
          `INSERT INTO assessment_events
             (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
           VALUES (?, 'assessment_created', NULL, ?, ?)`,
          [
            assessmentId,
            JSON.stringify({
              capabilityScoreId: scoreId,
              commentText: item.commentText ?? null,
              evidenceText: item.evidenceText ?? null
            }),
            auth.sub
          ]
        );
      } else {
        const existing = existingRows[0];
        await db.execute(
          `UPDATE audit_assessments
           SET capability_score_id = ?, comment_text = ?, evidence_text = ?, updated_by = ?, updated_at_UTC = UTC_TIMESTAMP(3)
           WHERE id = ?`,
          [scoreId, item.commentText ?? null, item.evidenceText ?? null, auth.sub, existing.id]
        );

        if (Number(existing.capability_score_id ?? -1) !== Number(scoreId ?? -1)) {
          await db.execute(
            `INSERT INTO assessment_events
               (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
             VALUES (?, 'score_changed', ?, ?, ?)`,
            [
              existing.id,
              JSON.stringify({ capabilityScoreId: existing.capability_score_id ?? null }),
              JSON.stringify({ capabilityScoreId: scoreId }),
              auth.sub
            ]
          );
        }

        if (String(existing.comment_text ?? "") !== String(item.commentText ?? "")) {
          await db.execute(
            `INSERT INTO assessment_events
               (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
             VALUES (?, 'comment_changed', ?, ?, ?)`,
            [
              existing.id,
              JSON.stringify({ commentText: existing.comment_text ?? null }),
              JSON.stringify({ commentText: item.commentText ?? null }),
              auth.sub
            ]
          );
        }

        if (String(existing.evidence_text ?? "") !== String(item.evidenceText ?? "")) {
          await db.execute(
            `INSERT INTO assessment_events
               (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
             VALUES (?, 'evidence_changed', ?, ?, ?)`,
            [
              existing.id,
              JSON.stringify({ evidenceText: existing.evidence_text ?? null }),
              JSON.stringify({ evidenceText: item.evidenceText ?? null }),
              auth.sub
            ]
          );
        }
      }

      written += 1;
    }

    return { updated: written };
  })
  .post("/assessments/:assessmentId/notes", async ({ auth, params, body, set }) => {
    const assessmentId = Number(params.assessmentId);
    const payload = body as { noteText?: string };

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!payload.noteText?.trim()) {
      set.status = 400;
      return { error: "noteText is required" };
    }

    const [assessmentRows] = await db.query<RowDataPacket[]>(
      `SELECT aa.id, a.id AS audit_id, a.org_id, a.status AS audit_status
       FROM audit_assessments aa
       JOIN audits a ON a.id = aa.audit_id AND a.archived_at_UTC IS NULL
       WHERE aa.id = ? AND aa.archived_at_UTC IS NULL
       LIMIT 1`,
      [assessmentId]
    );

    if (!assessmentRows.length) {
      set.status = 404;
      return { error: "Assessment not found" };
    }

    const orgId = Number(assessmentRows[0].org_id);
    if (!hasOrgRole(auth, orgId, "auditor")) {
      set.status = 403;
      return forbidden;
    }

    if (
      String(assessmentRows[0].audit_status) === "completed" &&
      !hasOrgRole(auth, orgId, "lead_auditor")
    ) {
      set.status = 403;
      return { error: "Audit is completed and locked for non-lead roles" };
    }

    const [insertResult] = await db.execute(
      `INSERT INTO assessment_notes (audit_assessment_id, note_text, created_by)
       VALUES (?, ?, ?)`,
      [assessmentId, payload.noteText.trim(), auth.sub]
    );

    await db.execute(
      `INSERT INTO assessment_events
         (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
       VALUES (?, 'note_added', NULL, ?, ?)`,
      [assessmentId, JSON.stringify({ noteText: payload.noteText.trim() }), auth.sub]
    );

    set.status = 201;
    return { id: (insertResult as any).insertId };
  })
  .put("/audits/:auditId/details", async ({ auth, params, body, set }) => {
    const auditId = Number(params.auditId);
    const payload = body as {
      items?: Array<{
        fieldKey: string;
        responseText?: string | null;
        noteText?: string | null;
      }>;
    };

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "auditor", {
      requireUnlockedForWrite: true
    });
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return access.reason ? { error: access.reason } : forbidden;
    }
    if (!payload.items?.length) {
      set.status = 400;
      return { error: "items are required" };
    }

    const [fields] = await db.query<RowDataPacket[]>(
      "SELECT id, field_key FROM audit_detail_fields WHERE archived_at_UTC IS NULL"
    );
    const fieldIdByKey = new Map<string, number>();
    for (const row of fields) fieldIdByKey.set(String(row.field_key), Number(row.id));

    for (const item of payload.items) {
      const fieldId = fieldIdByKey.get(item.fieldKey);
      if (!fieldId) continue;

      const [existingRows] = await db.query<RowDataPacket[]>(
        `SELECT id, response_text, note_text
         FROM audit_detail_responses
         WHERE audit_id = ? AND field_id = ? AND archived_at_UTC IS NULL
         LIMIT 1`,
        [auditId, fieldId]
      );

      const previousValue = existingRows.length
        ? {
            responseText: existingRows[0].response_text ?? null,
            noteText: existingRows[0].note_text ?? null
          }
        : null;
      const nextValue = {
        responseText: item.responseText ?? null,
        noteText: item.noteText ?? null
      };

      await db.execute(
        `INSERT INTO audit_detail_responses (audit_id, field_id, response_text, note_text, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           response_text = VALUES(response_text),
           note_text = VALUES(note_text),
           updated_by = VALUES(updated_by),
           updated_at_UTC = UTC_TIMESTAMP(3)`,
        [auditId, fieldId, item.responseText ?? null, item.noteText ?? null, auth.sub]
      );

      if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
        await recordAuditEvent(
          auditId,
          "detail_response_changed",
          auth.sub,
          previousValue,
          nextValue,
          "detail",
          item.fieldKey
        );
      }
    }

    return { updated: payload.items.length };
  })
  .put("/audits/:auditId/conclusion", async ({ auth, params, body, set }) => {
    const auditId = Number(params.auditId);
    const payload = body as { conclusionText?: string | null };

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "lead_auditor", {
      requireUnlockedForWrite: true
    });
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return access.reason ? { error: access.reason } : forbidden;
    }

    const [existingRows] = await db.query<RowDataPacket[]>(
      `SELECT id, conclusion_text
       FROM audit_conclusions
       WHERE audit_id = ? AND archived_at_UTC IS NULL
       LIMIT 1`,
      [auditId]
    );

    await db.execute(
      `INSERT INTO audit_conclusions (audit_id, conclusion_text, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         conclusion_text = VALUES(conclusion_text),
         updated_by = VALUES(updated_by),
         updated_at_UTC = UTC_TIMESTAMP(3)`,
      [auditId, payload.conclusionText ?? null, auth.sub]
    );

    const previousConclusion = existingRows.length ? existingRows[0].conclusion_text ?? null : null;
    const nextConclusion = payload.conclusionText ?? null;
    if (String(previousConclusion ?? "") !== String(nextConclusion ?? "")) {
      await recordAuditEvent(
        auditId,
        "conclusion_changed",
        auth.sub,
        { conclusionText: previousConclusion },
        { conclusionText: nextConclusion },
        "conclusion"
      );
    }

    return { updated: 1 };
  })
  .get("/audits/:auditId/details", async ({ auth, params, set }) => {
    const auditId = Number(params.auditId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "viewer");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         adf.field_key,
         adf.section,
         adf.label,
         adf.guidance_text,
         adr.response_text,
         adr.note_text,
         adr.updated_at_UTC
       FROM audit_detail_fields adf
       LEFT JOIN audit_detail_responses adr
         ON adr.field_id = adf.id
         AND adr.audit_id = ?
         AND adr.archived_at_UTC IS NULL
       WHERE adf.archived_at_UTC IS NULL
       ORDER BY adf.sort_order`,
      [auditId]
    );

    return rows;
  })
  .get("/audits/:auditId/conclusion", async ({ auth, params, set }) => {
    const auditId = Number(params.auditId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "viewer");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT conclusion_text, updated_at_UTC, updated_by
       FROM audit_conclusions
       WHERE audit_id = ? AND archived_at_UTC IS NULL
       LIMIT 1`,
      [auditId]
    );

    return rows.length ? rows[0] : { conclusion_text: null };
  })
  .get("/audits/:auditId/workspace", async ({ auth, params, query, set }) => {
    const auditId = Number(params.auditId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "viewer");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [auditRows] = await db.query<RowDataPacket[]>(
      `SELECT a.id, a.org_id, a.name, a.status, a.audit_date, o.name AS client_name
       FROM audits a
       JOIN organizations o ON o.id = a.org_id AND o.archived_at_UTC IS NULL
       WHERE a.id = ? AND a.archived_at_UTC IS NULL
       LIMIT 1`,
      [auditId]
    );

    if (!auditRows.length) {
      set.status = 404;
      return { error: "Audit not found" };
    }

    const orgId = Number(auditRows[0].org_id);
    const auditStatus = String(auditRows[0].status);
    const canLeadEdit = hasOrgRole(auth, orgId, "lead_auditor");
    const canAuditorEdit = hasOrgRole(auth, orgId, "auditor");
    const isLockedForNonLead = auditStatus === "completed" && !canLeadEdit;
    const canEdit = canLeadEdit || (canAuditorEdit && !isLockedForNonLead);
    const statusTransitions = canLeadEdit ? allowedStatusTransitions(auditStatus) : [];

    const [scopeRows] = await db.query<RowDataPacket[]>(
      `SELECT
         p.id AS process_id,
         p.code AS process_code,
         p.name AS process_name,
         p.abbreviation AS process_abbreviation,
         ast.cert_goal_level,
         ast.custom_goal_level,
         so.code AS scope_code,
         so.label AS scope_label
       FROM processes p
       LEFT JOIN audit_scope_targets ast
         ON ast.process_id = p.id
         AND ast.audit_id = ?
         AND ast.archived_at_UTC IS NULL
       LEFT JOIN scope_options so
         ON so.id = ast.scope_option_id
         AND so.archived_at_UTC IS NULL
       WHERE p.archived_at_UTC IS NULL
       ORDER BY p.sort_order ASC`,
      [auditId]
    );

    const scopeByProcess = new Map<string, RowDataPacket>();
    for (const row of scopeRows) {
      scopeByProcess.set(String(row.process_code), row);
    }

    const [assessmentRows] = await db.query<RowDataPacket[]>(
      `SELECT
         aa.id AS assessment_id,
         p.code AS process_code,
         p.name AS process_name,
         p.abbreviation AS process_abbreviation,
         r.id AS requirement_id,
         r.code AS requirement_code,
         r.requirement_text,
         cs.label AS score_label,
         cs.numeric_value AS score_numeric,
         aa.comment_text,
         aa.evidence_text,
         aa.updated_at_UTC
       FROM audit_assessments aa
       JOIN requirements r ON r.id = aa.requirement_id AND r.archived_at_UTC IS NULL
       JOIN processes p ON p.id = r.process_id AND p.archived_at_UTC IS NULL
       LEFT JOIN capability_scores cs ON cs.id = aa.capability_score_id AND cs.archived_at_UTC IS NULL
       WHERE aa.audit_id = ? AND aa.archived_at_UTC IS NULL
       ORDER BY p.sort_order ASC, r.sort_order ASC`,
      [auditId]
    );

    const groups = new Map<string, any>();

    for (const row of assessmentRows) {
      const processCode = String(row.process_code);
      if (!groups.has(processCode)) {
        const scope = scopeByProcess.get(processCode);
        groups.set(processCode, {
          processCode,
          processName: row.process_name,
          processAbbreviation: row.process_abbreviation,
          certGoalLevel: scope?.cert_goal_level ?? null,
          customGoalLevel: scope?.custom_goal_level ?? null,
          scopeCode: scope?.scope_code ?? "IN_SCOPE",
          scopeLabel: scope?.scope_label ?? "In scope",
          requirements: []
        });
      }

      groups.get(processCode).requirements.push({
        assessmentId: Number(row.assessment_id),
        requirementId: Number(row.requirement_id),
        requirementCode: row.requirement_code,
        requirementText: row.requirement_text,
        scoreLabel: row.score_label ?? "Select …",
        scoreNumeric: row.score_numeric,
        commentText: row.comment_text,
        evidenceText: row.evidence_text,
        updatedAt: row.updated_at_UTC
      });
    }

    const [details] = await db.query<RowDataPacket[]>(
      `SELECT
         adf.field_key,
         adf.section,
         adf.label,
         adf.guidance_text,
         adr.response_text,
         adr.note_text,
         adr.updated_at_UTC
       FROM audit_detail_fields adf
       LEFT JOIN audit_detail_responses adr
         ON adr.field_id = adf.id
         AND adr.audit_id = ?
         AND adr.archived_at_UTC IS NULL
       WHERE adf.archived_at_UTC IS NULL
       ORDER BY adf.sort_order ASC`,
      [auditId]
    );

    const [conclusionRows] = await db.query<RowDataPacket[]>(
      `SELECT conclusion_text, updated_at_UTC
       FROM audit_conclusions
       WHERE audit_id = ? AND archived_at_UTC IS NULL
       LIMIT 1`,
      [auditId]
    );

    const [scoreOptions] = await db.query<RowDataPacket[]>(
      `SELECT label, numeric_value, sort_order
       FROM capability_scores
       WHERE archived_at_UTC IS NULL
       ORDER BY sort_order ASC`
    );

    const [targetLevels] = await db.query<RowDataPacket[]>(
      `SELECT level, label
       FROM target_levels
       WHERE archived_at_UTC IS NULL
       ORDER BY level ASC`
    );

    const [scopeOptions] = await db.query<RowDataPacket[]>(
      `SELECT code, label
       FROM scope_options
       WHERE archived_at_UTC IS NULL
       ORDER BY id ASC`
    );

    const { limit: eventsLimit } = parsePagination(query, { defaultLimit: 100, maxLimit: 500 });
    const auditEvents = (await hasTable("audit_events"))
      ? (
          await db.query<RowDataPacket[]>(
            `SELECT
               ae.id,
               ae.event_type,
               ae.entity_type,
               ae.entity_key,
               ae.old_value_json,
               ae.new_value_json,
               ae.actor_user_id,
               u.display_name AS actor_name,
               ae.created_at_UTC
             FROM audit_events ae
             LEFT JOIN users u ON u.id = ae.actor_user_id
             WHERE ae.audit_id = ?
             ORDER BY ae.created_at_UTC DESC, ae.id DESC
             LIMIT ?`,
            [auditId, eventsLimit]
          )
        )[0]
      : [];

    return {
      audit: auditRows[0],
      permissions: {
        canEdit,
        canLeadEdit,
        canExport: canAuditorEdit,
        canManageStatus: canLeadEdit,
        canManageScopeTargets: canLeadEdit && auditStatus === "draft",
        isLockedForNonLead,
        allowedStatusTransitions: statusTransitions
      },
      groupedProcesses: Array.from(groups.values()),
      details,
      conclusion: conclusionRows.length ? conclusionRows[0] : { conclusion_text: null },
      auditEvents,
      dropdowns: {
        scoreOptions,
        targetLevels,
        scopeOptions
      }
    };
  })
  .get("/audits/:auditId/exports", async ({ auth, params, set }) => {
    const auditId = Number(params.auditId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "auditor");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         id,
         report_kind,
         file_name,
         file_size_bytes,
         sha256_hex,
         is_current,
         generated_at_UTC,
         generated_by
       FROM audit_pdf_exports
       WHERE audit_id = ? AND archived_at_UTC IS NULL
       ORDER BY generated_at_UTC DESC, id DESC`,
      [auditId]
    );

    return rows;
  })
  .get("/audits/:auditId/exports/csv", async ({ auth, params, query, set }) => {
    const auditId = Number(params.auditId);
    const report = String((query as any)?.report ?? "all");

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "viewer");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    let sql = "";
    if (report === "all") {
      sql = `SELECT * FROM v_all_results WHERE audit_id = ? ORDER BY process_code, requirement_code`;
    } else if (report === "certification") {
      sql = `SELECT * FROM v_certification_results WHERE audit_id = ? ORDER BY process_code`;
    } else if (report === "gaps") {
      sql = `SELECT * FROM v_gap_analysis WHERE audit_id = ? ORDER BY process_code, requirement_code`;
    } else {
      set.status = 400;
      return { error: "Invalid report. Use all|certification|gaps" };
    }

    const [rows] = await db.query<RowDataPacket[]>(sql, [auditId]);
    const csv = rowsToCsv(rows);
    const filename = `audit-${auditId}-${report}-${fileTs()}.csv`;

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`
      }
    });
  })
  .get("/orgs/:orgId/exports/csv", async ({ auth, params, query, set }) => {
    const orgId = Number(params.orgId);
    const report = String((query as any)?.report ?? "trends");

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!hasOrgRole(auth, orgId, "viewer")) {
      set.status = 403;
      return forbidden;
    }

    if (report !== "trends") {
      set.status = 400;
      return { error: "Invalid report. Use trends" };
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT *
       FROM v_trends
       WHERE org_id = ?
       ORDER BY audit_date DESC, process_code`,
      [orgId]
    );

    const csv = rowsToCsv(rows);
    const filename = `org-${orgId}-trends-${fileTs()}.csv`;
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`
      }
    });
  })
  .post("/audits/:auditId/exports/pdf", async ({ auth, params, set }) => {
    const auditId = Number(params.auditId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "auditor");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [auditRows] = await db.query<RowDataPacket[]>(
      `SELECT a.id, a.org_id, a.name, a.status, a.audit_date, o.name AS client_name
       FROM audits a
       JOIN organizations o ON o.id = a.org_id AND o.archived_at_UTC IS NULL
       WHERE a.id = ? AND a.archived_at_UTC IS NULL
       LIMIT 1`,
      [auditId]
    );

    if (!auditRows.length) {
      set.status = 404;
      return { error: "Audit not found" };
    }

    const audit = auditRows[0];

    const [leadAuditorRows] = await db.query<RowDataPacket[]>(
      `SELECT adr.response_text
       FROM audit_detail_responses adr
       JOIN audit_detail_fields adf ON adf.id = adr.field_id
       WHERE adf.field_key = 'lead_auditor_name'
         AND adf.archived_at_UTC IS NULL
         AND adr.audit_id = ?
         AND adr.archived_at_UTC IS NULL
       LIMIT 1`,
      [auditId]
    );

    const [scopeCounts] = await db.query<RowDataPacket[]>(
      `SELECT so.code, COUNT(*) AS cnt
       FROM audit_scope_targets ast
       JOIN scope_options so ON so.id = ast.scope_option_id AND so.archived_at_UTC IS NULL
       WHERE ast.audit_id = ? AND ast.archived_at_UTC IS NULL
       GROUP BY so.code`,
      [auditId]
    );

    let inScope = 0;
    let outOfScope = 0;
    for (const row of scopeCounts) {
      if (String(row.code) === "IN_SCOPE") inScope = Number(row.cnt);
      if (String(row.code) === "OUT_OF_SCOPE") outOfScope = Number(row.cnt);
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT
         p.code AS process_code,
         p.name AS process_name,
         p.abbreviation AS process_abbreviation,
         ast.cert_goal_level,
         ast.custom_goal_level,
         COALESCE(so.label, 'In scope') AS scope_label,
         r.code AS requirement_code,
         r.requirement_text,
         COALESCE(cs.label, 'Select …') AS score_label,
         aa.comment_text,
         aa.evidence_text
       FROM requirements r
       JOIN processes p ON p.id = r.process_id AND p.archived_at_UTC IS NULL
       LEFT JOIN audit_scope_targets ast
         ON ast.process_id = p.id
         AND ast.audit_id = ?
         AND ast.archived_at_UTC IS NULL
       LEFT JOIN scope_options so
         ON so.id = ast.scope_option_id
         AND so.archived_at_UTC IS NULL
       LEFT JOIN audit_assessments aa
         ON aa.audit_id = ?
         AND aa.requirement_id = r.id
         AND aa.archived_at_UTC IS NULL
       LEFT JOIN capability_scores cs
         ON cs.id = aa.capability_score_id
         AND cs.archived_at_UTC IS NULL
       WHERE r.archived_at_UTC IS NULL
       ORDER BY p.sort_order ASC, r.sort_order ASC`,
      [auditId, auditId]
    );

    const grouped = new Map<string, any>();
    for (const row of rows) {
      const processCode = String(row.process_code);
      if (!grouped.has(processCode)) {
        grouped.set(processCode, {
          processCode,
          processName: row.process_name,
          processAbbreviation: row.process_abbreviation,
          scopeLabel: row.scope_label,
          certGoalLevel: row.cert_goal_level,
          customGoalLevel: row.custom_goal_level,
          requirements: []
        });
      }

      grouped.get(processCode).requirements.push({
        requirementCode: row.requirement_code,
        requirementText: row.requirement_text,
        scoreLabel: row.score_label,
        commentText: row.comment_text,
        evidenceText: row.evidence_text
      });
    }

    const generatedAt = new Date();
    const generatedAtIso = generatedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";

    const pdfBytes = await buildAuditPdfReport({
      audit: {
        id: Number(audit.id),
        name: String(audit.name),
        status: String(audit.status),
        auditDate: String(audit.audit_date),
        clientName: String(audit.client_name),
        generatedAtIso,
        leadAuditorName: String(leadAuditorRows[0]?.response_text ?? ""),
        scopeSummary: `In scope processes: ${inScope}; Out of scope processes: ${outOfScope}`
      },
      groupedProcesses: Array.from(grouped.values())
    });

    const ts = generatedAt.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const fileName = `${safeFileSegment(String(audit.name) || "audit")}-${ts}.pdf`;
    const relativePath = join(String(audit.org_id), `audit-${auditId}`, `${randomUUID()}-${fileName}`);
    const absPath = join(config.exportsDir, relativePath);

    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, pdfBytes);

    const sha256Hex = createHash("sha256").update(pdfBytes).digest("hex");
    const fileSizeBytes = pdfBytes.byteLength;

    // Demote the previous current export and insert the new one atomically so
    // concurrent generations cannot violate uq_audit_pdf_exports_current_per_kind
    // or leave more than one "current" row.
    const insertResult = await withTransaction(async (conn) => {
      await conn.execute(
        `UPDATE audit_pdf_exports
         SET is_current = 0, updated_at_UTC = UTC_TIMESTAMP(3)
         WHERE audit_id = ?
           AND report_kind = 'FULL_ASSESSMENT_REPORT'
           AND archived_at_UTC IS NULL
           AND is_current = 1`,
        [auditId]
      );

      const [result] = await conn.execute(
        `INSERT INTO audit_pdf_exports
           (audit_id, org_id, report_kind, file_name, file_path, file_size_bytes, sha256_hex, is_current, generated_by)
         VALUES (?, ?, 'FULL_ASSESSMENT_REPORT', ?, ?, ?, ?, 1, ?)`,
        [auditId, Number(audit.org_id), fileName, relativePath, fileSizeBytes, sha256Hex, auth.sub]
      );
      return result;
    });

    set.status = 201;
    return {
      id: Number((insertResult as any).insertId),
      fileName,
      fileSizeBytes,
      generatedAt: generatedAtIso,
      reportKind: "FULL_ASSESSMENT_REPORT"
    };
  })
  .get("/audits/:auditId/exports/:exportId/download", async ({ auth, params, set }) => {
    const auditId = Number(params.auditId);
    const exportId = Number(params.exportId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const access = await canAccessAudit(auth, auditId, "auditor");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT file_name, file_path
       FROM audit_pdf_exports
       WHERE id = ? AND audit_id = ? AND archived_at_UTC IS NULL
       LIMIT 1`,
      [exportId, auditId]
    );

    if (!rows.length) {
      set.status = 404;
      return { error: "Export not found" };
    }

    const fileName = String(rows[0].file_name);
    const filePath = String(rows[0].file_path);

    // Defense-in-depth: never read outside the exports directory even if the
    // stored path is somehow tampered with.
    const exportsRoot = resolve(config.exportsDir);
    const absPath = resolve(exportsRoot, filePath);
    if (absPath !== exportsRoot && !absPath.startsWith(exportsRoot + sep)) {
      set.status = 400;
      return { error: "Invalid export path" };
    }

    try {
      const fileBuffer = await readFileFs(absPath);
      return new Response(fileBuffer, {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${fileName}"`
        }
      });
    } catch {
      set.status = 404;
      return { error: "Export file not found on disk" };
    }
  })
  .get("/assessments/:assessmentId/history", async ({ auth, params, set }) => {
    const assessmentId = Number(params.assessmentId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const [assessmentRows] = await db.query<RowDataPacket[]>(
      `SELECT aa.id, a.org_id
       FROM audit_assessments aa
       JOIN audits a ON a.id = aa.audit_id AND a.archived_at_UTC IS NULL
       WHERE aa.id = ? AND aa.archived_at_UTC IS NULL
       LIMIT 1`,
      [assessmentId]
    );

    if (!assessmentRows.length) {
      set.status = 404;
      return { error: "Assessment not found" };
    }

    if (!hasOrgRole(auth, Number(assessmentRows[0].org_id), "viewer")) {
      set.status = 403;
      return forbidden;
    }

    const [events] = await db.query<RowDataPacket[]>(
      `SELECT id, event_type, old_value_json, new_value_json, actor_user_id, created_at_UTC
       FROM assessment_events
       WHERE audit_assessment_id = ?
       ORDER BY created_at_UTC ASC, id ASC`,
      [assessmentId]
    );

    const [notes] = await db.query<RowDataPacket[]>(
      `SELECT id, note_text, created_by, created_at_UTC
       FROM assessment_notes
       WHERE audit_assessment_id = ? AND archived_at_UTC IS NULL
       ORDER BY created_at_UTC ASC, id ASC`,
      [assessmentId]
    );

    return { events, notes };
  })
  .post("/assessments/:assessmentId/archive", async ({ auth, params, set }) => {
    const assessmentId = Number(params.assessmentId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT aa.id, aa.audit_id, a.org_id, aa.archived_at_UTC
       FROM audit_assessments aa
       JOIN audits a ON a.id = aa.audit_id AND a.archived_at_UTC IS NULL
       WHERE aa.id = ?
       LIMIT 1`,
      [assessmentId]
    );

    if (!rows.length) {
      set.status = 404;
      return { error: "Assessment not found" };
    }

    if (!hasOrgRole(auth, Number(rows[0].org_id), "lead_auditor")) {
      set.status = 403;
      return forbidden;
    }

    if (rows[0].archived_at_UTC) {
      set.status = 409;
      return { error: "Assessment is already archived" };
    }

    const [archiveResult] = await db.execute(
      `UPDATE audit_assessments
       SET archived_at_UTC = UTC_TIMESTAMP(3), updated_at_UTC = UTC_TIMESTAMP(3), updated_by = ?
       WHERE id = ? AND archived_at_UTC IS NULL`,
      [auth.sub, assessmentId]
    );

    if (Number((archiveResult as any).affectedRows ?? 0) === 0) {
      set.status = 409;
      return { error: "Assessment could not be archived" };
    }

    await db.execute(
      `INSERT INTO assessment_events
         (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
       VALUES (?, 'assessment_archived', NULL, NULL, ?)`,
      [assessmentId, auth.sub]
    );

    await recordAuditEvent(
      Number(rows[0].audit_id),
      "assessment_archived",
      auth.sub,
      { assessmentId, archived: false },
      { assessmentId, archived: true },
      "assessment",
      String(assessmentId)
    );

    return { archived: true };
  })
  .post("/assessments/:assessmentId/restore", async ({ auth, params, set }) => {
    const assessmentId = Number(params.assessmentId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT aa.id, aa.audit_id, a.org_id, aa.archived_at_UTC
       FROM audit_assessments aa
       JOIN audits a ON a.id = aa.audit_id AND a.archived_at_UTC IS NULL
       WHERE aa.id = ?
       LIMIT 1`,
      [assessmentId]
    );

    if (!rows.length) {
      set.status = 404;
      return { error: "Assessment not found" };
    }

    if (!hasOrgRole(auth, Number(rows[0].org_id), "lead_auditor")) {
      set.status = 403;
      return forbidden;
    }

    if (!rows[0].archived_at_UTC) {
      set.status = 409;
      return { error: "Assessment is already active" };
    }

    const [restoreResult] = await db.execute(
      `UPDATE audit_assessments
       SET archived_at_UTC = NULL, updated_at_UTC = UTC_TIMESTAMP(3), updated_by = ?
       WHERE id = ? AND archived_at_UTC IS NOT NULL`,
      [auth.sub, assessmentId]
    );

    if (Number((restoreResult as any).affectedRows ?? 0) === 0) {
      set.status = 409;
      return { error: "Assessment could not be restored" };
    }

    await db.execute(
      `INSERT INTO assessment_events
         (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
       VALUES (?, 'assessment_restored', NULL, NULL, ?)`,
      [assessmentId, auth.sub]
    );

    await recordAuditEvent(
      Number(rows[0].audit_id),
      "assessment_restored",
      auth.sub,
      { assessmentId, archived: true },
      { assessmentId, archived: false },
      "assessment",
      String(assessmentId)
    );

    return { restored: true };
  })
  .get("/audits/:auditId/results/all", async ({ auth, params, set }) => {
    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const auditId = Number(params.auditId);
    const access = await canAccessAudit(auth, auditId, "viewer");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT *
       FROM v_all_results
       WHERE audit_id = ?
       ORDER BY process_code, requirement_code`,
      [auditId]
    );

    return rows;
  })
  .get("/audits/:auditId/results/certification", async ({ auth, params, set }) => {
    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const auditId = Number(params.auditId);
    const access = await canAccessAudit(auth, auditId, "viewer");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT *
       FROM v_certification_results
       WHERE audit_id = ?
       ORDER BY process_code`,
      [auditId]
    );

    return rows;
  })
  .get("/audits/:auditId/results/gaps", async ({ auth, params, set }) => {
    if (!auth) {
      set.status = 401;
      return unauthorized;
    }

    const auditId = Number(params.auditId);
    const access = await canAccessAudit(auth, auditId, "viewer");
    if (!access.orgId) {
      set.status = 404;
      return { error: "Audit not found" };
    }
    if (!access.allowed) {
      set.status = 403;
      return forbidden;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT *
       FROM v_gap_analysis
       WHERE audit_id = ?
       ORDER BY process_code, requirement_code`,
      [auditId]
    );

    return rows;
  })
  .get("/orgs/:orgId/trends", async ({ auth, params, set }) => {
    const orgId = Number(params.orgId);

    if (!auth) {
      set.status = 401;
      return unauthorized;
    }
    if (!hasOrgRole(auth, orgId, "viewer")) {
      set.status = 403;
      return forbidden;
    }

    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT *
       FROM v_trends
       WHERE org_id = ?
       ORDER BY audit_date DESC, process_code`,
      [orgId]
    );

    return rows;
  });

app.listen(config.appPort);

console.log(`API running on http://localhost:${config.appPort}`);
console.log(`Swagger docs at http://localhost:${config.appPort}/docs`);
