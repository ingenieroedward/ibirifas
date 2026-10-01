import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { approvePayment, ignorePayment, PaymentConflict, rematchPayments, reopenPayment, undoPayment } from "@/lib/pagoradar";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), numberIds: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({ action: z.literal("undo") }),
  z.object({ action: z.literal("ignore") }),
  z.object({ action: z.literal("reopen") }),
]);

/** What the team does with a reported payment: approve it for a reservation, undo an approval, ignore, reopen. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const tenantId = tenantIdFor(user);
  if (!tenantId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const payment = await prisma.receivedPayment.findUnique({ where: { id }, select: { ownerId: true } });
  if (!payment || payment.ownerId !== tenantId) return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 });

  const rawBody = await readJsonBody(req, BODY_LIMITS.small);
  if (!rawBody.ok) return rawBody.response;
  const parsed = actionSchema.safeParse(rawBody.value);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const actor = { id: user.id, name: user.name };
  try {
    switch (parsed.data.action) {
      case "approve":
        await approvePayment(id, parsed.data.numberIds, actor);
        break;
      case "undo":
        await undoPayment(id, actor);
        break;
      case "ignore":
        await ignorePayment(id, actor);
        break;
      case "reopen":
        await reopenPayment(id, actor);
        await rematchPayments(tenantId);
        break;
    }
  } catch (err) {
    if (err instanceof PaymentConflict) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
