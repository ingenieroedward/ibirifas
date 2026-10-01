/**
 * Cloudflare Turnstile ("no soy un robot", usually invisible) on the public reservation form. Optional:
 * with TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY set, a reservation needs a token the widget hands
 * the visitor's browser, checked here with Cloudflare; without them nothing changes.
 */

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY : null;
}

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** True when the token is valid (or Turnstile is off). Fails closed if Cloudflare can't be reached. */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSiteKey() || !secret) return true;
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    // Test-only override so a local mock can stand in for Cloudflare. Never set in production.
    const res = await fetch(process.env.TURNSTILE_VERIFY_URL || VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[turnstile] verification failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
