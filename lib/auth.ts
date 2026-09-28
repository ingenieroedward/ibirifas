import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { NextResponse } from "next/server";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_PEPPER = process.env.REFRESH_TOKEN_PEPPER;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_PEPPER) {
  throw new Error(
    "ACCESS_TOKEN_SECRET and REFRESH_TOKEN_PEPPER must be set (see .env.example)",
  );
}

export const ACCESS_TOKEN_COOKIE = "ibirifas_at";
export const REFRESH_TOKEN_COOKIE = "ibirifas_rt";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface AccessTokenPayload {
  sub: string; // AdminUser id
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies AccessTokenPayload, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET);
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
  return crypto.createHmac("sha256", REFRESH_TOKEN_PEPPER as string).update(token).digest("hex");
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
