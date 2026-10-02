import mysql, { type Pool } from "mysql2/promise";
import { config } from "./config";

let pool: Pool | null = null;

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
  });

  return pool;
};
