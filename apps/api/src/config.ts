const insecureDefaults = process.env.ALLOW_INSECURE_DEFAULTS === "1";

const readEnv = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const rejectDefaultSecret = (name: string, value: string, blocked: string): string => {
  const productionLike = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "staging";
  if (value === blocked && (productionLike || !insecureDefaults)) {
    throw new Error(
      `${name} must be overridden. Local Quadlet and CI may set ALLOW_INSECURE_DEFAULTS=1; production and staging may not.`,
    );
  }
  return value;
};

export const config = {
  appPort: Number(process.env.APP_PORT ?? 1261),
  jwtSecret: rejectDefaultSecret(
    "JWT_SECRET",
    readEnv("JWT_SECRET", insecureDefaults ? "replace-with-strong-secret" : undefined),
    "replace-with-strong-secret",
  ),
  jwtTtlSec: Math.max(60, Number(process.env.JWT_TTL_SEC ?? 900)),
  exportsDir: process.env.EXPORTS_DIR ?? "/workspace/data/exports",
  trustProxy: process.env.TRUST_PROXY === "1",
  allowInsecureDefaults: insecureDefaults,
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    maxRequests: Number(process.env.RATE_LIMIT_MAX ?? 300),
  },
  loginRateLimit: {
    windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
    maxRequests: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10),
  },
  cors: {
    allowedOrigins: String(process.env.CORS_ALLOWED_ORIGINS ?? "http://127.0.0.1:1260,http://localhost:1260")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  },
  db: {
    host: readEnv("DB_HOST", "127.0.0.1"),
    port: Number(process.env.DB_PORT ?? 1262),
    user: readEnv("DB_USER", "audit_app"),
    password: rejectDefaultSecret(
      "DB_PASSWORD",
      readEnv("DB_PASSWORD", insecureDefaults ? "change_me" : undefined),
      "change_me",
    ),
    database: readEnv("DB_NAME", "audit_fitsm"),
  },
};
