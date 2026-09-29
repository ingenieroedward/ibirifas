"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { getNumbersSince, hasValidSession, type NumbersSince } from "@/lib/api-client";
import type { RaffleNumberDTO } from "@/lib/types";

export type LiveStatus = "connecting" | "live" | "reconnecting";

// Even with the live connection, ask for changes this often while the app is
// on screen. If a proxy silently swallows the stream, the board still updates.
const SAFETY_POLL_MS = 30_000;
const MAX_RETRY_DELAY_MS = 15_000;
// How long a dropped connection may stay down before the person is told about it.
const RECONNECT_NOTICE_DELAY_MS = 4_000;

interface Options {
  raffleId: string;
  enabled: boolean;
  /**
   * How far the board is known to be in sync with the server: the newest
   * `updatedAt` of the last full load or of the last changes received. The
   * page sets it after every full load; this hook advances it. It must NOT
   * follow the person's own saves — those would move it past changes made by
   * others that haven't arrived yet, and those changes would never be fetched.
   */
  cursorRef: RefObject<string | null>;
  /** Called with numbers that changed since the cursor. */
  onChanges: (numbers: RaffleNumberDTO[]) => void;
  /** Called after every catch-up with the raffle's own state (open/closed, winner); the caller ignores what it already knows. */
  onRaffleState?: (state: NumbersSince["raffle"]) => void;
}

/**
 * Keeps a raffle board current without the person touching anything.
 *
 * A server-sent-events stream says "something changed"; each browser then asks
 * for the numbers changed since the newest one it has. The same catch-up runs
 * when the stream (re)connects, when the app comes back to the foreground or
 * the network returns, and every 30s as a safety net — so a missed signal
 * delays an update but never loses it.
 */
export function useRaffleLive({ raffleId, enabled, cursorRef, onChanges, onRaffleState }: Options) {
  const router = useRouter();
  const [status, setStatus] = useState<LiveStatus>("connecting");

  // Latest callback, so the connection isn't torn down on every render.
  const onChangesRef = useRef(onChanges);
  const onRaffleStateRef = useRef(onRaffleState);
  useEffect(() => {
    onChangesRef.current = onChanges;
    onRaffleStateRef.current = onRaffleState;
  });

  const syncing = useRef(false);
  const again = useRef(false);

  const sync = useCallback(async () => {
    if (syncing.current) {
      again.current = true;
      return;
    }
    syncing.current = true;
    try {
      do {
        again.current = false;
        const cursor = cursorRef.current;
        if (!cursor) break;

        // Strictly-after: two different numbers changed in the very same
        // millisecond, straddling one client's read, could be missed. The
        // reload button always recovers that.
        const { numbers: changed, raffle } = await getNumbersSince(raffleId, cursor);
        onRaffleStateRef.current?.(raffle);
        if (changed.length > 0) {
          cursorRef.current = changed.reduce((max, n) => (n.updatedAt > max ? n.updatedAt : max), cursor);
          onChangesRef.current(changed);
        }
      } while (again.current);
    } catch {
      // Offline or a hiccup: the next signal, reconnect or poll tries again.
    } finally {
      syncing.current = false;
    }
  }, [raffleId, cursorRef]);

  // The live stream.
  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    // A dropped connection is normal (a phone suspends the app, the network blinks) and
    // usually heals in a second, so the "reconnecting" notice only appears if it doesn't.
    const flagReconnecting = () => {
      if (noticeTimer || document.visibilityState !== "visible") return;
      noticeTimer = setTimeout(() => {
        noticeTimer = undefined;
        setStatus("reconnecting");
      }, RECONNECT_NOTICE_DELAY_MS);
    };

    const connect = () => {
      if (stopped) return;
      const es = new EventSource(`/api/raffles/${raffleId}/events`);
      source = es;

      es.onopen = () => {
        failures = 0;
        clearTimeout(noticeTimer);
        noticeTimer = undefined;
        setStatus("live");
        // Whatever happened while we were away.
        void sync();
      };
      es.addEventListener("changed", () => void sync());
      es.onerror = () => {
        flagReconnecting();
        // While CONNECTING the browser retries by itself. CLOSED means it gave
        // up — typically a 401 because the 15-minute access token expired — so
        // renew the session ourselves and open a fresh connection.
        if (es.readyState !== EventSource.CLOSED) return;
        es.close();
        const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** failures++);
        retryTimer = setTimeout(async () => {
          const signedIn = await hasValidSession().catch(() => true);
          if (!signedIn && !stopped) {
            router.replace("/login");
            return;
          }
          connect();
        }, delay);
      };
    };

    // Coming back to the app (or the network returning) after it was closed or in the
    // background: the old connection is dead or stale, so open a fresh one right away
    // instead of waiting for the browser's own retry or our backoff.
    const wake = () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (source?.readyState === EventSource.OPEN) return;
      clearTimeout(retryTimer);
      source?.close();
      failures = 0;
      connect();
    };

    connect();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearTimeout(noticeTimer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
      source?.close();
    };
  }, [enabled, raffleId, sync, router]);

  // Catch up when the app returns to the foreground or the network comes back,
  // and keep the periodic safety net.
  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const onOnline = () => void sync();
    const timer = setInterval(onVisible, SAFETY_POLL_MS);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, sync]);

  return { status, syncNow: sync };
}
