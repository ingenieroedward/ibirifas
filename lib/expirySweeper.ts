import { sweepAllRaffles } from "@/lib/expiry";

const EVERY_MS = 10 * 60 * 1000;

const globalForSweeper = globalThis as unknown as { __ibirifasSweeper?: ReturnType<typeof setInterval> };

/**
 * Checks for overdue holds every few minutes, from the moment the server starts.
 * One timer per process (single-instance, same assumption as lib/realtime.ts);
 * opening a raffle also sweeps it, so a stale board never shows overdue numbers as fine.
 */
export function startExpirySweeper(): void {
  if (globalForSweeper.__ibirifasSweeper) return;
  const timer = setInterval(() => void sweepAllRaffles(), EVERY_MS);
  timer.unref();
  globalForSweeper.__ibirifasSweeper = timer;
  void sweepAllRaffles();
}
