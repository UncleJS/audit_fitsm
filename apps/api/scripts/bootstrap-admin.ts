// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import type { RowDataPacket } from "mysql2";
import mysql from "mysql2/promise";
import { config } from "../src/config";

// Usage: BOOTSTRAP_ADMIN_PASSWORD=... bun scripts/bootstrap-admin.ts [email] [password] [displayName] [orgName]
// The password should come from BOOTSTRAP_ADMIN_PASSWORD; argv still works but is visible in `ps` and shell history.
const MIN_PASSWORD_LENGTH = 12;

const email = process.argv[2] ?? "admin@example.com";
const argvPassword = process.argv[3];
const displayName = process.argv[4] ?? "System Admin";
const orgName = process.argv[5] ?? "Default Organization";

const envPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
let password: string;
if (envPassword) {
  password = envPassword;
} else if (argvPassword) {
  console.warn(
    "warning: password passed on the command line; prefer the BOOTSTRAP_ADMIN_PASSWORD env var (argv is visible to other local users)",
  );
  password = argvPassword;
} else {
  console.error(
    "error: set BOOTSTRAP_ADMIN_PASSWORD (or pass the password as the second argument). There is no default.",
  );
  process.exit(1);
}

if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`error: the admin password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  process.exit(1);
}

const conn = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  timezone: "Z",
});
await conn.query("SET time_zone = '+00:00'");

const [tokenVersionRows] = await conn.query<RowDataPacket[]>(
  `SELECT 1 FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'token_version'
   LIMIT 1`,
);
const hasTokenVersion = tokenVersionRows.length > 0;

await conn.beginTransaction();

try {
  await conn.execute(
    `INSERT INTO organizations (name)
     VALUES (?)
     ON DUPLICATE KEY UPDATE updated_at = UTC_TIMESTAMP(3)`,
    [orgName],
  );

  const [orgRows] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM organizations WHERE name = ? AND archived_at IS NULL LIMIT 1",
    [orgName],
  );
  const orgRow = orgRows[0];
  if (!orgRow) throw new Error("Organization bootstrap failed");
  const orgId = Number(orgRow.id);

  const passwordHash = await Bun.password.hash(password, {
    algorithm: "argon2id",
  });

  // Resetting an existing admin's password also bumps token_version, which invalidates every live session.
  await conn.execute(
    hasTokenVersion
      ? `INSERT INTO users (email, password_hash, display_name, auth_provider)
         VALUES (?, ?, ?, 'local')
         ON DUPLICATE KEY UPDATE
           password_hash = VALUES(password_hash),
           display_name = VALUES(display_name),
           token_version = token_version + 1,
           updated_at = UTC_TIMESTAMP(3)`
      : `INSERT INTO users (email, password_hash, display_name, auth_provider)
         VALUES (?, ?, ?, 'local')
         ON DUPLICATE KEY UPDATE
           password_hash = VALUES(password_hash),
           display_name = VALUES(display_name),
           updated_at = UTC_TIMESTAMP(3)`,
    [email, passwordHash, displayName],
  );

  const [userRows] = await conn.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE email = ? AND archived_at IS NULL LIMIT 1",
    [email],
  );
  const userRow = userRows[0];
  if (!userRow) throw new Error("User bootstrap failed");
  const userId = Number(userRow.id);

  const [roleRows] = await conn.query<RowDataPacket[]>(
    "SELECT id, code FROM roles WHERE code IN ('system_admin','org_admin') AND archived_at IS NULL",
  );

  for (const role of roleRows) {
    await conn.execute(
      `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE created_at = org_user_roles.created_at`,
      [orgId, userId, role.id, userId],
    );
  }

  await conn.commit();
  console.log(JSON.stringify({ orgId, userId, email }, null, 2));
} catch (error) {
  await conn.rollback();
  throw error;
} finally {
  await conn.end();
}
