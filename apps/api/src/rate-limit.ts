import type { RateLimitResult } from "./types";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export const resetRateLimits = (): void => {
  buckets.clear();
};

export const checkRateLimit = (key: string, windowMs: number, maxRequests: number): RateLimitResult => {
  const now = Date.now();
  const window = Math.max(1000, windowMs);
  const max = Math.max(1, maxRequests);
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + window });
    return { allowed: true };
  }

  if (current.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  buckets.set(key, current);
  return { allowed: true };
};

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}, 30000).unref?.();

type RequestIpServer = {
  requestIP?: (request: Request) => { address?: string } | null;
};

export const clientAddress = (
  request: Request,
  server: RequestIpServer | null | undefined,
  trustProxy: boolean,
): string => {
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
  }

  const address = server?.requestIP?.(request)?.address?.trim();
  return address && address.length > 0 ? address : "local";
};
