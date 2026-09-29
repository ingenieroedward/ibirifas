import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment";
import type { PaymentMethod } from "@/lib/types";

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification lands. */
  url: string;
}

export interface PushResult {
  sent: number;
  failed: number;
}

let configured: boolean | null = null;

/**
 * Lazy on purpose: `next build` evaluates route modules before any runtime
 * env exists, so reading the keys at import time would crash the build (same
 * reason lib/auth.ts validates its secrets lazily).
 */
function configure(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }

  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", publicKey, privateKey);
    configured = true;
  } catch (err) {
    console.error("[push] invalid VAPID configuration:", err instanceof Error ? err.message : err);
    configured = false;
  }
  return configured;
}

/** The key browsers need to subscribe, or null when the server has push switched off. */
export function getVapidPublicKey(): string | null {
  return configure() ? process.env.VAPID_PUBLIC_KEY! : null;
}

// The server POSTs to whatever endpoint a device registers, so an open
// allowlist would let any logged-in user aim the server at internal addresses
// (SSRF). These are the real push services browsers use: Chrome/Edge-on-Android/
// Samsung (FCM), Firefox, Safari/iOS, and Edge/Windows.
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  // Test-only escape hatch so a local mock push server can stand in for a real
  // service. Never set in production (deliberately absent from docker-compose).
  if (process.env.PUSH_ALLOW_INSECURE_ENDPOINTS === "true") return true;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

/** Delivers `payload` to every device the given users enabled. Never throws. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0 };
  if (userIds.length === 0 || !configure()) return result;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    const body = JSON.stringify(payload);

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
            { TTL: 60 * 60 * 24, urgency: "high", timeout: 10_000 },
          );
          result.sent += 1;
        } catch (err) {
          result.failed += 1;
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // The push service says this device is gone (app uninstalled,
            // permission revoked): stop trying to reach it.
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          } else {
            console.error("[push] delivery failed:", status ?? (err instanceof Error ? err.message : err));
          }
        }
      }),
    );
  } catch (err) {
    console.error("[push] could not send:", err instanceof Error ? err.message : err);
  }
  return result;
}

/**
 * Tells everyone on a raffle's team (its organizer and their sellers) about
 * something one of them did, except the person who did it. Fire-and-forget:
 * callers `void` this so a slow or failing push service never delays or breaks
 * the sale being saved.
 */
export async function notifyTeam(tenantId: string, actorId: string, payload: PushPayload): Promise<void> {
  try {
    const teammates = await prisma.adminUser.findMany({
      where: { active: true, id: { not: actorId }, OR: [{ id: tenantId }, { ownerId: tenantId }] },
      select: { id: true },
    });
    await sendPush(
      teammates.map((u) => u.id),
      payload,
    );
  } catch (err) {
    console.error("[push] could not notify team:", err instanceof Error ? err.message : err);
  }
}

const MAX_LISTED_NUMBERS = 8;

/** "07, 21, 45" — long lists are cut so the notification stays readable. */
export function describeNumbers(values: number[]): string {
  const sorted = [...values].sort((a, b) => a - b).map(formatNumberValue);
  if (sorted.length <= MAX_LISTED_NUMBERS) return sorted.join(", ");
  return `${sorted.slice(0, MAX_LISTED_NUMBERS).join(", ")} y ${sorted.length - MAX_LISTED_NUMBERS} más`;
}

export interface SaleEvent {
  kind: "sold" | "soldAndPaid" | "paid" | "released";
  actorName: string;
  buyerName: string | null;
  values: number[];
  numberPrice: number;
  paymentMethod?: PaymentMethod | null;
}

/** Spanish copy for a sale/payment/release, worded for one number or several. */
export function describeEvent(event: SaleEvent): string {
  const { actorName, values, numberPrice } = event;
  const buyer = event.buyerName ?? "un comprador";
  const many = values.length > 1;
  const numbers = many ? `${values.length} números (${describeNumbers(values)})` : `el ${describeNumbers(values)}`;
  const total = formatCurrency(values.length * numberPrice);
  const method = event.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[event.paymentMethod]}` : "";

  switch (event.kind) {
    case "sold":
      return `${actorName} vendió ${numbers} a ${buyer} · ${total}`;
    case "soldAndPaid":
      return `${actorName} vendió y cobró ${numbers} a ${buyer} · ${total}${method}`;
    case "paid":
      return `${actorName} cobró ${numbers} a ${buyer} · ${total}${method}`;
    case "released":
      return `${actorName} liberó ${numbers}${event.buyerName ? ` (era de ${event.buyerName})` : ""}`;
  }
}
