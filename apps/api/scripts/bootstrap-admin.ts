// @ts-nocheck
import mysql from "mysql2/promise";
import { config } from "../src/config";

const email = process.argv[2] ?? "admin@example.com";
const password = process.argv[3] ?? "ChangeMe123!";
const displayName = process.argv[4] ?? "System Admin";
const orgName = process.argv[5] ?? "Default Organization";

const conn = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database
});

await conn.beginTransaction();

try {
  await conn.execute(
    `INSERT INTO organizations (name)
     VALUES (?)
     ON DUPLICATE KEY UPDATE updated_at = UTC_TIMESTAMP(3)`,
    [orgName]
  );

  const [orgRows] = await conn.query(
    "SELECT id FROM organizations WHERE name = ? AND archived_at IS NULL LIMIT 1",
    [orgName]
  );
  const orgId = Number(orgRows[0].id);

  const passwordHash = await Bun.password.hash(password, {
    algorithm: "argon2id"
  });

  await conn.execute(
    `INSERT INTO users (email, password_hash, display_name, auth_provider)
     VALUES (?, ?, ?, 'local')
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       display_name = VALUES(display_name),
       updated_at = UTC_TIMESTAMP(3)`,
    [email, passwordHash, displayName]
  );

  const [userRows] = await conn.query(
    "SELECT id FROM users WHERE email = ? AND archived_at IS NULL LIMIT 1",
    [email]
  );
  const userId = Number(userRows[0].id);

  const [roleRows] = await conn.query(
    "SELECT id, code FROM roles WHERE code IN ('system_admin','org_admin') AND archived_at IS NULL"
  );

  for (const role of roleRows as any[]) {
    await conn.execute(
      `INSERT INTO org_user_roles (org_id, user_id, role_id, created_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE created_at = org_user_roles.created_at`,
      [orgId, userId, role.id, userId]
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
