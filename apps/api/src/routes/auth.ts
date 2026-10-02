import type { AppBase } from "../app-base";
import type { RowDataPacket } from "../support";
import {
  buildOrgRoles,
  checkRateLimit,
  clearSessionCookieHeader,
  clientAddress,
  config,
  db,
  hasTokenVersionColumn,
  loginSchema,
  sessionCookieHeader,
  unauthorized,
} from "../support";

export const registerAuthRoutes = (app: AppBase): AppBase =>
  app
    .post("/auth/login", async ({ body, set, jwt, request, server }) => {
      const parsed = loginSchema.safeParse(body);
      const ip = clientAddress(request, server, config.trustProxy);
      const emailKey = parsed.success ? parsed.data.email.toLowerCase() : "invalid";
      const limited = checkRateLimit(
        `login:${ip}:${emailKey}`,
        config.loginRateLimit.windowMs,
        config.loginRateLimit.maxRequests,
      );
      if (!limited.allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(limited.retryAfterSec ?? 1);
        return { error: "Rate limit exceeded" };
      }
      if (!parsed.success) {
        set.status = 400;
        return { error: "Invalid login payload", details: parsed.error.flatten() };
      }
      const payload = parsed.data;

      const tokenVersionColumnExists = await hasTokenVersionColumn();
      const [users] = await db.query<RowDataPacket[]>(
        tokenVersionColumnExists
          ? `SELECT id, email, password_hash, display_name, auth_provider, is_active, token_version
           FROM users
           WHERE email = ? AND archived_at IS NULL
           LIMIT 1`
          : `SELECT id, email, password_hash, display_name, auth_provider, is_active
           FROM users
           WHERE email = ? AND archived_at IS NULL
           LIMIT 1`,
        [payload.email],
      );

      if (!users.length || users[0].auth_provider !== "local" || !users[0].is_active) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const valid = await Bun.password.verify(payload.password, String(users[0].password_hash));
      if (!valid) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const [roleRows] = await db.query<RowDataPacket[]>(
        `SELECT our.org_id, r.code AS role_code
       FROM org_user_roles our
       JOIN roles r ON r.id = our.role_id AND r.archived_at IS NULL
       WHERE our.user_id = ? AND our.archived_at IS NULL`,
        [users[0].id],
      );

      const orgRoles = buildOrgRoles(roleRows);
      const nowSec = Math.floor(Date.now() / 1000);

      const token = await jwt.sign({
        sub: String(users[0]?.id ?? ""),
        email: String(users[0]?.email ?? ""),
        name: String(users[0]?.display_name ?? ""),
        orgRoles,
        tokenVersion: Number(users[0]?.token_version ?? 1),
        exp: nowSec + config.jwtTtlSec,
      });

      await db.execute("UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?", [users[0].id]);

      set.headers["set-cookie"] = sessionCookieHeader(token, config.jwtTtlSec);
      return { accessToken: token };
    })
    .post("/auth/logout", ({ set }) => {
      set.headers["set-cookie"] = clearSessionCookieHeader();
      return { ok: true };
    })
    .get("/me", ({ auth, set }) => {
      if (!auth) {
        set.status = 401;
        return unauthorized;
      }
      return auth;
    }) as unknown as AppBase;
