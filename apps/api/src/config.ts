// @ts-nocheck
const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const config = {
  appPort: Number(process.env.APP_PORT ?? 1261),
  jwtSecret: required("JWT_SECRET", "replace-with-strong-secret"),
  jwtTtlSec: Math.max(60, Number(process.env.JWT_TTL_SEC ?? 900)),
  exportsDir: process.env.EXPORTS_DIR ?? "/workspace/data/exports",
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    maxRequests: Number(process.env.RATE_LIMIT_MAX ?? 300)
  },
  cors: {
    allowedOrigins: String(
      process.env.CORS_ALLOWED_ORIGINS ?? "http://127.0.0.1:1260,http://localhost:1260"
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  },
  db: {
    host: required("DB_HOST", "127.0.0.1"),
    port: Number(process.env.DB_PORT ?? 1262),
    user: required("DB_USER", "audit_app"),
    password: required("DB_PASSWORD", "change_me"),
    database: required("DB_NAME", "audit_fitsm")
  }
};

if (
  (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging") &&
  config.jwtSecret === "replace-with-strong-secret"
) {
  throw new Error("JWT_SECRET must be overridden outside development/test environments");
}
