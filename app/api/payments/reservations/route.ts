import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { nameMatch, openReservations, toCandidateDTO } from "@/lib/pagoradar";

/**
 * Every open reservation of the organization (unpaid, raffles not by stages), to assign a payment by hand.
 * `?payer=` ranks them by how well their names match the bank's holder; `?amount=` puts that amount first.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const tenantId = tenantIdFor(user);
  if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const payer = req.nextUrl.searchParams.get("payer") ?? "";
  const amount = Number(req.nextUrl.searchParams.get("amount"));
  const rank = { strong: 2, weak: 1, none: 0 } as const;
  const list = (await openReservations(tenantId))
    .map((r) => {
      const a = nameMatch(r.payerName, payer);
      const b = nameMatch(r.buyerName, payer);
      return { r, name: rank[a] >= rank[b] ? a : b };
    })
    .sort(
      (x, y) =>
        Number(y.r.amount === amount) - Number(x.r.amount === amount) ||
        rank[y.name] - rank[x.name] ||
        (y.r.soldAt?.getTime() ?? 0) - (x.r.soldAt?.getTime() ?? 0),
    )
    .slice(0, 200)
    .map(({ r, name }) => toCandidateDTO(r, name));
  return NextResponse.json({ reservations: list });
}
