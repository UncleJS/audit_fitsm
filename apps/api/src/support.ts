import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile as readFileFs, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RowDataPacket } from "mysql2";
import { z } from "zod";
import { config } from "./config";
import { rowsToCsv } from "./csv";
import { getDb } from "./db";
import { contentDispositionAttachment, resolveExportPath, safeFileSegment } from "./paths";
import { buildAuditPdfReport } from "./pdf-report";
import { checkRateLimit, clientAddress } from "./rate-limit";
import { hasRole, type RoleCode } from "./rbac";
import { clearSessionCookieHeader, extractBearer, readSessionCookie, sessionCookieHeader } from "./session-cookie";
import type { AuthPayload, AuthVia } from "./types";

export const insertIdOf = (result: unknown): number => {
  if (result && typeof result === "object" && "insertId" in result) {
    return Number((result as { insertId: number | bigint }).insertId);
  }
  return 0;
};

export const affectedRowsOf = (result: unknown): number => {
  if (result && typeof result === "object" && "affectedRows" in result) {
    return Number((result as { affectedRows: number }).affectedRows);
  }
  return 0;
};

export const anonymousSession = {
  auth: null as AuthPayload | null,
  authVia: null as AuthVia | null,
};

export const claimRecord = (payload: unknown): Record<string, unknown> | null => {
  if (!payload || typeof payload !== "object") return null;
  return payload as Record<string, unknown>;
};

export const queryValue = (query: unknown, key: string, fallback: string): string => {
  if (!query || typeof query !== "object" || !(key in query)) return fallback;
  const value = (query as Record<string, unknown>)[key];
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  if (value === undefined || value === null) return fallback;
  return String(value);
};

export const openApiDoc = JSON.parse(await readFileFs(new URL("../openapi/openapi.json", import.meta.url), "utf8"));

export const db = getDb();
export const corsAllowedOrigins = new Set(config.cors.allowedOrigins);
export let tokenVersionColumnExistsPromise: Promise<boolean> | null = null;
export const tableExistsPromiseByName = new Map<string, Promise<boolean>>();

export const swaggerCsp = [
  "default-src 'self'",
  "style-src 'self' https://unpkg.com 'unsafe-inline'",
  "script-src 'self' https://unpkg.com 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' https://unpkg.com data:",
  "frame-ancestors 'none'",
].join("; ");

export const defaultCsp = "default-src 'self'; frame-ancestors 'none'";

export const hasTable = async (tableName: string): Promise<boolean> => {
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
          [config.db.database, tableName],
        )
        .then(([rows]) => rows.length > 0)
        .catch(() => false),
    );
  }

  return tableExistsPromiseByName.get(tableName)!;
};

export const hasTokenVersionColumn = async (): Promise<boolean> => {
  tokenVersionColumnExistsPromise ??= db
    .query<RowDataPacket[]>(
      `SELECT 1
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'token_version'
       LIMIT 1`,
      [config.db.database],
    )
    .then(([rows]) => rows.length > 0)
    .catch(() => false);

  return tokenVersionColumnExistsPromise;
};

export const buildOrgRoles = (roleRows: RowDataPacket[]): Record<string, string[]> => {
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

export const revokeUserSessions = async (userId: number): Promise<void> => {
  if (await hasTokenVersionColumn()) {
    await db.execute(
      `UPDATE users
       SET token_version = token_version + 1,
           updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND archived_at IS NULL`,
      [userId],
    );
    return;
  }

  await db.execute(
    `UPDATE users
     SET updated_at = UTC_TIMESTAMP(3)
     WHERE id = ? AND archived_at IS NULL`,
    [userId],
  );
};

export const recordAuditEvent = async (
  auditId: number,
  eventType: string,
  actorUserId: number,
  oldValue: unknown,
  newValue: unknown,
  entityType: "audit" | "detail" | "conclusion" | "status" | "assessment" = "audit",
  entityKey: string | null = null,
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
      actorUserId,
    ],
  );
};

export const getContentSecurityPolicy = (request: Request): string => {
  const pathname = new URL(request.url).pathname;
  return pathname === "/docs" ? swaggerCsp : defaultCsp;
};

export const applyCorsHeaders = (set: { headers: Record<string, string | number> }, request: Request): void => {
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

  set.headers["Access-Control-Allow-Origin"] = origin;
  set.headers["Access-Control-Allow-Credentials"] = "true";
  set.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
  set.headers["Access-Control-Allow-Headers"] = "authorization,content-type,x-audit-fitsm";
  set.headers["Access-Control-Max-Age"] = "86400";
  set.headers["Vary"] = "Origin";
};

export const hasOrgRole = (auth: AuthPayload | null, orgId: number, minimumRole: RoleCode): boolean => {
  if (!auth) return false;
  const allRoles = [
    ...(auth.orgRoles[String(orgId)] ?? []),
    ...(Object.values(auth.orgRoles).flat().includes("system_admin") ? ["system_admin"] : []),
  ];

  return hasRole(allRoles, minimumRole);
};

export const isSystemAdmin = (auth: AuthPayload | null): boolean => {
  if (!auth) return false;
  return Object.values(auth.orgRoles).flat().includes("system_admin");
};

export const getUserScope = async (userId: number): Promise<{ orgIds: number[]; hasSystemAdmin: boolean }> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT our.org_id, r.code AS role_code
     FROM org_user_roles our
     JOIN roles r ON r.id = our.role_id AND r.archived_at IS NULL
     WHERE our.user_id = ?
       AND our.archived_at IS NULL`,
    [userId],
  );

  const orgIds = Array.from(new Set(rows.map((row) => Number(row.org_id)).filter((value) => Number.isFinite(value))));
  const hasSystemAdminRole = rows.some((row) => String(row.role_code) === "system_admin");

  return {
    orgIds,
    hasSystemAdmin: hasSystemAdminRole,
  };
};

export const getAccessibleOrgIds = (auth: AuthPayload | null): number[] => {
  if (!auth) return [];
  return Object.entries(auth.orgRoles)
    .filter(([, roles]) => roles.length > 0)
    .map(([orgId]) => Number(orgId))
    .filter((value) => Number.isFinite(value));
};

export const getAuditMeta = async (auditId: number): Promise<{ orgId: number; status: string } | null> => {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT org_id, status
     FROM audits
     WHERE id = ? AND archived_at IS NULL
     LIMIT 1`,
    [auditId],
  );

  if (!rows.length) return null;
  return {
    orgId: Number(rows[0].org_id),
    status: String(rows[0].status),
  };
};

export const canAccessAudit = async (
  auth: AuthPayload | null,
  auditId: number,
  minimumRole: RoleCode,
  options?: { requireUnlockedForWrite?: boolean },
): Promise<{ allowed: boolean; orgId: number | null; status: string | null; reason?: string }> => {
  const meta = await getAuditMeta(auditId);
  if (!meta) return { allowed: false, orgId: null, status: null };

  if (!hasOrgRole(auth, meta.orgId, minimumRole)) {
    return {
      allowed: false,
      orgId: meta.orgId,
      status: meta.status,
    };
  }

  if (options?.requireUnlockedForWrite) {
    if (meta.status === "completed" && !hasOrgRole(auth, meta.orgId, "lead_auditor")) {
      return {
        allowed: false,
        orgId: meta.orgId,
        status: meta.status,
        reason: "Audit is completed and locked for non-lead roles",
      };
    }
  }

  return {
    allowed: true,
    orgId: meta.orgId,
    status: meta.status,
  };
};

export const allowedStatusTransitions = (currentStatus: string): string[] => {
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

export const unauthorized = { error: "Unauthorized" };
export const forbidden = { error: "Forbidden" };

export const fileTs = (): string =>
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(191),
});

export const createAuditSchema = z.object({
  name: z.string().trim().min(2).max(255),
  auditDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  certGoalLevel: z.coerce.number().int().min(1).max(5).default(3),
});

export const updateStatusSchema = z.object({
  status: z.enum(["draft", "in_progress", "completed"]),
});

export const createOrgUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(2).max(191),
  roles: z.array(z.string().min(1)).min(1),
});

export const updateOrgUserRolesSchema = z.object({
  roles: z.array(z.string().min(1)).min(0),
});

export type { AuthPayload, AuthVia, RoleCode, RowDataPacket };
export {
  buildAuditPdfReport,
  checkRateLimit,
  clearSessionCookieHeader,
  clientAddress,
  config,
  contentDispositionAttachment,
  createHash,
  dirname,
  extractBearer,
  hasRole,
  join,
  mkdir,
  randomUUID,
  readFileFs,
  readSessionCookie,
  resolveExportPath,
  rowsToCsv,
  safeFileSegment,
  sessionCookieHeader,
  writeFile,
  z,
};
