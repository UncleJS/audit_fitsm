export const SESSION_COOKIE = "audit_fitsm_session";

const secureAttribute = (): string => (process.env.NODE_ENV === "production" ? "; Secure" : "");

export const sessionCookieHeader = (token: string, maxAgeSec: number): string =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSec))}${secureAttribute()}`;

export const clearSessionCookieHeader = (): string =>
  `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureAttribute()}`;

export const readSessionCookie = (request: Request): string | null => {
  const raw = request.headers.get("cookie");
  if (!raw) return null;

  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq);
    if (name !== SESSION_COOKIE) continue;
    const value = trimmed.slice(eq + 1);
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
};

export const extractBearer = (authorization?: string | null): string | null => {
  if (!authorization) return null;
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token || null;
};
