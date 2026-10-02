export type AuthVia = "bearer" | "cookie";

export type AuthPayload = {
  sub: number;
  email: string;
  name: string;
  orgRoles: Record<string, string[]>;
  tokenVersion: number;
};

export type SessionAuth = {
  auth: AuthPayload | null;
  authVia: AuthVia | null;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSec?: number;
};
