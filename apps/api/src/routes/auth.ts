// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import type { AppBase } from "../app-base";
import type { AuthPayload, RowDataPacket } from "../support";
import {
  buildOrgRoles,
  checkProtectedRateLimit,
  clearSessionCookieHeader,
  clientAddress,
  config,
  db,
  hasTokenVersionColumn,
  loginSchema,
  revokeUserSessions,
  sessionCookieHeader,
  unauthorized,
} from "../support";

// A valid argon2id hash of a random throwaway value. Verifying against it when the account does not exist
// keeps the response time of "unknown user" close to "wrong password", so emails cannot be enumerated by timing.
const dummyPasswordHash = Bun.password.hash(crypto.randomUUID(), { algorithm: "argon2id" });

const rateLimited = (set: { status?: number | string; headers: Record<string, string | number> }, retry?: number) => {
  set.status = 429;
  set.headers["retry-after"] = String(retry ?? 1);
  return { error: "Rate limit exceeded" };
};

type SignFn = (payload: Record<string, string | number | Record<string, string[]>>) => Promise<string>;

const signSession = async (sign: SignFn, auth: AuthPayload): Promise<{ token: string; expiresInSec: number }> => {
  const nowSec = Math.floor(Date.now() / 1000);
  const token = await sign({
    sub: String(auth.sub),
    email: auth.email,
    name: auth.name,
    orgRoles: auth.orgRoles,
    tokenVersion: auth.tokenVersion,
    exp: nowSec + config.jwtTtlSec,
  });
  return { token, expiresInSec: config.jwtTtlSec };
};

export const registerAuthRoutes = (app: AppBase): AppBase =>
  app
    .post("/auth/login", async ({ body, set, jwt, request, server }) => {
      const parsed = loginSchema.safeParse(body);
      const ip = clientAddress(request, server, config.trustProxy);

      // Two independent buckets: per IP (password spraying across many accounts) and per email (guessing one
      // account from many addresses). Both must pass.
      const ipLimit = checkProtectedRateLimit(
        `login-ip:${ip}`,
        config.loginRateLimit.windowMs,
        config.loginRateLimit.maxRequestsPerIp,
      );
      if (!ipLimit.allowed) {
        return rateLimited(set, ipLimit.retryAfterSec);
      }
      if (!parsed.success) {
        set.status = 400;
        return { error: "Invalid login payload", details: parsed.error.flatten() };
      }
      const payload = parsed.data;

      const emailLimit = checkProtectedRateLimit(
        `login-email:${payload.email.toLowerCase()}`,
        config.loginRateLimit.windowMs,
        config.loginRateLimit.maxRequests,
      );
      if (!emailLimit.allowed) {
        return rateLimited(set, emailLimit.retryAfterSec);
      }

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

      const user = users[0];
      const usable = Boolean(user && user.auth_provider === "local" && Number(user.is_active) === 1);
      const hash = usable && user ? String(user.password_hash) : await dummyPasswordHash;
      const valid = await Bun.password.verify(payload.password, hash).catch(() => false);

      if (!usable || !user || !valid) {
        set.status = 401;
        return { error: "Invalid credentials" };
      }

      const [roleRows] = await db.query<RowDataPacket[]>(
        `SELECT our.org_id, r.code AS role_code
       FROM org_user_roles our
       JOIN roles r ON r.id = our.role_id AND r.archived_at IS NULL
       WHERE our.user_id = ? AND our.archived_at IS NULL`,
        [user.id],
      );

      const { token, expiresInSec } = await signSession(jwt.sign as unknown as SignFn, {
        sub: Number(user.id),
        email: String(user.email ?? ""),
        name: String(user.display_name ?? ""),
        orgRoles: buildOrgRoles(roleRows),
        tokenVersion: Number(user.token_version ?? 1),
      });

      await db.execute("UPDATE users SET last_login_at = UTC_TIMESTAMP(3) WHERE id = ?", [user.id]);

      set.headers["set-cookie"] = sessionCookieHeader(token, expiresInSec);
      return { ok: true, expiresInSec };
    })
    .post("/auth/refresh", async ({ auth, set, jwt }) => {
      if (!auth) {
        set.status = 401;
        set.headers["set-cookie"] = clearSessionCookieHeader();
        return unauthorized;
      }

      // `auth` was rebuilt from the database by the session derive, so roles and token version are current.
      const { token, expiresInSec } = await signSession(jwt.sign as unknown as SignFn, auth);
      set.headers["set-cookie"] = sessionCookieHeader(token, expiresInSec);
      return { ok: true, expiresInSec };
    })
    .post("/auth/logout", async ({ auth, set }) => {
      if (auth) {
        // Bump token_version so every outstanding copy of this session (other tabs, stolen cookies) dies too.
        await revokeUserSessions(auth.sub);
      }
      set.headers["set-cookie"] = clearSessionCookieHeader();
      return { ok: true };
    })
    .get("/me", ({ auth, sessionExp, set }) => {
      if (!auth) {
        set.status = 401;
        return unauthorized;
      }
      return {
        ...auth,
        sessionExpiresAt: sessionExp ? new Date(sessionExp * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") : null,
      };
    }) as unknown as AppBase;
