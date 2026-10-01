import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { checkPublicRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * The QR image of a payment account (a Bre-B llave). Payment details are meant to be seen by buyers, so
 * it is served to anyone holding the raffle's public link (`?t=<token>`, as the public page and the emails
 * do) and to its team. Accounts are recreated when the raffle is edited, so an id always names the same
 * image and can be cached.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = req.nextUrl.searchParams.get("t");
  const notFound = () => NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const account = await prisma.raffleAccount.findUnique({
    where: { id },
    select: { qrDataUrl: true, raffle: { select: { ownerId: true, publicToken: true } } },
  });
  if (!account?.qrDataUrl) return notFound();

  let isPublic = false;
  if (token) {
    if (!checkPublicRateLimit(getClientIp(req))) return NextResponse.json({ error: "Demasiadas consultas" }, { status: 429 });
    if (!account.raffle.publicToken || token !== account.raffle.publicToken) return notFound();
    isPublic = true;
  } else {
    const user = await getCurrentUser(req);
    if (!user || tenantIdFor(user) !== account.raffle.ownerId) return notFound();
  }

  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(account.qrDataUrl);
  if (!match) return notFound();
  return new NextResponse(new Uint8Array(Buffer.from(match[2]!, "base64")), {
    headers: {
      "Content-Type": match[1]!,
      "Cache-Control": isPublic ? "public, max-age=86400" : "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
