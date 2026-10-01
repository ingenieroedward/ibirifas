/**
 * "Apartados": numbers that were sold but not paid yet. A raffle can give them
 * a deadline (`holdDays`); past it they are overdue. Pure helpers shared by the
 * server sweep and the screens, so both agree on what "overdue" means.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * The moment the draw day starts in Colombia (a draw date is a calendar day stored as UTC midnight). An unpaid
 * hold can't outlive it: the last day to pay is the day before the draw. Null without a draw date.
 */
export function drawCutoff(drawDate: string | Date | null | undefined): number | null {
  if (!drawDate) return null;
  const t = new Date(drawDate).getTime();
  return Number.isNaN(t) ? null : t + BOGOTA_OFFSET_MS;
}

/**
 * When a hold sold at `soldAt` expires: `holdDays` later, or when the draw day starts if that comes first.
 * A hold made on the draw day itself only gets the `holdDays` rule (the cutoff already passed).
 */
export function holdDeadline(soldAt: string | Date, holdDays: number, drawDate?: string | Date | null): number {
  const sold = new Date(soldAt).getTime();
  const byDays = sold + holdDays * DAY_MS;
  const cutoff = drawCutoff(drawDate);
  return cutoff !== null && sold < cutoff ? Math.min(byDays, cutoff) : byDays;
}

/** Whether the draw comes before `holdDays` would: then holds made now are due the day before the draw. */
export function cappedByDraw(holdDays: number | null, drawDate: string | Date | null | undefined, now: number = Date.now()): boolean {
  const cutoff = drawCutoff(drawDate);
  return Boolean(holdDays && cutoff !== null && now < cutoff && cutoff < now + holdDays * DAY_MS);
}

interface HoldLike {
  status: string;
  soldAt: string | Date | null;
}

/** Whole days a sold number has gone unpaid (0 when it isn't waiting for payment). */
export function daysWaiting(n: HoldLike, now: number = Date.now()): number {
  if (n.status !== "occupied" || !n.soldAt) return 0;
  return Math.max(0, Math.floor((now - new Date(n.soldAt).getTime()) / DAY_MS));
}

/**
 * Sold, unpaid, and past the raffle's deadline (`holdDays`, or the day before the draw if that's sooner — pass
 * the draw date for that; raffles by stages have their own deadlines and don't). Never overdue without `holdDays`.
 */
export function isOverdue(n: HoldLike, holdDays: number | null, now: number = Date.now(), drawDate: string | Date | null = null): boolean {
  if (!holdDays || n.status !== "occupied" || !n.soldAt) return false;
  return now > holdDeadline(n.soldAt, holdDays, drawDate);
}

/** Whole days left before it becomes overdue (0 = it does today or already has); null without a deadline or unpaid sale. */
export function daysLeft(n: HoldLike, holdDays: number | null, now: number = Date.now(), drawDate: string | Date | null = null): number | null {
  if (!holdDays || n.status !== "occupied" || !n.soldAt) return null;
  const left = holdDeadline(n.soldAt, holdDays, drawDate) - now;
  return Math.max(0, Math.ceil(left / DAY_MS));
}

/**
 * When the draw comes before `holdDays` would: the last day to pay for a hold made now (the day before the draw,
 * as a calendar-day ISO like the draw date itself). Null when `holdDays` rules.
 */
export function payByDay(holdDays: number | null, drawDate: string | Date | null | undefined, now: number = Date.now()): string | null {
  if (!drawDate || !cappedByDraw(holdDays, drawDate, now)) return null;
  return new Date(new Date(drawDate).getTime() - DAY_MS).toISOString();
}

export function daysText(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}
