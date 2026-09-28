import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { NextResponse } from "next/server";

// Read lazily (not at module load) so `next build` can statically evaluate
// this module for page-data collection without the runtime secrets being
// set yet — they're only required once a request actually needs them.
function getAccessTokenSecret(): string {
  const value = process.env.ACCESS_TOKEN_SECRET;
  if (!value) throw new Error("ACCESS_TOKEN_SECRET must be set (see .env.example)");
  return value;
}

function getRefreshTokenPepper(): string {
  const value = process.env.REFRESH_TOKEN_PEPPER;
  if (!value) throw new Error("REFRESH_TOKEN_PEPPER must be set (see .env.example)");
  return value;
}

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./authCookies";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./authCookies";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AccessTokenPayload {
  sub: string; // AdminUser id
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, getAccessTokenSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getAccessTokenSecret());
    if (typeof decoded === "object" && decoded && typeof decoded.sub === "string") {
      return { sub: decoded.sub };
    }
    return null;
  } catch {
    return null;
  }
}

/** Opaque, high-entropy refresh token. Only its hash is ever persisted. */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHmac("sha256", getRefreshTokenPepper()).update(token).digest("hex");
}

/** bcrypt-verified 6-digit login code. Kept separate from token hashing on purpose. */
export function isValidLoginCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

const cookieBaseOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function setAuthCookies(
  res: NextResponse,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...cookieBaseOptions,
    maxAge: ACCESS_TOKEN_TTL_SECONDS,
  });
  res.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...cookieBaseOptions,
    maxAge: REFRESH_TOKEN_TTL_MS / 1000,
  });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_TOKEN_COOKIE, "", { ...cookieBaseOptions, maxAge: 0 });
  res.cookies.set(REFRESH_TOKEN_COOKIE, "", { ...cookieBaseOptions, maxAge: 0 });
}
