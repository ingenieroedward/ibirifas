import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { ActivationError, reviewPackRequest } from "@/lib/billing";
import { sendPush } from "@/lib/push";

const bodySchema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(200).optional(),
});

/**
 * The superadmin approves a receipt (the pack's raffles are added and the raffle it came from activates) or
 * rejects it with a reason (the organizer can send another). The organizer gets a notice either way.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "SUPERADMIN") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { id } = await params;
  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { action } = parsed.data;
  const reason = parsed.data.reason || null;
  if (action === "reject" && !reason) return NextResponse.json({ error: "Escribe por qué lo rechazas." }, { status: 400 });

  try {
    const done = await reviewPackRequest(id, action, user.name, reason);
    const raffle = done.raffleId ? await prisma.raffle.findUnique({ where: { id: done.raffleId }, select: { name: true } }) : null;
    const url = done.raffleId ? `/rifas/${done.raffleId}` : "/rifas";
    const left = done.raffles - (done.activatedRaffleId ? 1 : 0);
    void sendPush(
      [done.ownerId],
      action === "approve"
        ? {
            title: done.activatedRaffleId ? "Rifa activada" : "Paquete aprobado",
            body: `Recibimos tu pago${done.activatedRaffleId && raffle ? `: «${raffle.name}» ya puede vender` : ""}.${left > 0 ? ` Te ${left === 1 ? "queda 1 rifa" : `quedan ${left} rifas`} de saldo.` : ""}`,
            url,
          }
        : { title: "Comprobante rechazado", body: `${reason} Puedes enviar otro desde la rifa${raffle ? ` «${raffle.name}»` : ""}.`, url },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ActivationError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
