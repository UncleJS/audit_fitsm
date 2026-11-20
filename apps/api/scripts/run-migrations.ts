// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { config } from "../src/config";

const migrationsDir = resolve(import.meta.dir, "../../../db/migrations");

const connection = await mysql.createConnection({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  multipleStatements: true,
  timezone: "Z",
});

// Pin the session to UTC before anything else, so CURRENT_TIMESTAMP below evaluates to UTC.
await connection.execute("SET time_zone = '+00:00'");

// Serialize concurrent runners (e.g. two containers starting at once) so a migration is never applied twice.
const LOCK_NAME = "audit_fitsm_migrations";
const [lockRows] = await connection.query("SELECT GET_LOCK(?, 60) AS acquired", [LOCK_NAME]);
const acquired = Array.isArray(lockRows) ? Number((lockRows[0] as { acquired?: unknown })?.acquired) : 0;
if (acquired !== 1) {
  await connection.end();
  throw new Error(`Could not acquire migration lock '${LOCK_NAME}' within 60 seconds`);
}

try {
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      UNIQUE KEY uq_schema_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const files = (await readdir(migrationsDir))
    .filter((entry) => entry.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const filename of files) {
    const [applied] = await connection.query("SELECT 1 FROM schema_migrations WHERE filename = ? LIMIT 1", [filename]);

    if (Array.isArray(applied) && applied.length > 0) {
      console.log(`skip ${filename}`);
      continue;
    }

    // MariaDB only accepts CURRENT_TIMESTAMP (not UTC_TIMESTAMP) in column DEFAULT / ON UPDATE clauses. The rewrite
    // is safe because this session (and the server) run at time_zone '+00:00', so CURRENT_TIMESTAMP is UTC too.
    const sql = (await readFile(resolve(migrationsDir, filename), "utf8")).replaceAll(
      "UTC_TIMESTAMP(3)",
      "CURRENT_TIMESTAMP(3)",
    );
    console.log(`apply ${filename}`);
    await connection.query(sql);
    await connection.execute("INSERT INTO schema_migrations (filename) VALUES (?)", [filename]);
  }
} finally {
  await connection.query("SELECT RELEASE_LOCK(?)", [LOCK_NAME]).catch(() => undefined);
  await connection.end();
}
console.log("migrations complete");
