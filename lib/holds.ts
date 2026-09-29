/**
 * "Apartados": numbers that were sold but not paid yet. A raffle can give them
 * a deadline (`holdDays`); past it they are overdue. Pure helpers shared by the
 * server sweep and the screens, so both agree on what "overdue" means.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

interface HoldLike {
  status: string;
  soldAt: string | Date | null;
}

/** Whole days a sold number has gone unpaid (0 when it isn't waiting for payment). */
export function daysWaiting(n: HoldLike, now: number = Date.now()): number {
  if (n.status !== "occupied" || !n.soldAt) return 0;
  return Math.max(0, Math.floor((now - new Date(n.soldAt).getTime()) / DAY_MS));
}

/** Sold, unpaid, and past the raffle's deadline. Never overdue when the raffle has no deadline. */
export function isOverdue(n: HoldLike, holdDays: number | null, now: number = Date.now()): boolean {
  if (!holdDays || n.status !== "occupied" || !n.soldAt) return false;
  return now - new Date(n.soldAt).getTime() > holdDays * DAY_MS;
}

/** Whole days left before it becomes overdue (0 = it does today or already has); null without a deadline or unpaid sale. */
export function daysLeft(n: HoldLike, holdDays: number | null, now: number = Date.now()): number | null {
  if (!holdDays || n.status !== "occupied" || !n.soldAt) return null;
  const left = new Date(n.soldAt).getTime() + holdDays * DAY_MS - now;
  return Math.max(0, Math.ceil(left / DAY_MS));
}

export function daysText(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}
