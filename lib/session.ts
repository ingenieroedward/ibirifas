import type { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/types";

/**
 * Reads the access token cookie off an incoming request and returns the
 * authenticated AdminUser id, or null if missing/invalid/expired.
 */
export function getCurrentUserId(req: NextRequest): string | null {
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;

  const payload = verifyAccessToken(token);
  return payload?.sub ?? null;
}

/**
 * Convenience helper for route handlers: returns the user id, or null (the
 * caller is expected to respond 401 in that case).
 */
export function requireAuth(req: NextRequest): string | null {
  return getCurrentUserId(req);
}

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  ownerId: string | null;
  plan: string;
  /** The organization code this person logs in under (see lib/orgCode.ts). */
  orgCode: string | null;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * True for a state-changing request that a browser says came from a different site or origin. SameSite=Lax
 * cookies already keep cross-site requests from carrying the session, but sibling subdomains count as the same
 * site, so the Origin is compared with the host the request was addressed to as well. Requests without those
 * headers (scripts, curl) are not browser cross-site requests and pass.
 */
export function isCrossSiteWrite(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return false;
  if (req.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return origin === "null";
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const allowed = new Set<string>();
  for (const value of [req.headers.get("host"), req.headers.get("x-forwarded-host")]) {
    if (value) allowed.add(value.split(",")[0]!.trim());
  }
  if (process.env.APP_URL) {
    try {
      allowed.add(new URL(process.env.APP_URL).host);
    } catch {
      // A malformed APP_URL is reported elsewhere; it just doesn't widen what is allowed.
    }
  }
  return !allowed.has(originHost);
}

/**
 * Fetches the full authenticated AdminUser from the DB (not just the JWT
 * subject) so role/active/ownerId are always current — a deactivated user or
 * a role change takes effect on the next request, not after the access
 * token's 15-minute lifetime.
 */
export async function getCurrentUser(req: NextRequest): Promise<SessionUser | null> {
  const userId = getCurrentUserId(req);
  if (!userId) return null;
  // The session cookie must never authorize a change requested by another website (CSRF).
  if (isCrossSiteWrite(req)) return null;

  const user = await prisma.adminUser.findUnique({
    where: { id: userId },
    include: { owner: { select: { orgCode: true, active: true } } },
  });
  if (!user || !user.active) return null;
  // A suspended organizer suspends their whole team, including sessions that were already open.
  if (user.owner && !user.owner.active) return null;

  return {
    id: user.id,
    name: user.name,
    role: user.role as Role,
    ownerId: user.ownerId,
    plan: user.plan,
    // Organizers carry their own code; sellers belong to their organizer's.
    orgCode: user.orgCode ?? user.owner?.orgCode ?? null,
  };
}

/**
 * The tenant root id that scopes what raffles/users a session can see:
 * SUPERADMIN has none (they operate on organizers, not raffles), an
 * ORGANIZER's tenant is themself, and a SELLER's tenant is their owner.
 */
export function tenantIdFor(user: SessionUser): string | null {
  if (user.role === "ORGANIZER") return user.id;
  if (user.role === "SELLER") return user.ownerId;
  return null;
}
