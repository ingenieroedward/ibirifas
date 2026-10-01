import { NextRequest, NextResponse } from "next/server";
import { getReservation } from "@/lib/publicReservation";
import { checkPublicRateLimit, getClientIp } from "@/lib/rateLimit";

/** "Mi reserva": the state of one online reservation, for its buyer (the secret key is the permission). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; key: string }> }) {
  if (!checkPublicRateLimit(getClientIp(req))) {
    return NextResponse.json({ error: "Demasiadas consultas. Espera un momento." }, { status: 429 });
  }
  const { token, key } = await params;
  const reservation = await getReservation(token, key);
  if (!reservation) {
    return NextResponse.json({ error: "Esta reserva ya no está activa." }, { status: 404 });
  }
  return NextResponse.json(reservation, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
