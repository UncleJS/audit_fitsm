// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { jwt } from "@elysiajs/jwt";
import Elysia from "elysia";
import { checkRequestRateLimit, normalizeRoutePath, setRateLimitMaxBuckets } from "./rate-limit";
import type { AuthPayload, RowDataPacket } from "./support";
import {
  anonymousSession,
  applyCorsHeaders,
  buildOrgRoles,
  claimRecord,
  clientAddress,
  config,
  db,
  getContentSecurityPolicy,
  hasTokenVersionColumn,
  isDuplicateKeyError,
  openApiDoc,
  readSessionCookie,
  unauthorized,
} from "./support";

const SWAGGER_UI_VERSION = "5.17.14";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** API docs are public only in local development and tests. */
const docsArePublic = (): boolean => process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

type HeaderSet = { headers: Record<string, string | number> };

const applySecurityHeaders = (set: HeaderSet, request: Request): void => {
  applyCorsHeaders(set, request);
  set.headers["x-content-type-options"] = "nosniff";
  set.headers["x-frame-options"] = "DENY";
  set.headers["referrer-policy"] = "same-origin";
  set.headers["x-permitted-cross-domain-policies"] = "none";
  set.headers["content-security-policy"] = getContentSecurityPolicy(request);
};

const errorCodeOf = (error: unknown): { code?: string; errno?: number } =>
  error && typeof error === "object" ? (error as { code?: string; errno?: number }) : {};

const isForeignKeyError = (error: unknown): boolean => {
  const { code, errno } = errorCodeOf(error);
  return code === "ER_NO_REFERENCED_ROW_2" || code === "ER_NO_REFERENCED_ROW" || errno === 1452 || errno === 1216;
};

const isDataTooLongError = (error: unknown): boolean => {
  const { code, errno } = errorCodeOf(error);
  return code === "ER_DATA_TOO_LONG" || errno === 1406 || code === "ER_TRUNCATED_WRONG_VALUE" || errno === 1292;
};

export const createAppBase = () => {
  setRateLimitMaxBuckets(config.rateLimit.maxBuckets);
  return new Elysia()
    .use(
      jwt({
        name: "jwt",
        secret: config.jwtSecret,
      }),
    )
    .onRequest(({ set, request, server }) => {
      applyCorsHeaders(set, request);

      if (request.method === "OPTIONS") {
        set.status = 204;
        return "";
      }

      const ip = clientAddress(request, server, config.trustProxy);
      const method = request.method.toUpperCase();
      const route = normalizeRoutePath(new URL(request.url).pathname);
      const rate = checkRequestRateLimit(ip, method, route, config.rateLimit);

      if (!rate.allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(rate.retryAfterSec ?? 1);
        return { error: "Rate limit exceeded" };
      }

      // CSRF guard: the session lives in a cookie, so every state-changing request (including login,
      // logout and refresh) must carry a custom header that a cross-site form or image cannot set.
      if (!SAFE_METHODS.has(method) && request.headers.get("x-audit-fitsm") !== "1") {
        set.status = 403;
        return { error: "Forbidden" };
      }
    })
    .onAfterHandle(({ set, request }) => {
      applySecurityHeaders(set, request);
    })
    .onError(({ code, error, set, request }) => {
      applySecurityHeaders(set, request);

      if (code === "NOT_FOUND") {
        set.status = 404;
        return { error: "Not found" };
      }
      if (code === "VALIDATION" || code === "PARSE") {
        set.status = 400;
        return { error: "Invalid request payload" };
      }
      if (isDuplicateKeyError(error)) {
        set.status = 409;
        return { error: "A record with the same unique value already exists" };
      }
      if (isForeignKeyError(error) || isDataTooLongError(error)) {
        set.status = 400;
        return { error: "Invalid reference or value in request" };
      }
      if (typeof code === "number" && code >= 400 && code < 500) {
        set.status = code;
        return { error: "Request failed" };
      }

      const pathname = (() => {
        try {
          return new URL(request.url).pathname;
        } catch {
          return "?";
        }
      })();
      console.error(`[api] ${new Date().toISOString()} unhandled error on ${request.method} ${pathname}`, error);
      set.status = 500;
      return { error: "Internal server error" };
    })
    .derive(async ({ request, jwt }) => {
      const token = readSessionCookie(request);
      if (!token) {
        return anonymousSession;
      }

      const verified = await jwt.verify(token);
      const claims = claimRecord(verified);
      if (!claims) {
        return anonymousSession;
      }

      const exp = Number(claims.exp ?? 0);
      if (!Number.isFinite(exp) || exp <= 0 || Date.now() >= exp * 1000) {
        return anonymousSession;
      }

      const userId = Number(claims.sub);
      const tokenVersion = Number(claims.tokenVersion);
      if (!Number.isInteger(userId) || !Number.isInteger(tokenVersion)) {
        return anonymousSession;
      }

      let tokenVersionColumnExists: boolean;
      try {
        tokenVersionColumnExists = await hasTokenVersionColumn();
      } catch (error) {
        // Fail closed: without knowing whether revocation is enforced, do not accept the session.
        console.error("[api] token_version lookup failed; treating request as anonymous", error);
        return anonymousSession;
      }
      const [userRows] = await db.query<RowDataPacket[]>(
        tokenVersionColumnExists
          ? `SELECT id, email, display_name, is_active, token_version
           FROM users
           WHERE id = ? AND archived_UTC IS NULL
           LIMIT 1`
          : `SELECT id, email, display_name, is_active
           FROM users
           WHERE id = ? AND archived_UTC IS NULL
           LIMIT 1`,
        [userId],
      );

      if (!userRows.length) {
        return anonymousSession;
      }

      const user = userRows[0];
      if (!user || Number(user.is_active) !== 1) {
        return anonymousSession;
      }

      if (tokenVersionColumnExists && Number(user.token_version) !== tokenVersion) {
        return anonymousSession;
      }

      const [roleRows] = await db.query<RowDataPacket[]>(
        `SELECT our.org_id, r.code AS role_code
       FROM org_user_roles our
       JOIN roles r ON r.id = our.role_id AND r.archived_UTC IS NULL
       WHERE our.user_id = ? AND our.archived_UTC IS NULL`,
        [userId],
      );

      return {
        auth: {
          sub: userId,
          email: String(user.email),
          name: String(user.display_name),
          orgRoles: buildOrgRoles(roleRows),
          tokenVersion,
        } satisfies AuthPayload,
        authVia: "cookie" as const,
        sessionExp: exp,
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
          "SELECT COUNT(*) AS applied_count FROM schema_migrations",
        );

        return {
          status: "ready",
          checks: {
            db: {
              status: "ok",
              latencyMs: Date.now() - startedAt,
            },
            migrations: {
              status: "ok",
              appliedCount: Number(migrationRows?.[0]?.applied_count ?? 0),
            },
          },
        };
      } catch (error) {
        set.status = 503;
        const expose = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
        return {
          status: "not_ready",
          error: expose && error instanceof Error ? error.message : "Readiness check failed",
        };
      }
    })
    .get("/openapi.json", ({ auth, set }) => {
      if (!docsArePublic() && !auth) {
        set.status = 401;
        return unauthorized;
      }
      return openApiDoc;
    })
    .get("/docs", ({ set, auth }) => {
      if (!docsArePublic() && !auth) {
        set.status = 401;
        return unauthorized;
      }

      set.headers["content-type"] = "text/html; charset=utf-8";
      return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Audit FitSM API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui'
      });
    </script>
  </body>
</html>`;
    });
};

export type AppBase = ReturnType<typeof createAppBase>;
