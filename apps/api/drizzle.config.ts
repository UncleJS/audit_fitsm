// @ts-nocheck
import type { Config } from "drizzle-kit";

export default {
  schema: "./drizzle/schema.ts",
  out: "../../db/migrations",
  dialect: "mysql",
  dbCredentials: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 1262),
    user: process.env.DB_USER ?? "audit_app",
    password: process.env.DB_PASSWORD ?? "change_me",
    database: process.env.DB_NAME ?? "audit_fitsm"
  }
} satisfies Config;
