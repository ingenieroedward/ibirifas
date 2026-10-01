import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { numberInclude, toNumberDTO } from "@/lib/numberDto";
import { publishRaffleChange } from "@/lib/realtime";
import { syncCompletion } from "@/lib/completion";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { notifyTeam } from "@/lib/push";
import { currentPaidStage, deadlineOf, installmentPrices, installmentsNeeded, paidStages } from "@/lib/stages";
import type { PaymentStatus } from "@/lib/types";
import { buyerRowSelect, emailBuyers, mailOrigin } from "@/lib/buyerMail";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("next"),
    ids: z.array(z.string().min(1)).min(1).max(100),
    paymentMethod: z.enum(["cash", "nequi", "breb", "transfer", "other"]),
  }),
  z.object({
    action: z.literal("due"),
    ids: z.array(z.string().min(1)).min(1).max(100),
    paymentMethod: z.enum(["cash", "nequi", "breb", "transfer", "other"]),
  }),
  z.object({
    action: z.literal("all"),
    ids: z.array(z.string().min(1)).min(1).max(100),
    paymentMethod: z.enum(["cash", "nequi", "breb", "transfer", "other"]),
  }),
  z.object({ action: z.literal("undo"), ids: z.array(z.string().min(1)).min(1).max(100) }),
]);

class Conflict extends Error {}

/**
 * Installments of a raffle by stages, for one or several numbers of the same raffle:
 * - "next" collects each number's next installment;
 * - "due" collects what each number needs to play the stage being collected now (a late buyer catches up the
 *   earlier installments); numbers already up to date are left as they are;
 * - "all" collects everything still owed (with the up-front discount when the raffle has one, nothing was
 *   paid yet and the first stage's deadline hasn't passed);
 * - "undo" takes back each number's last installment.
 * A number with every installment paid becomes "paid". All or nothing.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const input = parsed.data;
  const ids = [...new Set(input.ids)];

  const found = await prisma.raffleNumber.findMany({
    where: { id: { in: ids } },
    select: { id: true, raffleId: true, raffle: { select: { ownerId: true, name: true } } },
  });
  const tenantId = tenantIdFor(user);
  if (!tenantId || found.length !== ids.length || found.some((n) => n.raffle.ownerId !== tenantId)) {
    return NextResponse.json({ error: "Número no encontrado" }, { status: 404 });
  }
  if (new Set(found.map((n) => n.raffleId)).size !== 1) {
    return NextResponse.json({ error: "Los números deben ser de la misma rifa" }, { status: 400 });
  }
  const raffleId = found[0]!.raffleId;
  const raffle = await prisma.raffle.findUniqueOrThrow({
    where: { id: raffleId },
    select: { name: true, fullPayPerk: true, fullPayDiscount: true, stageDeadlineDays: true, stages: true },
  });
  const stages = raffle.stages.map((s) => ({
    position: s.position,
    price: s.price,
    bonus: s.bonus,
    label: s.label,
    outcome: s.outcome as "won" | "house" | null,
    drawDate: s.drawDate ? s.drawDate.toISOString() : null,
  }));
  if (stages.length === 0) return NextResponse.json({ error: "Esta rifa no es por etapas." }, { status: 400 });
  const prices = installmentPrices(stages);
  const count = prices.length;
  const now = new Date();
  const firstDeadline = paidStages(stages)[0] ? deadlineOf(paidStages(stages)[0]!, raffle.stageDeadlineDays) : null;
  const collecting = currentPaidStage(stages);
  const neededNow = collecting ? installmentsNeeded(collecting, stages) : count;
  const discountApplies = raffle.fullPayPerk === "discount" && (raffle.fullPayDiscount ?? 0) > 0 && (!firstDeadline || now <= firstDeadline);

  let collected = 0;
  const touched: { value: number; buyerName: string | null; from: number; to: number }[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.raffleNumber.findMany({
        where: { id: { in: ids } },
        select: { id: true, value: true, status: true, buyerName: true, quotas: { select: { quota: true, amount: true }, orderBy: { quota: "asc" } } },
      });
      for (const n of rows) {
        if (n.status === "available") throw new Conflict(`El ${formatNumberValue(n.value)} no tiene comprador.`);
        const paid = n.quotas.length;
        if (input.action === "undo") {
          if (paid === 0) throw new Conflict(`El ${formatNumberValue(n.value)} no tiene cuotas pagadas.`);
          const last = n.quotas[paid - 1]!;
          await tx.numberQuota.deleteMany({ where: { numberId: n.id, quota: last.quota } });
          collected -= last.amount;
          touched.push({ value: n.value, buyerName: n.buyerName, from: paid, to: paid - 1 });
        } else {
          if (paid >= count) throw new Conflict(`El ${formatNumberValue(n.value)} ya pagó todas las cuotas.`);
          const upTo = input.action === "next" ? paid + 1 : input.action === "due" ? Math.min(count, Math.max(paid, neededNow)) : count;
          if (upTo === paid) continue;
          const rowsToCreate = [];
          for (let k = paid + 1; k <= upTo; k++) rowsToCreate.push({ quota: k, amount: prices[k - 1]! });
          // Paying everything at once before the first deadline earns the up-front discount, taken off the last one.
          if (input.action === "all" && paid === 0 && discountApplies) {
            const last = rowsToCreate[rowsToCreate.length - 1]!;
            last.amount = Math.max(0, last.amount - raffle.fullPayDiscount!);
          }
          await tx.numberQuota.createMany({
            data: rowsToCreate.map((q) => ({ ...q, numberId: n.id, raffleId, method: input.paymentMethod, paidAt: now, byId: user.id })),
          });
          collected += rowsToCreate.reduce((sum, q) => sum + q.amount, 0);
          touched.push({ value: n.value, buyerName: n.buyerName, from: paid, to: upTo });
        }
        const after = input.action === "undo" ? paid - 1 : touched[touched.length - 1]!.to;
        const full = after >= count;
        await tx.raffleNumber.update({
          where: { id: n.id },
          data: {
            status: full ? "paid" : "occupied",
            paymentStatus: (full ? "paid" : "pending") satisfies PaymentStatus,
            paymentMethod: full ? (input.action === "undo" ? undefined : input.paymentMethod) : null,
            paymentRef: null,
            updatedById: user.id,
          },
        });
      }
      if (touched.length === 0) throw new Conflict(rows.length === 1 ? "Ya está al día." : "Ya están al día.");
    });
  } catch (err) {
    if (err instanceof Conflict) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }

  publishRaffleChange(raffleId);
  void syncCompletion(raffleId);

  if (input.action !== "undo" && touched.length > 0) {
    const buyers = [...new Set(touched.map((t) => t.buyerName).filter(Boolean))];
    const who = buyers.length === 0 ? "un comprador" : buyers.length <= 2 ? buyers.join(" y ") : "varios compradores";
    const what =
      touched.length === 1
        ? touched[0]!.to - touched[0]!.from === 1
          ? `la cuota ${touched[0]!.to} de ${count} del ${formatNumberValue(touched[0]!.value)}`
          : `las cuotas ${touched[0]!.from + 1} a ${touched[0]!.to} del ${formatNumberValue(touched[0]!.value)}`
        : `cuotas de ${touched.length} números`;
    void notifyTeam(tenantId, user.id, {
      title: raffle.name,
      body: `${user.name} cobró ${what} a ${who} · ${formatCurrency(collected)}`,
      url: `/rifas/${raffleId}`,
    });
  }

  if (input.action !== "undo" && touched.length > 0) {
    // Buyers with an email: "cuota N de M" or, once everything is paid, "pago confirmado".
    const rows = await prisma.raffleNumber.findMany({ where: { id: { in: ids } }, select: { ...buyerRowSelect, status: true } });
    const origin = await mailOrigin();
    const full = rows.filter((r) => r.status === "paid");
    const partial = rows.filter((r) => r.status !== "paid");
    if (full.length > 0) void emailBuyers(raffleId, full, { kind: "approved", method: input.paymentMethod }, origin);
    if (partial.length > 0) void emailBuyers(raffleId, partial, { kind: "installment" }, origin);
  }

  const updated = await prisma.raffleNumber.findMany({ where: { id: { in: ids } }, orderBy: { value: "asc" }, include: numberInclude });
  return NextResponse.json(updated.map(toNumberDTO));
}
