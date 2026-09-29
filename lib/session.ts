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

  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;

  return { id: user.id, name: user.name, role: user.role as Role, ownerId: user.ownerId, plan: user.plan };
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
