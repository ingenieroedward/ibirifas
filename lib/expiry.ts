import { prisma } from "@/lib/prisma";
import { DAY_MS, daysText } from "@/lib/holds";
import { formatCurrency } from "@/lib/format";
import { describeNumbers, notifyTeam } from "@/lib/push";
import { publishRaffleChange } from "@/lib/realtime";

/** A warning is repeated at most once per this long, so the team isn't nagged on every sweep. */
const NOTICE_EVERY_MS = DAY_MS;

export interface SweepResult {
  raffleId: string;
  /** Numbers that were overdue when the sweep ran. */
  overdue: number;
  /** How many of them were put back on sale. */
  released: number;
  /** Whether the team was warned this time. */
  warned: boolean;
}

interface OverdueBuyer {
  name: string;
  values: number[];
  sets: Set<string>;
  amount: number;
}

/**
 * Looks at one raffle's unpaid sales. Past their deadline they are either put
 * back on sale (raffle set to auto-release) or the team is warned, at most once
 * a day. Sets always move as a whole: they are sold whole, so they expire whole.
 * A closed raffle, or one without a deadline, is left alone.
 */
export async function sweepRaffle(raffleId: string, now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = { raffleId, overdue: 0, released: 0, warned: false };

  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { id: true, name: true, ownerId: true, status: true, holdDays: true, autoRelease: true, expiryNoticeAt: true, numberPrice: true },
  });
  if (!raffle || raffle.status !== "active" || !raffle.holdDays) return result;

  const cutoff = new Date(now.getTime() - raffle.holdDays * DAY_MS);
  const late = await prisma.raffleNumber.findMany({
    where: { raffleId, status: "occupied", soldAt: { lt: cutoff } },
    select: { id: true, value: true, buyerName: true, groupId: true, group: { select: { label: true, price: true } } },
    orderBy: { value: "asc" },
  });
  if (late.length === 0) return result;
  result.overdue = late.length;

  // Who owes what, for the message. A set counts once at its set price.
  const buyers = new Map<string, OverdueBuyer>();
  const countedSets = new Set<string>();
  for (const n of late) {
    const name = n.buyerName ?? "Sin nombre";
    const b = buyers.get(name) ?? { name, values: [], sets: new Set<string>(), amount: 0 };
    if (n.groupId && n.group) {
      b.sets.add(n.group.label);
      if (!countedSets.has(n.groupId)) {
        countedSets.add(n.groupId);
        b.amount += n.group.price;
      }
    } else {
      b.values.push(n.value);
      b.amount += raffle.numberPrice;
    }
    buyers.set(name, b);
  }
  const lines = [...buyers.values()].map((b) => {
    const parts = [
      ...(b.sets.size > 0 ? [`conjunto${b.sets.size > 1 ? "s" : ""} ${[...b.sets].join(", ")}`] : []),
      ...(b.values.length > 0 ? [describeNumbers(b.values)] : []),
    ];
    return `${b.name} (${parts.join(" y ")}) ${formatCurrency(b.amount)}`;
  });
  const summary = lines.length <= 3 ? lines.join(" · ") : `${lines.slice(0, 3).join(" · ")} y ${lines.length - 3} más`;
  const url = `/rifas/${raffleId}`;

  if (raffle.autoRelease) {
    const groupIds = [...new Set(late.map((n) => n.groupId).filter((g): g is string => g !== null))];
    const released = await prisma.raffleNumber.updateMany({
      // Re-checked in the same statement: a number paid a moment ago must not be released.
      where: {
        raffleId,
        status: "occupied",
        OR: [{ id: { in: late.map((n) => n.id) } }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
      },
      data: {
        status: "available",
        buyerName: null,
        buyerPhone: null,
        photoDataUrl: null,
        notes: null,
        paymentStatus: "pending",
        paymentMethod: null,
        soldById: null,
        soldAt: null,
        online: false,
        holdToken: null,
        updatedById: null,
      },
    });
    result.released = released.count;
    if (released.count > 0) {
      publishRaffleChange(raffleId);
      await notifyTeam(raffle.ownerId, "", {
        title: `${raffle.name} · apartados liberados`,
        body: `Pasaron ${daysText(raffle.holdDays)} sin pago y volvieron a la venta: ${summary}`,
        url,
      });
    }
    return result;
  }

  const lastNotice = raffle.expiryNoticeAt?.getTime() ?? 0;
  if (now.getTime() - lastNotice >= NOTICE_EVERY_MS) {
    await prisma.raffle.update({ where: { id: raffleId }, data: { expiryNoticeAt: now } });
    await notifyTeam(raffle.ownerId, "", {
      title: `${raffle.name} · apartados vencidos`,
      body: `Llevan más de ${daysText(raffle.holdDays)} sin pagar: ${summary}`,
      url,
    });
    result.warned = true;
  }
  return result;
}

/** Sweeps every open raffle that has a deadline. Never throws: it runs on a timer. */
export async function sweepAllRaffles(now: Date = new Date()): Promise<SweepResult[]> {
  const results: SweepResult[] = [];
  try {
    const raffles = await prisma.raffle.findMany({
      where: { status: "active", holdDays: { not: null } },
      select: { id: true },
    });
    for (const { id } of raffles) {
      try {
        results.push(await sweepRaffle(id, now));
      } catch (err) {
        console.error("[expiry] could not sweep raffle", id, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[expiry] could not list raffles:", err instanceof Error ? err.message : err);
  }
  return results;
}
