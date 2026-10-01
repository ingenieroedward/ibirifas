import { prisma } from "@/lib/prisma";
import { toStageDTO } from "@/lib/stageDto";
import { accountSelect, toAccountDTO } from "@/lib/accounts";
import { amountRemaining, installmentCount, standingOf, stageSettingsOf } from "@/lib/stages";
import type { ReservationDTO } from "@/lib/types";
import { holdDeadline } from "@/lib/holds";

const SHAPE = /^[A-Za-z0-9_-]{22}$/;

/**
 * One online reservation, as its buyer sees it on "Mi reserva" (/p/<token>/reserva/<key>): what they
 * reserved, whether the payment is waiting, under review, rejected (and why) or confirmed, and how long
 * they have. The reservation's secret key is the permission (it was handed only to them), so their own
 * name can be shown; nothing about other buyers is. Null when the link or the reservation no longer exists
 * (released or resold).
 */
export async function getReservation(token: string, key: string): Promise<ReservationDTO | null> {
  if (!SHAPE.test(token) || !SHAPE.test(key)) return null;
  const raffle = await prisma.raffle.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      name: true,
      status: true,
      numberPrice: true,
      holdDays: true,
      drawDate: true,
      themeBackground: true,
      themeNumberColor: true,
      stageDeadlineDays: true,
      fullPayPerk: true,
      fullPayDiscount: true,
      accounts: { orderBy: { position: "asc" }, select: accountSelect },
      groups: { select: { id: true, label: true, price: true } },
      stages: { orderBy: { position: "asc" } },
    },
  });
  if (!raffle) return null;
  const rows = await prisma.raffleNumber.findMany({
    where: { raffleId: raffle.id, holdToken: key, online: true, status: { not: "available" } },
    orderBy: { value: "asc" },
    select: {
      value: true,
      status: true,
      groupId: true,
      buyerName: true,
      buyerEmail: true,
      photoDataUrl: true,
      soldAt: true,
      receiptRejectedAt: true,
      receiptRejectReason: true,
      quotas: { select: { quota: true, amount: true, paidAt: true }, orderBy: { quota: "asc" } },
    },
  });
  if (rows.length === 0) return null;

  const setIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => g !== null))];
  const sets = raffle.groups.filter((g) => setIds.includes(g.id)).sort((a, b) => a.label.localeCompare(b.label));
  const loose = rows.filter((r) => r.groupId === null);
  const total = sets.reduce((sum, g) => sum + g.price, 0) + loose.length * raffle.numberPrice;

  const stageSettings = stageSettingsOf({
    stages: raffle.stages.map(toStageDTO),
    stageDeadlineDays: raffle.stageDeadlineDays,
    fullPayPerk: raffle.fullPayPerk === "discount" || raffle.fullPayPerk === "draw" ? raffle.fullPayPerk : "none",
    fullPayDiscount: raffle.fullPayDiscount,
  });

  const allPaid = rows.every((r) => r.status === "paid");
  const inReview = rows.some((r) => r.status !== "paid" && r.photoDataUrl);
  const rejected = rows.find((r) => r.status !== "paid" && !r.photoDataUrl && r.receiptRejectedAt);
  const state: ReservationDTO["state"] = allPaid ? "paid" : inReview ? "review" : rejected ? "rejected" : "pending";

  const soldAt = rows.map((r) => r.soldAt).find(Boolean) ?? null;
  // The payment deadline only applies while nothing at all has been paid.
  const nothingPaid = rows.every((r) => r.status !== "paid" && r.quotas.length === 0);
  // Due after `holdDays`, or the day before the draw if that's sooner (raffles by stages: their own deadlines).
  const deadline =
    nothingPaid && soldAt && raffle.holdDays
      ? new Date(holdDeadline(soldAt, raffle.holdDays, raffle.stages.length === 0 ? raffle.drawDate : null)).toISOString()
      : null;

  let stages: ReservationDTO["stages"] = null;
  if (stageSettings) {
    const quotas = (r: (typeof rows)[number]) => r.quotas.map((q) => ({ quota: q.quota, paidAt: q.paidAt.toISOString() }));
    const standing = standingOf(quotas(rows[0]!), stageSettings);
    stages = {
      paid: Math.min(...rows.map((r) => r.quotas.length)),
      total: installmentCount(stageSettings.stages),
      paidAmount: rows.reduce((sum, r) => sum + r.quotas.reduce((s, q) => s + q.amount, 0), 0),
      owed: rows.reduce((sum, r) => sum + amountRemaining(quotas(r), stageSettings.stages), 0),
      dueNow: rows.reduce((sum, r) => sum + standingOf(quotas(r), stageSettings).due, 0),
      nextStage: standing.stage ? standing.stage.label : null,
      lastDay: standing.lastDay,
    };
  }

  return {
    raffleName: raffle.name,
    raffleClosed: raffle.status === "closed",
    buyerName: rows[0]!.buyerName,
    hasEmail: rows.some((r) => r.buyerEmail),
    sets: sets.map((g) => ({ label: g.label, price: g.price })),
    numbers: loose.map((r) => r.value),
    total,
    state,
    rejectReason: rejected?.receiptRejectReason ?? null,
    deadline,
    accounts: raffle.accounts.map(toAccountDTO),
    stages,
    themeBackground: raffle.themeBackground,
    themeNumberColor: raffle.themeNumberColor,
  };
}
