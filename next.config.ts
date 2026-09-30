import type { NextConfig } from "next";

/**
 * Browser-side protections sent with every page:
 * - the CSP allows only this site's own scripts, styles, images (plus data:/blob: for receipt photos and the
 *   share picture) and connections, forbids plugins, <base> tricks and being framed;
 * - `unsafe-inline` stays on scripts and styles because Next.js writes small inline scripts and styles itself;
 * - the referrer is never sent, so the secret in a public raffle link (/p/<token>) can't leak to a site the
 *   visitor opens from it (WhatsApp, a payment app, …).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
      {
        // Everything the API returns is private to whoever asked (the live stream sets its own cache headers).
        source: "/api/((?!raffles/[^/]+/events$).*)",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        // A cached service worker would keep old push-handling code alive on
        // people's phones; browsers should always revalidate it.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
