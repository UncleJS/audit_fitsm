// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import mysql, { type Pool, type PoolConnection } from "mysql2/promise";
import { config } from "./config";

let pool: Pool | null = null;

/** Every stored date/time is UTC; pin the session zone so NOW()/CURRENT_TIMESTAMP never use a local zone. */
export const UTC_SESSION_SQL = "SET time_zone = '+00:00'";

export const getDb = (): Pool => {
  if (pool) {
    return pool;
  }

  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true,
    dateStrings: true,
    timezone: "Z",
  });

  // mysql2/promise wraps a callback pool; its 'connection' event fires once per new physical connection.
  pool.pool.on("connection", (connection) => {
    connection.query(UTC_SESSION_SQL, (error: unknown) => {
      if (error) {
        console.error("[db] failed to set UTC session time zone", error);
        connection.destroy();
      }
    });
  });

  return pool;
};

export type Queryable = Pick<PoolConnection, "query" | "execute">;

type MysqlError = { code?: string; errno?: number };

const mysqlErrorOf = (error: unknown): MysqlError | null =>
  error && typeof error === "object" ? (error as MysqlError) : null;

export const isDuplicateKeyError = (error: unknown): boolean => {
  const e = mysqlErrorOf(error);
  return e?.code === "ER_DUP_ENTRY" || e?.errno === 1062;
};

export const isRetryableTxError = (error: unknown): boolean => {
  const e = mysqlErrorOf(error);
  return e?.code === "ER_LOCK_DEADLOCK" || e?.errno === 1213 || e?.code === "ER_LOCK_WAIT_TIMEOUT" || e?.errno === 1205;
};

/**
 * Runs `fn` inside one transaction on a dedicated pool connection: commit on success, rollback on any error.
 * Deadlocks and lock-wait timeouts are retried (`retries` extra attempts) because InnoDB rolls the whole
 * transaction back in that case and a fresh attempt is the documented remedy.
 */
export const withTransaction = async <T>(
  fn: (conn: PoolConnection) => Promise<T>,
  options: { retries?: number } = {},
): Promise<T> => {
  const retries = Math.max(0, options.retries ?? 2);
  for (let attempt = 0; ; attempt += 1) {
    const conn = await getDb().getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch {
        // Keep the original error; a failed rollback leaves nothing committed anyway.
      }
      if (attempt < retries && isRetryableTxError(error)) {
        continue;
      }
      throw error;
    } finally {
      conn.release();
    }
  }
};
