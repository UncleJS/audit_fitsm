import { jwt } from "@elysiajs/jwt";
import Elysia from "elysia";
import type { AuthPayload, AuthVia, RowDataPacket } from "./support";
import {
  anonymousSession,
  applyCorsHeaders,
  buildOrgRoles,
  checkRateLimit,
  claimRecord,
  clientAddress,
  config,
  db,
  extractBearer,
  getContentSecurityPolicy,
  hasTokenVersionColumn,
  openApiDoc,
  readSessionCookie,
  unauthorized,
} from "./support";

export const createAppBase = () =>
  new Elysia()
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
      const method = request.method;
      const route = new URL(request.url).pathname;
      const bucketKey = `${ip}:${method}:${route}`;
      const rate = checkRateLimit(bucketKey, config.rateLimit.windowMs, config.rateLimit.maxRequests);

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
    .derive(async ({ request, jwt }) => {
      const bearer = extractBearer(request.headers.get("authorization"));
      const cookieToken = bearer ? null : readSessionCookie(request);
      const token = bearer ?? cookieToken;
      const authVia: AuthVia | null = bearer ? "bearer" : cookieToken ? "cookie" : null;
      if (!token || !authVia) {
        return anonymousSession;
      }

      const verified = await jwt.verify(token);
      const claims = claimRecord(verified);
      if (!claims) {
        return anonymousSession;
      }

      const exp = Number(claims.exp ?? 0);
      if (exp && Date.now() >= exp * 1000) {
        return anonymousSession;
      }

      const userId = Number(claims.sub);
      const tokenVersion = Number(claims.tokenVersion);
      if (!Number.isInteger(userId) || !Number.isInteger(tokenVersion)) {
        return anonymousSession;
      }

      const tokenVersionColumnExists = await hasTokenVersionColumn();
      const [userRows] = await db.query<RowDataPacket[]>(
        tokenVersionColumnExists
          ? `SELECT id, email, display_name, is_active, token_version
           FROM users
           WHERE id = ? AND archived_at IS NULL
           LIMIT 1`
          : `SELECT id, email, display_name, is_active
           FROM users
           WHERE id = ? AND archived_at IS NULL
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
       JOIN roles r ON r.id = our.role_id AND r.archived_at IS NULL
       WHERE our.user_id = ? AND our.archived_at IS NULL`,
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
        authVia,
      };
    })
    .onBeforeHandle(({ request, authVia, set }) => {
      if (authVia !== "cookie") return;
      const method = request.method.toUpperCase();
      if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
      if (request.headers.get("x-audit-fitsm") !== "1") {
        set.status = 403;
        return { error: "Forbidden" };
      }
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
    });

export type AppBase = ReturnType<typeof createAppBase>;
