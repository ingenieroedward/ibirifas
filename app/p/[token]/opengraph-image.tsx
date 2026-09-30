import { ImageResponse } from "next/og";
import { OG_SIZE, RaffleCard, ogFonts } from "@/lib/ogCards";
import { headers } from "next/headers";
import { getPublicRaffle } from "@/lib/publicRaffle";
import { checkOgRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

export const alt = "Rifa en Ibirifas";
export const size = OG_SIZE;
export const contentType = "image/png";

// What's left changes with every sale, so this is drawn per request, never cached at build.
export const dynamic = "force-dynamic";

/** The picture WhatsApp shows when a raffle's public link is shared. Public data only, same as the page. */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  // Drawing this picture costs CPU on every request, so it is limited per IP (see lib/rateLimit.ts).
  if (!checkOgRateLimit(clientIpFromHeaders(await headers()))) {
    return new Response("Demasiadas solicitudes", { status: 429, headers: { "Retry-After": "60" } });
  }
  const { token } = await params;
  const raffle = await getPublicRaffle(token);
  if (!raffle) return new Response("Not found", { status: 404 });

  return new ImageResponse(<RaffleCard raffle={raffle} />, { ...size, fonts: await ogFonts() });
}
