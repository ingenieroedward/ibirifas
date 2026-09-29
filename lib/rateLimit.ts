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

const publicHits = new Map<string, number[]>();
const PUBLIC_WINDOW_MS = 60 * 1000;
const PUBLIC_MAX_HITS = 60;

/**
 * Allowance for the anonymous public raffle page: 60 requests a minute per IP.
 * One open page polls a few times a minute, so this only stops scraping.
 */
export function checkPublicRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (publicHits.get(ip) ?? []).filter((ts) => now - ts < PUBLIC_WINDOW_MS);
  if (recent.length >= PUBLIC_MAX_HITS) {
    publicHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  publicHits.set(ip, recent);

  if (publicHits.size > 10_000) {
    for (const [key, timestamps] of publicHits) {
      if (timestamps.every((ts) => now - ts >= PUBLIC_WINDOW_MS)) publicHits.delete(key);
    }
  }
  return true;
}

const reserveHits = new Map<string, number[]>();
const RESERVE_WINDOW_MS = 60 * 60 * 1000;
const RESERVE_MAX_HITS = 6;

/** Reservations from the public link cost real numbers, so they get a much tighter allowance: 6 an hour per IP. */
export function checkReserveRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (reserveHits.get(ip) ?? []).filter((ts) => now - ts < RESERVE_WINDOW_MS);
  if (recent.length >= RESERVE_MAX_HITS) {
    reserveHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  reserveHits.set(ip, recent);

  if (reserveHits.size > 10_000) {
    for (const [key, timestamps] of reserveHits) {
      if (timestamps.every((ts) => now - ts >= RESERVE_WINDOW_MS)) reserveHits.delete(key);
    }
  }
  return true;
}

const lookupHits = new Map<string, number[]>();
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;
const LOOKUP_MAX_HITS = 10;

/**
 * Attaching a receipt by phone number is a lookup ("does this phone have a reservation?"),
 * so it is limited to 10 tries an hour per IP to stop someone from probing numbers.
 */
export function checkReceiptLookupLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (lookupHits.get(ip) ?? []).filter((ts) => now - ts < LOOKUP_WINDOW_MS);
  if (recent.length >= LOOKUP_MAX_HITS) {
    lookupHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  lookupHits.set(ip, recent);

  if (lookupHits.size > 10_000) {
    for (const [key, timestamps] of lookupHits) {
      if (timestamps.every((ts) => now - ts >= LOOKUP_WINDOW_MS)) lookupHits.delete(key);
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
