// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import type { AppBase } from "../app-base";
import type { RowDataPacket } from "../support";
import {
  affectedRowsOf,
  createClientSchema,
  createOrgUserSchema,
  db,
  forbidden,
  getAccessibleOrgIds,
  getUserScope,
  hasOrgRole,
  insertIdOf,
  isSystemAdmin,
  revokeUserSessions,
  unauthorized,
  updateOrgUserRolesSchema,
  withTransaction,
} from "../support";

export const registerOrgRoutes = (app: AppBase): AppBase =>
  app
    .get("/clients", async ({ auth, set }) => {
      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      if (isSystemAdmin(auth)) {
        const [rows] = await db.query<RowDataPacket[]>(
          `SELECT id, name, created_at, updated_at
         FROM organizations
         WHERE archived_at IS NULL
         ORDER BY name ASC`,
        );
        return rows;
      }

      const orgIds = getAccessibleOrgIds(auth);
      if (!orgIds.length) {
        return [];
      }

      const placeholders = orgIds.map(() => "?").join(",");
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id, name, created_at, updated_at
       FROM organizations
       WHERE archived_at IS NULL AND id IN (${placeholders})
       ORDER BY name ASC`,
        orgIds,
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
       WHERE name = ? AND archived_at IS NULL
       LIMIT 1`,
        [clientName],
      );

      if (existingRows.length) {
        set.status = 409;
        return { error: "Client already exists" };
      }

      // A concurrent create with the same name hits uq on the active name; the global error handler maps that to 409.
      const orgId = await withTransaction(async (conn) => {
        const [insertOrg] = await conn.execute(
          `INSERT INTO organizations (name)
         VALUES (?)`,
          [clientName],
        );
        const newOrgId = insertIdOf(insertOrg);

        const [roleRows] = await conn.query<RowDataPacket[]>(
          `SELECT id
         FROM roles
         WHERE code = 'org_admin' AND archived_at IS NULL
         LIMIT 1`,
        );

        if (roleRows.length) {
          await conn.execute(
            `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE created_at = org_user_roles.created_at`,
            [newOrgId, auth.sub, Number(roleRows[0].id), auth.sub],
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
       WHERE archived_at IS NULL
         ${includeSystemRole ? "" : "AND code <> 'system_admin'"}
       ORDER BY id ASC`,
      );
      return rows;
    })
    .get("/orgs/:orgId/users", async ({ auth, params, set }) => {
      const orgId = Number(params.orgId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }
      if (!hasOrgRole(auth, orgId, "org_admin")) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT
         u.id,
         u.email,
         u.display_name,
         u.is_active,
         MAX(CASE WHEN our.archived_at IS NULL THEN 1 ELSE 0 END) AS has_active_org_roles,
         GROUP_CONCAT(
           DISTINCT CASE WHEN our.archived_at IS NULL AND r.archived_at IS NULL THEN r.code END
           ORDER BY r.id SEPARATOR ','
         ) AS roles_csv
       FROM users u
       JOIN org_user_roles our ON our.user_id = u.id AND our.org_id = ?
       LEFT JOIN roles r ON r.id = our.role_id
       WHERE u.archived_at IS NULL
       GROUP BY u.id, u.email, u.display_name, u.is_active
       ORDER BY u.display_name ASC, u.email ASC`,
        [orgId],
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
          .filter(Boolean),
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
       WHERE email = ? AND archived_at IS NULL
       LIMIT 1`,
        [payload.email],
      );

      const [roleRows] = await db.query<RowDataPacket[]>(
        `SELECT id, code
       FROM roles
       WHERE code IN (${payload.roles.map(() => "?").join(",")})
         AND archived_at IS NULL`,
        payload.roles,
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

      const existingUserId = existingUsers.length ? Number(existingUsers[0].id) : null;
      if (existingUserId !== null) {
        // Existing account: this endpoint only grants roles. It never touches the password or display name,
        // otherwise an org_admin could take over any account (including a system_admin) by "re-creating" it.
        const scope = await getUserScope(existingUserId);
        if (scope.hasSystemAdmin) {
          set.status = 409;
          return { error: "User is a system administrator and cannot be managed via the org endpoint" };
        }
        if (scope.orgIds.some((id) => id !== orgId)) {
          set.status = 409;
          return {
            error: "User is already scoped to another client. Non-system-admin users can belong to only one client",
          };
        }
      }

      const passwordHash =
        existingUserId === null ? await Bun.password.hash(payload.password, { algorithm: "argon2id" }) : null;

      const userId = await withTransaction(async (conn) => {
        let targetUserId = existingUserId;
        if (targetUserId === null) {
          const [insertUser] = await conn.execute(
            `INSERT INTO users (email, password_hash, display_name, auth_provider)
           VALUES (?, ?, ?, 'local')`,
            [payload.email, passwordHash, payload.displayName],
          );
          targetUserId = insertIdOf(insertUser);
        }

        for (const role of roleRows) {
          await conn.execute(
            `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE archived_at = NULL, created_at = org_user_roles.created_at`,
            [orgId, targetUserId, Number(role.id), auth.sub],
          );
        }

        if (existingUserId !== null) {
          // Role set changed: existing sessions must pick up the new roles on their next login.
          await revokeUserSessions(existingUserId, conn);
        }
        return targetUserId;
      });

      set.status = 201;
      return { id: userId, email: payload.email, roles: roleCodes, existingUser: existingUserId !== null };
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
        `SELECT id FROM users WHERE id = ? AND archived_at IS NULL LIMIT 1`,
        [userId],
      );
      if (!userRows.length) {
        set.status = 404;
        return { error: "User not found" };
      }

      const targetScope = await getUserScope(userId);
      if (targetScope.hasSystemAdmin && !isSystemAdmin(auth)) {
        set.status = 403;
        return { error: "System administrator roles cannot be changed by an org admin" };
      }

      const [currentRoleRows] = await db.query<RowDataPacket[]>(
        `SELECT r.code
       FROM org_user_roles our
       JOIN roles r ON r.id = our.role_id AND r.archived_at IS NULL
       WHERE our.org_id = ?
         AND our.user_id = ?
         AND our.archived_at IS NULL
       ORDER BY r.code ASC`,
        [orgId, userId],
      );
      const currentRoleCodes = currentRoleRows.map((row) => String(row.code)).sort();

      if (roleCodesRequested.length === 0) {
        // Never archive a system_admin grant through the org endpoint, even when the caller is a system_admin.
        await withTransaction(async (conn) => {
          const [archiveResult] = await conn.execute(
            `UPDATE org_user_roles our
           JOIN roles r ON r.id = our.role_id
           SET our.archived_at = UTC_TIMESTAMP(3)
           WHERE our.org_id = ?
             AND our.user_id = ?
             AND our.archived_at IS NULL
             AND r.code <> 'system_admin'`,
            [orgId, userId],
          );
          if (affectedRowsOf(archiveResult) > 0) {
            await revokeUserSessions(userId, conn);
          }
        });

        return { userId, roles: [], archivedInOrg: true };
      }

      const hasOtherOrgs = targetScope.orgIds.some((id) => id !== orgId);
      if (hasOtherOrgs && !targetScope.hasSystemAdmin) {
        set.status = 409;
        return {
          error: "User is already scoped to another client. Non-system-admin users can belong to only one client",
        };
      }

      const [roleRows] = await db.query<RowDataPacket[]>(
        `SELECT id, code
       FROM roles
       WHERE code IN (${roleCodesRequested.map(() => "?").join(",")})
         AND archived_at IS NULL`,
        roleCodesRequested,
      );

      const foundCodes = roleRows.map((row) => String(row.code));
      const missingRoles = roleCodesRequested.filter((role) => !foundCodes.includes(role));
      if (missingRoles.length) {
        set.status = 400;
        return { error: "Unknown role codes", missingRoles };
      }

      const placeholders = roleCodesRequested.map(() => "?").join(",");
      const nextRoleCodes = [...foundCodes].sort();
      await withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE org_user_roles our
         JOIN roles r ON r.id = our.role_id
         SET our.archived_at = UTC_TIMESTAMP(3)
         WHERE our.org_id = ?
           AND our.user_id = ?
           AND our.archived_at IS NULL
           AND r.archived_at IS NULL
           AND r.code <> 'system_admin'
           AND r.code NOT IN (${placeholders})`,
          [orgId, userId, ...roleCodesRequested],
        );

        for (const role of roleRows) {
          await conn.execute(
            `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by, archived_at)
           VALUES (?, ?, ?, ?, NULL)
           ON DUPLICATE KEY UPDATE archived_at = NULL, created_at = org_user_roles.created_at`,
            [orgId, userId, Number(role.id), auth.sub],
          );
        }

        if (
          JSON.stringify(currentRoleCodes.filter((code) => code !== "system_admin")) !== JSON.stringify(nextRoleCodes)
        ) {
          await revokeUserSessions(userId, conn);
        }
      });

      return { userId, roles: foundCodes, archivedInOrg: false };
    }) as unknown as AppBase;
