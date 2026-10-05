import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { formatNumberValue } from "@/lib/format";
import { notifyTeam } from "@/lib/push";
import { emailDrawResult, mailOrigin } from "@/lib/buyerMail";
import { publishRaffleChange } from "@/lib/realtime";
import { currentStage, playsStage } from "@/lib/stages";
import { toStageDTO } from "@/lib/stageDto";
import type { RaffleStage } from "@prisma/client";

const schema = z.object({ winnerValue: z.number().int().min(0) });

type Params = { params: Promise<{ id: string; stageId: string }> };

async function load(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser(req);
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (user.role !== "ORGANIZER") return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  const { id, stageId } = await params;
  const raffle = await prisma.raffle.findUnique({
    where: { id },
    select: { id: true, name: true, ownerId: true, status: true, totalNumbers: true, stageDeadlineDays: true, stages: { orderBy: { position: "asc" } } },
  });
  const tenantId = tenantIdFor(user);
  if (!raffle || !tenantId || raffle.ownerId !== tenantId) return { error: NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 }) };
  const stage = raffle.stages.find((s) => s.id === stageId);
  if (!stage) return { error: NextResponse.json({ error: "Etapa no encontrada" }, { status: 404 }) };
  return { user, tenantId, raffle, stage };
}

const asLike = (s: RaffleStage) => ({
  position: s.position,
  price: s.price,
  bonus: s.bonus,
  label: s.label,
  outcome: s.outcome as "won" | "house" | null,
  drawDate: s.drawDate ? s.drawDate.toISOString() : null,
});

/**
 * Records the number that came out in a stage's draw. The prize goes to its buyer only if the number plays that
 * stage (installments paid by the deadline; for the bonus draw, everything paid up front); otherwise, or when
 * nobody has the number, it stays with the organizer ("house"). Stages are recorded in order; when the last one
 * is recorded the raffle closes by itself.
 */
export async function POST(req: NextRequest, ctx: Params) {
  const loaded = await load(req, ctx);
  if ("error" in loaded) return loaded.error;
  const { user, tenantId, raffle, stage } = loaded;

  if (raffle.status !== "active") return NextResponse.json({ error: "La rifa está cerrada." }, { status: 409 });
  const next = currentStage(raffle.stages.map(asLike));
  if (stage.outcome || !next || next.position !== stage.position) {
    return NextResponse.json({ error: "Las etapas se registran en orden: esta no es la que sigue." }, { status: 409 });
  }

  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success || parsed.data.winnerValue >= raffle.totalNumbers) {
    return NextResponse.json({ error: `Escribe un número entre 00 y ${formatNumberValue(raffle.totalNumbers - 1)}.` }, { status: 400 });
  }
  const winnerValue = parsed.data.winnerValue;

  const number = await prisma.raffleNumber.findFirst({
    where: { raffleId: raffle.id, value: winnerValue },
    select: { status: true, buyerName: true, quotas: { select: { quota: true, paidAt: true } } },
  });
  const now = new Date();
  const plays =
    !!number &&
    number.status !== "available" &&
    playsStage(
      number.quotas.map((q) => ({ quota: q.quota, paidAt: q.paidAt.toISOString() })),
      asLike(stage),
      raffle.stages.map(asLike),
      raffle.stageDeadlineDays,
      now,
    );
  const outcome = plays ? "won" : "house";

  const remainingAfter = raffle.stages.filter((s) => !s.outcome && s.id !== stage.id).length;
  const lastPaid = [...raffle.stages].filter((s) => !s.bonus).pop();
  await prisma.$transaction(async (tx) => {
    await tx.raffleStage.update({
      where: { id: stage.id },
      data: { winnerValue, outcome, winnerName: plays ? number!.buyerName : null, drawnAt: now },
    });
    if (remainingAfter === 0) {
      // Every stage played: the raffle is over. Its winner is the last paid stage's, when someone won it.
      const finalWon = lastPaid && (lastPaid.id === stage.id ? plays : lastPaid.outcome === "won");
      const finalValue = lastPaid ? (lastPaid.id === stage.id ? winnerValue : lastPaid.winnerValue) : null;
      await tx.raffle.update({ where: { id: raffle.id }, data: { status: "closed", closedAt: now, winnerValue: finalWon ? finalValue : null } });
    }
  });
  publishRaffleChange(raffle.id);

  void notifyTeam(tenantId, user.id, {
    title: `${raffle.name} · ${stage.label}`,
    body: plays
      ? `Salió el ${formatNumberValue(winnerValue)}: gana ${number!.buyerName ?? "su comprador"} (${stage.prize})`
      : number && number.status !== "available"
        ? `Salió el ${formatNumberValue(winnerValue)}, pero no estaba al día: el premio queda en la casa`
        : `Salió el ${formatNumberValue(winnerValue)}, que nadie tenía: el premio queda en la casa`,
    url: `/rifas/${raffle.id}`,
  });

  void emailDrawResult(
    raffle.id,
    {
      winnerValue,
      outcome: plays ? "won" : number && number.status !== "available" ? "house" : "nobody",
      prize: stage.prize,
      stageLabel: stage.label,
      more: remainingAfter > 0,
    },
    await mailOrigin(),
  );

  const updated = await prisma.raffleStage.findUniqueOrThrow({ where: { id: stage.id } });
  return NextResponse.json({ stage: toStageDTO(updated), closed: remainingAfter === 0 });
}

/** Undoes the most recent result (to fix a mistyped number); reopens the raffle if that result had closed it. */
export async function DELETE(req: NextRequest, ctx: Params) {
  const loaded = await load(req, ctx);
  if ("error" in loaded) return loaded.error;
  const { raffle, stage } = loaded;
  const lastDrawn = [...raffle.stages].filter((s) => s.outcome).sort((a, b) => b.position - a.position)[0];
  if (!stage.outcome || !lastDrawn || lastDrawn.id !== stage.id) {
    return NextResponse.json({ error: "Solo se puede deshacer el último resultado registrado." }, { status: 409 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.raffleStage.update({ where: { id: stage.id }, data: { winnerValue: null, outcome: null, winnerName: null, drawnAt: null } });
    if (raffle.status === "closed") {
      await tx.raffle.update({ where: { id: raffle.id }, data: { status: "active", closedAt: null, winnerValue: null } });
    }
  });
  publishRaffleChange(raffle.id);
  const updated = await prisma.raffleStage.findUniqueOrThrow({ where: { id: stage.id } });
  return NextResponse.json({ stage: toStageDTO(updated) });
}
