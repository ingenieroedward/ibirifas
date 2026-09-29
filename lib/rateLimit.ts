import type { NextRequest } from "next/server";

/**
 * Tiny in-memory sliding-window rate limiter. Good enough for a single-
 * instance MVP; if the app is ever scaled horizontally this should move to
 * a shared store (e.g. Redis).
 */

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 8;

const attemptsByKey = new Map<string, number[]>();

/**
 * Returns true when the given IP is still within its allowance, and records
 * this attempt. Returns false when the IP has exceeded MAX_ATTEMPTS within
 * the trailing WINDOW_MS window (the caller should reject the request).
 */
export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const existing = attemptsByKey.get(ip) ?? [];
  const recent = existing.filter((ts) => now - ts < WINDOW_MS);

  if (recent.length >= MAX_ATTEMPTS) {
    attemptsByKey.set(ip, recent);
    return false;
  }

  recent.push(now);
  attemptsByKey.set(ip, recent);

  // Opportunistically avoid unbounded growth across many distinct IPs.
  if (attemptsByKey.size > 10_000) {
    for (const [key, timestamps] of attemptsByKey) {
      if (timestamps.every((ts) => now - ts >= WINDOW_MS)) {
        attemptsByKey.delete(key);
      }
    }
  }

  return true;
}

/** Best-effort client IP extraction for App Router requests. */
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
