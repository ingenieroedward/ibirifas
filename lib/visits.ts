import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import type { VisitStatsDTO } from "@/lib/types";

/**
 * Visits to a raffle's public link, so the team knows whether people are arriving. Counted when the page
 * is opened (not the background refreshes), skipping link-preview robots. A visitor is a one-way hash of
 * IP + browser + day: the same person counts once a day, and can't be followed across days.
 */

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|telegram|twitter|slack|discord|linkedin|embedly|preview|curl|wget|python|go-http|axios|node-fetch/i;

const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });

/** "2026-10-01", the calendar day in Colombia. */
export function bogotaDay(at: Date = new Date()): string {
  return dayFormatter.format(at);
}

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOTS.test(userAgent);
}

/** Records one page view. Never throws (a visit count is not worth failing a page for). */
export async function recordVisit(raffleId: string, ip: string, userAgent: string | null): Promise<void> {
  if (isBot(userAgent)) return;
  try {
    const day = bogotaDay();
    const salt = process.env.ACCESS_TOKEN_SECRET ?? "ibirifas";
    const visitor = createHash("sha256").update(`${salt}|${raffleId}|${day}|${ip}|${userAgent}`).digest("base64url").slice(0, 22);
    await prisma.raffleVisit.upsert({
      where: { raffleId_day_visitor: { raffleId, day, visitor } },
      create: { raffleId, day, visitor },
      update: { views: { increment: 1 } },
    });
  } catch (err) {
    console.error("[visits] could not record:", err instanceof Error ? err.message : err);
  }
}

/** What the team sees: people today, in the last 7 days and in total, page views, and the last 14 days. */
export async function visitStats(raffleId: string): Promise<VisitStatsDTO> {
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(bogotaDay(new Date(Date.now() - i * 86_400_000)));
  const [perDay, totals] = await Promise.all([
    prisma.raffleVisit.groupBy({
      by: ["day"],
      where: { raffleId, day: { gte: days[0]! } },
      _count: { _all: true },
    }),
    prisma.raffleVisit.aggregate({ where: { raffleId }, _count: { _all: true }, _sum: { views: true } }),
  ]);
  const byDay = new Map(perDay.map((d) => [d.day, d._count._all]));
  const last14 = days.map((day) => ({ day, visitors: byDay.get(day) ?? 0 }));
  return {
    today: last14[last14.length - 1]!.visitors,
    last7: last14.slice(-7).reduce((sum, d) => sum + d.visitors, 0),
    total: totals._count._all,
    views: totals._sum.views ?? 0,
    last14,
  };
}

/** Old visits are only noise: kept for 120 days. */
export async function pruneVisits(now: Date = new Date()): Promise<void> {
  await prisma.raffleVisit.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 120 * 86_400_000) } } });
}
