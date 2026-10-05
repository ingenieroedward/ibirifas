import { prisma } from "@/lib/prisma";

/**
 * The record of what happened to raffles (sent to the trash, restored, purged), for the organization and the
 * platform owner. Never throws: a failed record must not undo the action that triggered it.
 */
export type ActivityAction = "raffle.trashed" | "raffle.restored" | "raffle.purged";

export async function logActivity(entry: {
  ownerId: string | null;
  actorName: string;
  action: ActivityAction;
  targetName: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        ownerId: entry.ownerId,
        actorName: entry.actorName,
        action: entry.action,
        targetName: entry.targetName,
        details: entry.details ? JSON.stringify(entry.details) : null,
      },
    });
  } catch (err) {
    console.error("[activity] could not record:", err instanceof Error ? err.message : err);
  }
}
