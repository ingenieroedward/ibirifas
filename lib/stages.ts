import { formatCurrency, formatDrawDate } from "@/lib/format";
import type { FullPayPerk, QuotaDTO, RaffleStageDTO } from "@/lib/types";

/**
 * Rules of a raffle by stages, shared by the server (who plays, what is owed) and the screens.
 *
 * - Every non-bonus stage costs one installment; the k-th of them (in order of play) needs k installments.
 * - An installment counts for a stage only if it was paid by that stage's deadline: the end of the day
 *   `deadlineDays` days before its draw date (with no date, by the time of the draw).
 * - The bonus stage is played only by numbers that paid every installment by the first stage's deadline.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

type StageLike = Pick<RaffleStageDTO, "position" | "price" | "bonus" | "drawDate" | "outcome" | "label">;
type QuotaLike = Pick<QuotaDTO, "quota" | "paidAt">;

export function sortedStages<T extends Pick<RaffleStageDTO, "position">>(stages: T[]): T[] {
  return stages.slice().sort((a, b) => a.position - b.position);
}

/** The stages that cost an installment, in order of play. */
export function paidStages<T extends StageLike>(stages: T[]): T[] {
  return sortedStages(stages).filter((s) => !s.bonus);
}

export function installmentCount(stages: StageLike[]): number {
  return paidStages(stages).length;
}

/** The installment prices, in order (installment 1 is the first non-bonus stage's price). */
export function installmentPrices(stages: StageLike[]): number[] {
  return paidStages(stages).map((s) => s.price);
}

export function totalPrice(stages: StageLike[]): number {
  return installmentPrices(stages).reduce((a, b) => a + b, 0);
}

/** How many installments a number needs to play `stage` (all of them for the bonus draw). */
export function installmentsNeeded(stage: StageLike, stages: StageLike[]): number {
  if (stage.bonus) return installmentCount(stages);
  return paidStages(stages).findIndex((s) => s.position === stage.position) + 1;
}

/**
 * When payments stop counting for `stage`: the end of the day `deadlineDays` days before its draw (with 3 and a
 * draw on the 10th, payments made through the 7th count); null when it has no date. Draw dates are calendar days
 * stored as UTC midnight, so the cutoff is a UTC midnight too.
 */
export function deadlineOf(stage: Pick<RaffleStageDTO, "drawDate">, deadlineDays: number): Date | null {
  if (!stage.drawDate) return null;
  return new Date(new Date(stage.drawDate).getTime() - (deadlineDays - 1) * DAY_MS);
}

/** The last day to pay for `stage`, as a calendar day ("7 de octubre de 2026"); null when it has no date. */
export function lastPayDay(stage: Pick<RaffleStageDTO, "drawDate">, deadlineDays: number): string | null {
  const deadline = deadlineOf(stage, deadlineDays);
  return deadline ? formatDrawDate(new Date(deadline.getTime() - 1).toISOString()) : null;
}

/** The next stage to be played (the first one without a result), or null when all are done. */
export function currentStage<T extends StageLike>(stages: T[]): T | null {
  return sortedStages(stages).find((s) => !s.outcome) ?? null;
}

/** The next non-bonus stage still to be played: the one whose installment is being collected now. */
export function currentPaidStage<T extends StageLike>(stages: T[]): T | null {
  return paidStages(stages).find((s) => !s.outcome) ?? null;
}

/**
 * Whether a sold number plays `stage`: it paid the installments that stage needs by its deadline (or by `at`,
 * normally now, when the stage has no date yet). For the bonus draw: every installment by the first stage's
 * deadline.
 */
export function playsStage(
  quotas: QuotaLike[],
  stage: StageLike,
  stages: StageLike[],
  deadlineDays: number,
  at: Date = new Date(),
): boolean {
  if (stage.bonus) {
    const first = paidStages(stages)[0];
    if (!first) return false;
    const cutoff = deadlineOf(first, deadlineDays) ?? at;
    return quotas.filter((q) => new Date(q.paidAt) <= cutoff).length >= installmentCount(stages);
  }
  const cutoff = deadlineOf(stage, deadlineDays) ?? at;
  const effective = cutoff < at ? cutoff : at;
  return quotas.filter((q) => new Date(q.paidAt) <= effective).length >= installmentsNeeded(stage, stages);
}

/** What a number must still pay to play the stage being collected now (catching up earlier installments too). */
export function amountDueNow(quotas: QuotaLike[], stages: StageLike[]): number {
  const stage = currentPaidStage(stages);
  if (!stage) return 0;
  const prices = installmentPrices(stages);
  const needed = installmentsNeeded(stage, stages);
  let due = 0;
  for (let i = quotas.length; i < needed; i++) due += prices[i] ?? 0;
  return due;
}

/** Everything still unpaid on a number. */
export function amountRemaining(quotas: QuotaLike[], stages: StageLike[]): number {
  return installmentPrices(stages)
    .slice(quotas.length)
    .reduce((a, b) => a + b, 0);
}

/** "$500.000" -> 500000, for the money math; null when the prize isn't a plain amount ("Moto AKT"). */
export function prizeAmount(prize: string): number | null {
  const t = prize.trim();
  if (!/^\$?\s*[\d.,\s]+$/.test(t)) return null;
  const digits = t.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/** What the screens need to know about a raffle by stages. */
export interface StageSettings {
  stages: RaffleStageDTO[];
  deadlineDays: number;
  perk: FullPayPerk;
  discount: number | null;
}

/** The stage settings of a raffle, or null when it isn't a raffle by stages. */
export function stageSettingsOf(raffle: {
  stages?: RaffleStageDTO[];
  stageDeadlineDays?: number;
  fullPayPerk?: FullPayPerk;
  fullPayDiscount?: number | null;
}): StageSettings | null {
  if (!raffle.stages || raffle.stages.length === 0) return null;
  return {
    stages: sortedStages(raffle.stages),
    deadlineDays: raffle.stageDeadlineDays ?? 3,
    perk: raffle.fullPayPerk ?? "none",
    discount: raffle.fullPayDiscount ?? null,
  };
}

/** The up-front discount a number would get by paying everything now (0 when it doesn't apply). */
export function discountNow(quotas: QuotaLike[], settings: StageSettings, at: Date = new Date()): number {
  if (settings.perk !== "discount" || !settings.discount || quotas.length > 0) return 0;
  const first = paidStages(settings.stages)[0];
  const deadline = first ? deadlineOf(first, settings.deadlineDays) : null;
  return !deadline || at <= deadline ? settings.discount : 0;
}

/** Where a sold number stands on the stage being collected now. */
export interface Standing {
  /** The stage being collected (null when every paid stage was played). */
  stage: StageLike | null;
  /** It has what that stage needs. */
  upToDate: boolean;
  /** That stage's deadline passed without it being up to date (it no longer plays it). */
  late: boolean;
  /** What it must pay to play that stage. */
  due: number;
  /** The last day to pay for that stage. */
  lastDay: string | null;
}

export function standingOf(quotas: QuotaLike[], settings: StageSettings, at: Date = new Date()): Standing {
  const stage = currentPaidStage(settings.stages);
  if (!stage) return { stage: null, upToDate: true, late: false, due: 0, lastDay: null };
  const needed = installmentsNeeded(stage, settings.stages);
  const deadline = deadlineOf(stage, settings.deadlineDays);
  const passed = !!deadline && at > deadline;
  const upToDate = passed
    ? playsStage(quotas, stage, settings.stages, settings.deadlineDays, at)
    : quotas.length >= needed;
  return {
    stage,
    upToDate,
    late: passed && !upToDate,
    due: amountDueNow(quotas, settings.stages),
    lastDay: lastPayDay(stage, settings.deadlineDays),
  };
}

/** What has been collected on a number through its installments. */
export function collectedOn(quotas: Pick<QuotaDTO, "amount">[]): number {
  return quotas.reduce((sum, q) => sum + q.amount, 0);
}

/** "1/3": installments paid out of the total, for badges. */
export function quotaBadge(quotas: unknown[], settings: StageSettings): string {
  return `${quotas.length}/${installmentCount(settings.stages)}`;
}

/** A one-line prize for a raffle by stages without its own: "$8.000.000 en premios", or the final prize. */
export function stagesPrizeSummary(stages: Pick<RaffleStageDTO, "position" | "prize" | "bonus">[]): string | null {
  if (stages.length === 0) return null;
  const amounts = stages.map((s) => prizeAmount(s.prize));
  if (amounts.every((a) => a !== null)) return `${formatCurrency(amounts.reduce<number>((a, b) => a + b!, 0))} en premios`;
  return sortedStages(stages).filter((s) => !s.bonus).pop()?.prize ?? null;
}
