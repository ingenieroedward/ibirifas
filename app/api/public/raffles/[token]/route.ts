import { NextRequest, NextResponse } from "next/server";
import { getPublicRaffle } from "@/lib/publicRaffle";
import { checkPublicRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * The public, read-only view of a raffle. No login: knowing the secret token is
 * the permission. Returns the narrow PublicRaffleDTO only (see lib/publicRaffle).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (!checkPublicRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Demasiadas consultas. Espera un momento." }, { status: 429 });
  }

  const { token } = await params;
  const raffle = await getPublicRaffle(token);
  if (!raffle) {
    return NextResponse.json({ error: "Este enlace ya no está disponible." }, { status: 404 });
  }
  return NextResponse.json(raffle, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
