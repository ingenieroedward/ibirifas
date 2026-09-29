"use client";

import { useSyncExternalStore } from "react";

/**
 * "Install the app" (add to the home screen).
 *
 * Chrome/Edge/Android hand the page a `beforeinstallprompt` event that we keep
 * and fire from our own button. iPhones and iPads have no such event: the only
 * way is Share -> Add to Home Screen, so there we show instructions instead.
 */

export type InstallMode =
  | "installed" // already running as an installed app
  | "prompt" // the browser can install it on a tap (Android, Chrome, Edge)
  | "ios" // needs the manual Share -> Add to Home Screen steps
  | "none"; // nothing we can offer (unsupported browser, or already installed elsewhere)

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// Registered as soon as this module loads: the browser fires the event once and
// won't repeat it, so a component that mounts later would miss it.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS pretends to be a Mac.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function getSnapshot(): InstallMode {
  if (isStandalone()) return "installed";
  if (deferredPrompt) return "prompt";
  if (isIOS()) return "ios";
  return "none";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, getSnapshot, () => "none");
}

/** Shows the browser's install dialog. Only meaningful in "prompt" mode. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  // The browser lets each event be used once.
  deferredPrompt = null;
  notify();
  try {
    await event.prompt();
    return (await event.userChoice).outcome;
  } catch {
    return "unavailable";
  }
}
