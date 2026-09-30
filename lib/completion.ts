import { prisma } from "@/lib/prisma";
import { formatDrawDate } from "@/lib/format";
import { notifyTeam } from "@/lib/push";
import { publishRaffleChange } from "@/lib/realtime";

/**
 * For a raffle played "when every number is sold" (or paid), notices the moment it fills up: it records
 * `completedAt` and tells the team once, so the organizer can set the date of the draw. If numbers are freed
 * afterwards and it is no longer full, the mark is cleared so the next time it fills up the team hears again.
 * Raffles played on a date have nothing to do here. Never throws: it runs after the sale has been saved.
 */
export async function syncCompletion(raffleId: string): Promise<void> {
  try {
    const raffle = await prisma.raffle.findUnique({
      where: { id: raffleId },
      select: { id: true, name: true, ownerId: true, status: true, drawTrigger: true, drawDate: true, completedAt: true, totalNumbers: true },
    });
    if (!raffle || raffle.status !== "active" || raffle.drawTrigger === "date") {
      if (raffle && raffle.completedAt && raffle.drawTrigger === "date") {
        await prisma.raffle.update({ where: { id: raffleId }, data: { completedAt: null } });
      }
      return;
    }

    const taken = await prisma.raffleNumber.count({
      where: { raffleId, ...(raffle.drawTrigger === "paid" ? { status: "paid" } : { status: { not: "available" } }) },
    });
    const total = await prisma.raffleNumber.count({ where: { raffleId } });
    const complete = total > 0 && taken >= total;

    if (complete && !raffle.completedAt) {
      await prisma.raffle.update({ where: { id: raffleId }, data: { completedAt: new Date() } });
      publishRaffleChange(raffleId);
      const what = raffle.drawTrigger === "paid" ? "pagaron" : "vendieron";
      void notifyTeam(raffle.ownerId, "", {
        title: `${raffle.name} · ¡completa!`,
        body: raffle.drawDate
          ? `Ya se ${what} todos los números. El sorteo es el ${formatDrawDate(raffle.drawDate.toISOString())}.`
          : `Ya se ${what} todos los números. Fija la fecha del sorteo.`,
        url: `/rifas/${raffleId}`,
      });
    } else if (!complete && raffle.completedAt) {
      await prisma.raffle.update({ where: { id: raffleId }, data: { completedAt: null } });
      publishRaffleChange(raffleId);
    }
  } catch (err) {
    console.error("[completion] could not check raffle", raffleId, err instanceof Error ? err.message : err);
  }
}
