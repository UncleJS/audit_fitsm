// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { parsePositiveNumber } from "./env";

const readEnv = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const envNumber = (name: string, fallback: number): number => parsePositiveNumber(name, process.env[name], fallback);

const rejectDefaultSecret = (name: string, value: string, blocked: string): string => {
  if (value === blocked) {
    throw new Error(`${name} must be set to a real secret (install.sh creates it as a Podman secret).`);
  }
  return value;
};

export const config = {
  appPort: envNumber("APP_PORT", 1261),
  jwtSecret: rejectDefaultSecret("JWT_SECRET", readEnv("JWT_SECRET"), "replace-with-strong-secret"),
  jwtTtlSec: Math.max(60, envNumber("JWT_TTL_SEC", 900)),
  exportsDir: process.env.EXPORTS_DIR ?? "/workspace/data/exports",
  trustProxy: process.env.TRUST_PROXY === "1",
  rateLimit: {
    windowMs: envNumber("RATE_LIMIT_WINDOW_MS", 60000),
    /** Requests per client IP, method and normalized route per window. */
    maxRequests: envNumber("RATE_LIMIT_MAX", 300),
    /** Requests per client IP across all routes per window. */
    maxRequestsPerIp: envNumber("RATE_LIMIT_IP_MAX", 1200),
    maxBuckets: envNumber("RATE_LIMIT_MAX_BUCKETS", 10000),
  },
  loginRateLimit: {
    windowMs: envNumber("LOGIN_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),
    /** Failed attempts per (email address, client IP) per window. */
    maxRequestsPerEmailIp: envNumber("LOGIN_RATE_LIMIT_MAX", 10),
    /** Failed attempts per email address across all IPs per window (brute-force backstop). */
    maxRequestsPerEmailGlobal: envNumber("LOGIN_RATE_LIMIT_EMAIL_GLOBAL_MAX", 100),
    /** Attempts per client IP per window (covers spraying many emails from one address). */
    maxRequestsPerIp: envNumber("LOGIN_RATE_LIMIT_IP_MAX", 30),
  },
  cors: {
    allowedOrigins: String(process.env.CORS_ALLOWED_ORIGINS ?? "http://127.0.0.1:1260,http://localhost:1260")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  },
  db: {
    host: readEnv("DB_HOST", "127.0.0.1"),
    port: envNumber("DB_PORT", 3306),
    user: readEnv("DB_USER", "audit_app"),
    password: rejectDefaultSecret("DB_PASSWORD", readEnv("DB_PASSWORD"), "change_me"),
    database: readEnv("DB_NAME", "audit_fitsm"),
  },
};
