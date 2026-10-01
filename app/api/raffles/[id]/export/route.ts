import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { buildRaffleWorkbook } from "@/lib/raffleExport";

/**
 * The raffle as an Excel file (buyers, phones, payments…). Organizer only: it holds every buyer's
 * personal data in one file, more than a seller needs to do their job.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "ORGANIZER") return NextResponse.json({ error: "Solo el organizador puede exportar la rifa." }, { status: 403 });
  const { id } = await params;
  const raffle = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true } });
  if (!raffle || raffle.ownerId !== tenantIdFor(user)) {
    return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  }
  const file = await buildRaffleWorkbook(id);
  if (!file) return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
