import { headers } from "next/headers";

const FALLBACK = "http://localhost:3000";

/**
 * The address this request came in on (https://rifas.example.com), used to give
 * shared-link pictures the absolute URL that WhatsApp & co. need. Behind Dokploy's
 * proxy that's the forwarded host/protocol; `APP_URL` overrides it when set.
 * Anything that doesn't look like a plain host is ignored.
 */
export async function requestOrigin(): Promise<URL> {
  const override = process.env.APP_URL;
  if (override) {
    try {
      const url = new URL(override);
      if (url.protocol === "http:" || url.protocol === "https:") return new URL(url.origin);
    } catch {
      // Fall through to the request headers.
    }
  }

  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0]!.trim();
  const forwardedProto = (h.get("x-forwarded-proto") ?? "").split(",")[0]!.trim();
  const proto = forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : /^localhost(:\d+)?$/.test(host) ? "http" : "https";

  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(host)) return new URL(FALLBACK);
  return new URL(`${proto}://${host}`);
}
