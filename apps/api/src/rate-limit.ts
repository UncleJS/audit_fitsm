// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import type { RateLimitResult } from "./types";

type Bucket = { count: number; resetAt: number };

export const DEFAULT_MAX_BUCKETS = 10_000;

const buckets = new Map<string, Bucket>();
// Security-critical buckets (login attempts) live apart from the general map, so flooding the general
// limiter with unique junk paths cannot evict them and reset an attacker's password-guess allowance.
// They are only ever dropped once expired; the per-IP login limit bounds how many keys one client adds.
const protectedBuckets = new Map<string, Bucket>();
let maxBuckets = DEFAULT_MAX_BUCKETS;

export const resetRateLimits = (): void => {
  buckets.clear();
  protectedBuckets.clear();
};

export const setRateLimitMaxBuckets = (value: number): void => {
  maxBuckets = Math.max(1, Math.floor(value));
};

export const rateLimitBucketCount = (): number => buckets.size;

const purgeExpiredIn = (map: Map<string, Bucket>, now: number): void => {
  for (const [key, bucket] of map.entries()) {
    if (now >= bucket.resetAt) {
      map.delete(key);
    }
  }
};

const purgeExpired = (now: number): void => {
  purgeExpiredIn(buckets, now);
  purgeExpiredIn(protectedBuckets, now);
};

/**
 * Makes room for a new bucket. Expired buckets go first; if the map is still full, the oldest
 * buckets (Map preserves insertion order) are dropped so memory stays bounded under key flooding.
 */
const ensureCapacity = (now: number): void => {
  if (buckets.size < maxBuckets) return;
  purgeExpiredIn(buckets, now);
  while (buckets.size >= maxBuckets) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
};

const consume = (
  map: Map<string, Bucket>,
  evictable: boolean,
  key: string,
  windowMs: number,
  maxRequests: number,
): RateLimitResult => {
  const now = Date.now();
  const window = Math.max(1000, windowMs);
  const max = Math.max(1, maxRequests);
  const current = map.get(key);

  if (!current || now >= current.resetAt) {
    if (current) {
      map.delete(key);
    } else if (evictable) {
      ensureCapacity(now);
    }
    map.set(key, { count: 1, resetAt: now + window });
    return { allowed: true };
  }

  if (current.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true };
};

/** General per-route limiter; its map is size-capped and evicts the oldest buckets when full. */
export const checkRateLimit = (key: string, windowMs: number, maxRequests: number): RateLimitResult =>
  consume(buckets, true, key, windowMs, maxRequests);

/** Limiter for security-critical keys (login); never evicted before expiry. */
export const checkProtectedRateLimit = (key: string, windowMs: number, maxRequests: number): RateLimitResult =>
  consume(protectedBuckets, false, key, windowMs, maxRequests);

setInterval(() => {
  purgeExpired(Date.now());
}, 30000).unref?.();

/**
 * Collapses IDs in a path so every audit/org/assessment shares one bucket per route template,
 * e.g. `/audits/12/assessments` becomes `/audits/:id/assessments`.
 */
export const normalizeRoutePath = (pathname: string): string => {
  const segments = pathname.split("/").map((segment) => (/^\d+$/.test(segment) ? ":id" : segment));
  const normalized = segments.join("/").replace(/\/{2,}/g, "/");
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized || "/";
};

type RequestIpServer = {
  requestIP?: (request: Request) => { address?: string } | null;
};

/**
 * Resolves the client address. With a trusted reverse proxy, the rightmost X-Forwarded-For entry is the
 * hop the proxy itself appended; entries to its left are supplied by the client and can be spoofed.
 */
export const clientAddress = (
  request: Request,
  server: RequestIpServer | null | undefined,
  trustProxy: boolean,
): string => {
  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for");
    const hops = (forwarded ?? "")
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }

  const address = server?.requestIP?.(request)?.address?.trim();
  return address && address.length > 0 ? address : "local";
};
