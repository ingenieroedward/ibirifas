import type { NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from "@/lib/auth";

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
