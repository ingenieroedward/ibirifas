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

/**
 * The caller's IP as seen by the reverse proxy in front of the app (Traefik on Dokploy).
 *
 * A proxy APPENDS the address it received the connection from to `X-Forwarded-For`, so whatever comes
 * before that is written by the client and can be anything: reading the first entry would let an
 * attacker dodge every rate limit by sending a different fake value each time. The address to trust is
 * the one added by the last trusted proxy, counted from the right. `TRUSTED_PROXY_HOPS` says how many
 * proxies are in front of the app (default 1; use 2 when something like Cloudflare sits before Traefik).
 */
export function clientIpFromHeaders(headers: Headers): string {
  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (entries.length > 0) return entries[Math.max(0, entries.length - hops)]!;
  return headers.get("x-real-ip") ?? "unknown";
}

/** Best-effort client IP extraction for App Router requests. */
export function getClientIp(req: NextRequest): string {
  return clientIpFromHeaders(req.headers);
}

const ogHits = new Map<string, number[]>();
const OG_WINDOW_MS = 60 * 1000;
const OG_MAX_HITS = 30;

/**
 * The raffle's preview picture is drawn on every request (it changes with each sale), which costs real CPU,
 * so it gets its own allowance: 30 a minute per IP. Chat apps ask for it once per shared link.
 */
export function checkOgRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (ogHits.get(ip) ?? []).filter((ts) => now - ts < OG_WINDOW_MS);
  if (recent.length >= OG_MAX_HITS) {
    ogHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  ogHits.set(ip, recent);
  if (ogHits.size > 10_000) {
    for (const [key, timestamps] of ogHits) {
      if (timestamps.every((ts) => now - ts >= OG_WINDOW_MS)) ogHits.delete(key);
    }
  }
  return true;
}

const orgFailures = new Map<string, number[]>();
const ORG_WINDOW_MS = 15 * 60 * 1000;

/** Failed logins tolerated per organization in the window; the platform owner (no organization) gets fewer. */
function orgFailureLimit(orgKey: string): number {
  return orgKey === "" ? 30 : 60;
}

/**
 * The per-IP limit stops one machine, but an attacker with many IPs could still grind through the 1,000,000
 * possible 6-digit codes of one organization. So failures are also counted per organization: past the limit,
 * logins for that organization wait out the window (sustained guessing then yields a few tries a minute, which
 * is centuries of work). The cost is that a determined attacker can also keep the real team waiting.
 */
export function isOrgLoginLocked(orgKey: string): boolean {
  const now = Date.now();
  const recent = (orgFailures.get(orgKey) ?? []).filter((ts) => now - ts < ORG_WINDOW_MS);
  orgFailures.set(orgKey, recent);
  return recent.length >= orgFailureLimit(orgKey);
}

export function recordOrgLoginFailure(orgKey: string): void {
  const now = Date.now();
  const recent = (orgFailures.get(orgKey) ?? []).filter((ts) => now - ts < ORG_WINDOW_MS);
  recent.push(now);
  orgFailures.set(orgKey, recent);
  if (orgFailures.size > 10_000) {
    for (const [key, timestamps] of orgFailures) {
      if (timestamps.every((ts) => now - ts >= ORG_WINDOW_MS)) orgFailures.delete(key);
    }
  }
}
