"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getPushPublicKey,
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "@/lib/api-client";

export type PushStatus =
  /** Still working out what this device can do. */
  | "loading"
  /** Nothing to offer: old browser, or the server has push switched off. */
  | "hidden"
  /** iPhone/iPad in Safari: push only works once the app is added to the home screen. */
  | "ios-install"
  /** The user blocked notifications for this site. */
  | "denied"
  | "off"
  | "on";

const SERVICE_WORKER_URL = "/sw.js";

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isInstalledApp(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supportsPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The VAPID key arrives base64url-encoded; the browser wants raw bytes. */
function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * Everything the bell button needs: what state this device is in, and the
 * actions to turn notifications on/off or send a test. Nothing here runs on
 * the server; it only talks to the browser's push APIs and our /api/push routes.
 */
export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const set = (next: PushStatus) => {
      if (!cancelled) setStatus(next);
    };

    async function detect() {
      if (isIos() && !isInstalledApp()) return set("ios-install");
      if (!supportsPush()) return set("hidden");

      try {
        const publicKey = await getPushPublicKey();
        if (!publicKey) return set("hidden");

        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
        await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();

        if (existing && Notification.permission === "granted") {
          // Re-announce this device so the server has it for whoever is signed
          // in now (covers a shared phone, or a database that was reset).
          await savePushSubscription(existing.toJSON()).catch(() => {});
          return set("on");
        }
        set(Notification.permission === "denied" ? "denied" : "off");
      } catch {
        set("hidden");
      }
    }

    detect();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      const publicKey = await getPushPublicKey();
      if (!publicKey) {
        setStatus("hidden");
        return;
      }

      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
      await navigator.serviceWorker.ready;

      // A subscription made with an older server key can't be reused.
      const stale = await registration.pushManager.getSubscription();
      if (stale) await stale.unsubscribe();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(publicKey),
      });

      try {
        await savePushSubscription(subscription.toJSON());
      } catch (err) {
        // Don't leave the phone subscribed to something the server doesn't know.
        await subscription.unsubscribe().catch(() => {});
        throw err;
      }
      setStatus("on");
    } catch (err) {
      setMessage(errorMessage(err, "No se pudieron activar las notificaciones en este dispositivo."));
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_URL);
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint).catch(() => {});
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch (err) {
      setMessage(errorMessage(err, "No se pudieron desactivar las notificaciones."));
    } finally {
      setBusy(false);
    }
  }, []);

  const test = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await sendTestPush();
      setMessage("Enviada. Debería llegarte en unos segundos.");
    } catch (err) {
      setMessage(errorMessage(err, "No se pudo enviar la prueba."));
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, message, enable, disable, test };
}
