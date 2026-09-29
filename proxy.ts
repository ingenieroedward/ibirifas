import { NextRequest, NextResponse } from "next/server";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/authCookies";

export function proxy(req: NextRequest) {
  const hasSession =
    req.cookies.has(ACCESS_TOKEN_COOKIE) || req.cookies.has(REFRESH_TOKEN_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// Soft UX guard only — real enforcement is the 401s in the API routes.
// Excludes /login itself, the service worker script (browsers fetch it
// without going through the app), all /api routes (auth endpoints must be reachable
// unauthenticated, and other API routes should return JSON 401s rather than
// redirect), Next internals, and common static assets.
export const config = {
  matcher: [
    "/((?!login|api|_next|favicon.ico|manifest.json|sw.js|icons|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)",
  ],
};
