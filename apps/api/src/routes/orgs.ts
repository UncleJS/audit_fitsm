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

      const [insertOrg] = await db.execute(
        `INSERT INTO organizations (name)
       VALUES (?)`,
        [clientName],
      );

      const orgId = insertIdOf(insertOrg);

      const [roleRows] = await db.query<RowDataPacket[]>(
        `SELECT id
       FROM roles
       WHERE code = 'org_admin' AND archived_at IS NULL
       LIMIT 1`,
      );

      if (roleRows.length) {
        await db.execute(
          `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE created_at = org_user_roles.created_at`,
          [orgId, auth.sub, Number(roleRows[0].id), auth.sub],
        );
      }

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

      const passwordHash = await Bun.password.hash(payload.password, {
        algorithm: "argon2id",
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
            error: "User is already scoped to another client. Non-system-admin users can belong to only one client",
          };
        }

        await db.execute(
          `UPDATE users
         SET display_name = ?, password_hash = ?, is_active = 1, updated_at = UTC_TIMESTAMP(3)
         WHERE id = ? AND archived_at IS NULL`,
          [payload.displayName, passwordHash, userId],
        );
        shouldRevokeUserSessions = true;
      } else {
        const [insertUser] = await db.execute(
          `INSERT INTO users (email, password_hash, display_name, auth_provider)
         VALUES (?, ?, ?, 'local')`,
          [payload.email, passwordHash, payload.displayName],
        );
        userId = insertIdOf(insertUser);
      }

      for (const role of roleRows) {
        await db.execute(
          `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE archived_at = NULL, created_at = org_user_roles.created_at`,
          [orgId, userId, Number(role.id), auth.sub],
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
        `SELECT id FROM users WHERE id = ? AND archived_at IS NULL LIMIT 1`,
        [userId],
      );
      if (!userRows.length) {
        set.status = 404;
        return { error: "User not found" };
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
        const [archiveResult] = await db.execute(
          `UPDATE org_user_roles
         SET archived_at = UTC_TIMESTAMP(3)
         WHERE org_id = ?
           AND user_id = ?
           AND archived_at IS NULL`,
          [orgId, userId],
        );

        if (affectedRowsOf(archiveResult) > 0) {
          await revokeUserSessions(userId);
        }

        return { userId, roles: [], archivedInOrg: true };
      }

      const scope = await getUserScope(userId);
      const hasOtherOrgs = scope.orgIds.some((id) => id !== orgId);
      if (hasOtherOrgs && !scope.hasSystemAdmin) {
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
      await db.execute(
        `UPDATE org_user_roles our
       JOIN roles r ON r.id = our.role_id
       SET our.archived_at = UTC_TIMESTAMP(3)
       WHERE our.org_id = ?
         AND our.user_id = ?
         AND our.archived_at IS NULL
         AND r.archived_at IS NULL
         AND r.code NOT IN (${placeholders})`,
        [orgId, userId, ...roleCodesRequested],
      );

      for (const role of roleRows) {
        await db.execute(
          `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by, archived_at)
         VALUES (?, ?, ?, ?, NULL)
         ON DUPLICATE KEY UPDATE archived_at = NULL, created_at = org_user_roles.created_at`,
          [orgId, userId, Number(role.id), auth.sub],
        );
      }

      const nextRoleCodes = [...foundCodes].sort();
      if (JSON.stringify(currentRoleCodes) !== JSON.stringify(nextRoleCodes)) {
        await revokeUserSessions(userId);
      }

      return { userId, roles: foundCodes, archivedInOrg: false };
    }) as unknown as AppBase;
