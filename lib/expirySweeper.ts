import { sweepAllRaffles } from "@/lib/expiry";
import { snapshotIfDue } from "@/lib/snapshots";

const EVERY_MS = 10 * 60 * 1000;

const globalForSweeper = globalThis as unknown as { __ibirifasSweeper?: ReturnType<typeof setInterval> };

/**
 * Checks for overdue holds every few minutes, from the moment the server starts, and makes the daily copy
 * of the database.
 * One timer per process (single-instance, same assumption as lib/realtime.ts);
 * opening a raffle also sweeps it, so a stale board never shows overdue numbers as fine.
 */
export function startExpirySweeper(): void {
  if (globalForSweeper.__ibirifasSweeper) return;
  // The same timer makes the daily database copy (lib/snapshots.ts): a cheap check when it already exists.
  const tick = () => {
    void sweepAllRaffles();
    void snapshotIfDue();
  };
  const timer = setInterval(tick, EVERY_MS);
  timer.unref();
  globalForSweeper.__ibirifasSweeper = timer;
  tick();
}
