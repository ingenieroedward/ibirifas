/**
 * In-process pub/sub that tells connected boards "something changed".
 *
 * It only carries a signal, never data: each browser then asks
 * /api/raffles/:id/numbers?since=… with its own session, so what a person can
 * see is always decided by the normal auth checks, not by who happens to hold
 * an open connection.
 *
 * Single-instance by design (same assumption as lib/rateLimit.ts). If the app
 * is ever scaled to several containers, swap this for a shared channel such as
 * Redis pub/sub; clients also re-sync every 30s, so a missed signal only delays
 * an update, it never loses one.
 */

export interface RaffleChange {
  at: number;
}

type Listener = (change: RaffleChange) => void;

// Kept on globalThis so every route bundle shares one registry instead of each
// getting its own copy of this module (same pattern as lib/prisma.ts).
const globalForRealtime = globalThis as unknown as { __ibirifasChannels?: Map<string, Set<Listener>> };
const channels = (globalForRealtime.__ibirifasChannels ??= new Map<string, Set<Listener>>());

/** A safety cap, so one client opening connections in a loop can't exhaust memory. */
export const MAX_LISTENERS_PER_RAFFLE = 300;

/** Returns an unsubscribe function, or null when the raffle already has too many listeners. */
export function subscribeToRaffle(raffleId: string, listener: Listener): (() => void) | null {
  let listeners = channels.get(raffleId);
  if (!listeners) {
    listeners = new Set();
    channels.set(raffleId, listeners);
  }
  if (listeners.size >= MAX_LISTENERS_PER_RAFFLE) return null;

  listeners.add(listener);
  const set = listeners;
  return () => {
    set.delete(listener);
    if (set.size === 0 && channels.get(raffleId) === set) channels.delete(raffleId);
  };
}

/** Call after a change to a raffle's numbers has been committed. */
export function publishRaffleChange(raffleId: string): void {
  const listeners = channels.get(raffleId);
  if (!listeners) return;
  const change: RaffleChange = { at: Date.now() };
  for (const listener of [...listeners]) {
    try {
      listener(change);
    } catch {
      // A dead connection must never stop the others from being told.
    }
  }
}
