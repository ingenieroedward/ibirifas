import { createHmac, timingSafeEqual } from "node:crypto";
import { loosePrice } from "@/lib/combos";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { sendPush, type PushPayload } from "@/lib/push";
import { publishRaffleChange } from "@/lib/realtime";
import { syncCompletion } from "@/lib/completion";
import { buyerRowSelect, emailBuyers, mailOrigin } from "@/lib/buyerMail";
import type { PaymentCandidateDTO, PaymentStatus } from "@/lib/types";

/**
 * Payments the bank reports, through pagoradar (a separate service that reads the bank's emails, checks they
 * are genuine and sends a signed webhook). Each payment is matched against the open reservations of the
 * organization that owns the account:
 *
 *   - same amount, paid after the reservation was made, and the holder's name matching what the buyer typed
 *     with their receipt (or their own name) → if exactly ONE online reservation fits, it is approved on its
 *     own and the organizer is told (with "Deshacer" in Pagos recibidos);
 *   - several fit, the name only partly matches, the reservation was made by the team, or automatic approval
 *     is off → it waits in "Por revisar" with the candidates;
 *
 * Only the organizer sees and resolves these payments (the account may receive other money too); sellers
 * just see the numbers turn paid.
 *   - nothing has that amount → "Sin reserva".
 *
 * Raffles by stages are left out: their installments are collected from the number's sheet.
 */

const MATCH_WINDOW_DAYS = 7;
const PAID_BEFORE_RESERVATION_SLACK_MS = 30 * 60 * 1000;
const MAX_CANDIDATES = 5;

// ---------- configuration

export interface PagoradarConfig {
  secret: string;
  /** Old single-organization setup (PAGORADAR_ORG): payments of accounts not linked to anyone go there. */
  legacyOrgCode: string | null;
  url: string | null;
  apiKey: string | null;
}

/** Null when the server isn't connected to pagoradar (no webhook secret). */
export function pagoradarConfig(): PagoradarConfig | null {
  const secret = process.env.PAGORADAR_WEBHOOK_SECRET ?? "";
  if (secret.length < 24) return null;
  const legacyOrgCode = (process.env.PAGORADAR_ORG ?? "").trim().toLowerCase() || null;
  const url = (process.env.PAGORADAR_URL ?? "").trim().replace(/\/+$/, "");
  return { secret, legacyOrgCode, url: /^https?:\/\//.test(url) ? url : null, apiKey: process.env.PAGORADAR_API_KEY || null };
}

/** Organizers can connect their own account from Mi equipo (needs the API URL and key). */
export function pagoradarApiReady(): boolean {
  const c = pagoradarConfig();
  return Boolean(c?.url && c.apiKey);
}

async function legacyTenantId(): Promise<string | null> {
  const code = pagoradarConfig()?.legacyOrgCode;
  if (!code) return null;
  const org = await prisma.adminUser.findFirst({ where: { orgCode: code, role: "ORGANIZER", active: true }, select: { id: true } });
  return org?.id ?? null;
}

/**
 * Which organization a payment (or account event) belongs to: the organizer who connected that receiving
 * account; otherwise, for the old single-organization setup, PAGORADAR_ORG. Null = nobody here.
 */
export async function tenantForAccount(accountId: string | null | undefined): Promise<string | null> {
  if (accountId) {
    const org = await prisma.adminUser.findFirst({ where: { pagoradarAccountId: accountId, role: "ORGANIZER", active: true }, select: { id: true } });
    if (org) return org.id;
  }
  return legacyTenantId();
}

/** Does this organization receive bank payments (its own connected account, or the old setup)? */
export async function paymentsConnected(tenantId: string): Promise<boolean> {
  if (!pagoradarConfig()) return false;
  const org = await prisma.adminUser.findUnique({ where: { id: tenantId }, select: { pagoradarAccountId: true } });
  if (org?.pagoradarAccountId) return true;
  return (await legacyTenantId()) === tenantId;
}

/** Calls pagoradar's API with the app's key. Throws PagoradarUnavailable on network errors or 5xx. */
export class PagoradarUnavailable extends Error {}
export async function pagoradarApi<T>(path: string, init: { method?: string; body?: unknown } = {}, fetchImpl: typeof fetch = fetch): Promise<{ status: number; data: T }> {
  const c = pagoradarConfig();
  if (!c?.url || !c.apiKey) throw new PagoradarUnavailable("pagoradar no está configurado");
  let res: Response;
  try {
    res = await fetchImpl(`${c.url}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${c.apiKey}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new PagoradarUnavailable(err instanceof Error ? err.message : String(err));
  }
  if (res.status >= 500 || res.status === 401) throw new PagoradarUnavailable(`HTTP ${res.status}`);
  return { status: res.status, data: (await res.json().catch(() => ({}))) as T };
}

/** `Pagoradar-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<body>">`, signed in the last 5 minutes. */
export function verifyPagoradarSignature(secret: string, header: string | null, body: string, now = Date.now()): boolean {
  const parts = Object.fromEntries(
    String(header ?? "")
      .split(",")
      .map((p) => p.trim().split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now / 1000 - t) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A payment as pagoradar sends it (in the webhook's `data`, or from GET /v1/payments). */
export const pagoradarPaymentSchema = z.object({
  id: z.string().regex(/^pay_[a-z0-9]{6,60}$/),
  bank: z.string().min(1).max(40),
  method: z.string().max(20).nullable().optional(),
  amountCents: z.number().int().positive().max(100_000_000_000),
  payerName: z.string().trim().min(1).max(120),
  payerBank: z.string().max(80).nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  paidAt: z.string().datetime({ offset: true }),
  receivedAt: z.string().datetime({ offset: true }),
  accountId: z.string().max(60).nullable().optional(),
  account: z.object({ id: z.string().max(60) }).passthrough().nullable().optional(),
  // The pagoradar charge it paid, if any: in the webhook as `charge`, from GET /v1/payments as `chargeId`.
  charge: z.object({ id: z.string().max(60), reference: z.string().max(120).nullable().optional() }).passthrough().nullable().optional(),
  chargeId: z.string().max(60).nullable().optional(),
});
export type PagoradarPayment = z.infer<typeof pagoradarPaymentSchema>;

export const BANK_LABEL: Record<string, string> = {
  nequi_negocios: "Nequi Negocios",
  nequi: "Nequi",
  bancolombia: "Bancolombia",
};

// ---------- names

const STOPWORDS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "DA", "DO", "SAN"]);

export function nameTokens(name: string | null | undefined): string[] {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9Ñ]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export type NameMatch = "strong" | "weak" | "none";

/**
 * One typo apart: same first letter, both words of 5+ letters, and one letter missing, added, or two swapped
 * ("EDWAD" / "EDWARD", "ANDERA" / "ANDREA"). A changed letter doesn't count: "MARIO" and "MARIA" are two people.
 */
function oneTypoApart(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5 || a[0] !== b[0] || Math.abs(a.length - b.length) > 1) return false;
  // Optimal string alignment distance, stopping as soon as it can't be 1 or less.
  const prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      // A different letter costs 2, so only a missing/extra letter or a swap can come out as one typo.
      const cost = a[i - 1] === b[j - 1] ? 0 : 2;
      let d = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2]! + 1);
      cur[j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > 1) return false;
    prev2.splice(0, prev2.length, ...prev);
    prev = cur;
  }
  return prev[b.length]! <= 1;
}

/**
 * How well a name someone typed matches the one the bank shows. Banks show the full legal name
 * ("ANA MARIA PEREZ GOMEZ"); people type part of it ("Ana Pérez"), shorten a word ("Ma." / "Andr") or miss a
 * letter ("Edwad"). Strong: at least two words match and every word of the shorter of the two names is found.
 */
export function nameMatch(typed: string | null | undefined, bank: string | null | undefined): NameMatch {
  const t = nameTokens(typed);
  const b = nameTokens(bank);
  if (t.length === 0 || b.length === 0) return "none";
  const used = new Set<number>();
  let matched = 0;
  for (const word of t) {
    const i = b.findIndex(
      (w, idx) =>
        !used.has(idx) &&
        (w === word || (word.length >= 3 && w.startsWith(word)) || (w.length >= 3 && word.startsWith(w)) || oneTypoApart(w, word)),
    );
    if (i !== -1) {
      used.add(i);
      matched++;
    }
  }
  if (matched >= 2 && matched >= Math.min(t.length, b.length)) return "strong";
  return matched >= 1 ? "weak" : "none";
}

const RANK: Record<NameMatch, number> = { strong: 2, weak: 1, none: 0 };
const better = (a: NameMatch, b: NameMatch): NameMatch => (RANK[a] >= RANK[b] ? a : b);

/**
 * Payment notices go to the organizer only: the bank reports every payment to the account (with the
 * payer's name), and the account may also receive money that has nothing to do with the raffles.
 */
export async function notifyOrganizer(tenantId: string, payload: PushPayload): Promise<void> {
  try {
    await sendPush([tenantId], payload);
  } catch (err) {
    console.error("[pagoradar] could not notify the organizer:", err instanceof Error ? err.message : err);
  }
}

// ---------- open reservations

/** Unpaid numbers bought together: one online reservation, or one buyer's numbers sold by the team. */
export interface OpenReservation {
  key: string;
  raffleId: string;
  raffleName: string;
  numberIds: string[];
  /** "Conjunto A · 04, 05" */
  items: string;
  buyerName: string | null;
  payerName: string | null;
  online: boolean;
  hasReceipt: boolean;
  amount: number;
  soldAt: Date | null;
}

export async function openReservations(tenantId: string): Promise<OpenReservation[]> {
  const raffles = await prisma.raffle.findMany({
    where: { ownerId: tenantId, status: { not: "closed" }, stages: { none: {} } },
    select: { id: true, name: true, numberPrice: true, groups: { select: { id: true, label: true, price: true } } },
  });
  if (raffles.length === 0) return [];
  const raffleIds = raffles.map((r) => r.id);
  const [numbers, withReceipt] = await Promise.all([
    prisma.raffleNumber.findMany({
      where: { raffleId: { in: raffleIds }, status: "occupied" },
      orderBy: { value: "asc" },
      select: { id: true, raffleId: true, value: true, groupId: true, buyerName: true, buyerPhone: true, payerName: true, holdToken: true, online: true, soldAt: true, salePrice: true },
    }),
    prisma.raffleNumber.findMany({
      where: { raffleId: { in: raffleIds }, status: "occupied", photoDataUrl: { not: null } },
      select: { id: true },
    }),
  ]);
  const receiptIds = new Set(withReceipt.map((n) => n.id));
  const byRaffle = new Map(raffles.map((r) => [r.id, r]));

  const groups = new Map<string, typeof numbers>();
  for (const n of numbers) {
    const key =
      n.online && n.holdToken
        ? `h:${n.holdToken}`
        : `b:${n.raffleId}:${nameTokens(n.buyerName).join(" ")}:${(n.buyerPhone ?? "").replace(/\D/g, "")}`;
    const list = groups.get(key) ?? [];
    list.push(n);
    groups.set(key, list);
  }

  const out: OpenReservation[] = [];
  for (const [key, rows] of groups) {
    const raffle = byRaffle.get(rows[0]!.raffleId)!;
    const setIds = [...new Set(rows.map((r) => r.groupId).filter((g): g is string => g !== null))];
    const sets = raffle.groups.filter((g) => setIds.includes(g.id)).sort((a, b) => a.label.localeCompare(b.label));
    const loose = rows.filter((r) => r.groupId === null);
    const items = [
      ...sets.map((g) => `Conjunto ${g.label}`),
      ...(loose.length ? [loose.map((r) => formatNumberValue(r.value)).join(", ")] : []),
    ].join(" · ");
    const soldTimes = rows.map((r) => r.soldAt?.getTime()).filter((t): t is number => t !== undefined);
    out.push({
      key,
      raffleId: raffle.id,
      raffleName: raffle.name,
      numberIds: rows.map((r) => r.id),
      items,
      buyerName: rows[0]!.buyerName,
      payerName: rows.find((r) => r.payerName)?.payerName ?? null,
      online: key.startsWith("h:"),
      hasReceipt: rows.some((r) => receiptIds.has(r.id)),
      amount: sets.reduce((sum, g) => sum + g.price, 0) + loose.reduce((sum, r) => sum + loosePrice(r, raffle.numberPrice), 0),
      soldAt: soldTimes.length ? new Date(Math.min(...soldTimes)) : null,
    });
  }
  return out;
}

export function toCandidateDTO(r: OpenReservation, nameMatch: PaymentCandidateDTO["nameMatch"]): PaymentCandidateDTO {
  return {
    key: r.key,
    raffleId: r.raffleId,
    raffleName: r.raffleName,
    numberIds: r.numberIds,
    items: r.items,
    buyerName: r.buyerName,
    payerName: r.payerName,
    online: r.online,
    hasReceipt: r.hasReceipt,
    amount: r.amount,
    soldAt: r.soldAt?.toISOString() ?? null,
    nameMatch,
  };
}

// ---------- the decision

export interface Candidate {
  reservation: OpenReservation;
  name: NameMatch;
}

export type Decision =
  | { status: "auto"; match: OpenReservation }
  | { status: "review"; candidates: Candidate[]; note: string }
  | { status: "unmatched"; note: string };

export function candidatesFor(
  payment: { amount: number; payerName: string; paidAt: Date },
  reservations: OpenReservation[],
): Candidate[] {
  return reservations
    .filter((r) => r.amount === payment.amount && (!r.soldAt || payment.paidAt.getTime() >= r.soldAt.getTime() - PAID_BEFORE_RESERVATION_SLACK_MS))
    .map((r) => ({ reservation: r, name: better(nameMatch(r.payerName, payment.payerName), nameMatch(r.buyerName, payment.payerName)) }))
    .sort(
      (a, b) =>
        RANK[b.name] - RANK[a.name] ||
        Number(b.reservation.hasReceipt) - Number(a.reservation.hasReceipt) ||
        (b.reservation.soldAt?.getTime() ?? 0) - (a.reservation.soldAt?.getTime() ?? 0),
    );
}

export function decide(
  payment: { amount: number; payerName: string; paidAt: Date },
  reservations: OpenReservation[],
  autoApprove: boolean,
): Decision {
  const all = candidatesFor(payment, reservations);
  if (all.length === 0) return { status: "unmatched", note: "Ninguna reserva pendiente tiene ese valor." };
  const strong = all.filter((c) => c.name === "strong");
  if (strong.length === 1 && strong[0]!.reservation.online && autoApprove) {
    return { status: "auto", match: strong[0]!.reservation };
  }
  const note =
    strong.length > 1
      ? `${strong.length} reservas del mismo valor coinciden con ese nombre.`
      : strong.length === 1 && !strong[0]!.reservation.online
        ? "Coincide con una venta del equipo: confírmala."
        : strong.length === 1
          ? "Coincide con una reserva (la aprobación automática está apagada)."
          : all.some((c) => c.name === "weak")
            ? "El nombre coincide solo en parte."
            : "Hay reservas de ese valor, pero el nombre no coincide.";
  return { status: "review", candidates: all.slice(0, MAX_CANDIDATES), note };
}

// ---------- applying it

// One payment decision at a time (single process, same assumption as lib/realtime.ts): the webhook, a receipt
// upload and the catch-up poll can't approve the same reservation twice.
const globalForLock = globalThis as unknown as { __ibirifasPaymentLock?: Promise<unknown> };
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = (globalForLock.__ibirifasPaymentLock ?? Promise.resolve()).then(fn, fn);
  globalForLock.__ibirifasPaymentLock = run.catch(() => {});
  return run;
}

export class PaymentConflict extends Error {}

const label = (r: Pick<OpenReservation, "buyerName" | "raffleName" | "items">) =>
  `${r.buyerName ?? "Sin nombre"} · ${r.raffleName} · ${r.items}`;

/**
 * Marks `numberIds` paid with this payment (Bre-B, paymentRef = the payment's id). `actor` null = automatic.
 * Throws PaymentConflict when the payment was already resolved or the numbers are no longer waiting for it.
 */
async function approveUnlocked(paymentId: string, numberIds: string[], actor: { id: string; name: string } | null): Promise<string> {
  const ids = [...new Set(numberIds)];
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.receivedPayment.findUnique({ where: { id: paymentId } });
    if (!payment || (payment.status !== "review" && payment.status !== "unmatched")) {
      throw new PaymentConflict("Este pago ya se resolvió. Actualiza la lista.");
    }
    const nums = await tx.raffleNumber.findMany({
      where: { id: { in: ids } },
      orderBy: { value: "asc" },
      select: {
        id: true,
        value: true,
        status: true,
        groupId: true,
        raffleId: true,
        buyerName: true,
        raffle: { select: { ownerId: true, name: true, status: true, _count: { select: { stages: true } } } },
      },
    });
    if (ids.length === 0 || nums.length !== ids.length || nums.some((n) => n.raffle.ownerId !== payment.ownerId)) {
      throw new PaymentConflict("Esa reserva ya no existe.");
    }
    if (new Set(nums.map((n) => n.raffleId)).size !== 1) throw new PaymentConflict("Los números deben ser de la misma rifa.");
    const raffle = nums[0]!.raffle;
    if (raffle.status === "closed") throw new PaymentConflict("La rifa está cerrada.");
    if (raffle._count.stages > 0) throw new PaymentConflict("En una rifa por etapas se cobra por cuotas desde el número.");
    if (nums.some((n) => n.status !== "occupied")) throw new PaymentConflict("Esa reserva ya no está pendiente de pago. Actualiza la lista.");
    const setIds = [...new Set(nums.map((n) => n.groupId).filter((g): g is string => g !== null))];
    if (setIds.length > 0) {
      const members = await tx.raffleNumber.count({ where: { groupId: { in: setIds } } });
      if (members !== nums.filter((n) => n.groupId !== null).length) throw new PaymentConflict("Un conjunto se cobra completo.");
    }

    const { count } = await tx.raffleNumber.updateMany({
      where: { id: { in: ids }, status: "occupied" },
      data: {
        status: "paid",
        paymentStatus: "paid" satisfies PaymentStatus,
        paymentMethod: "breb",
        paymentRef: payment.id,
        receiptRejectedAt: null,
        receiptRejectReason: null,
        updatedById: actor?.id ?? null,
      },
    });
    if (count !== ids.length) throw new PaymentConflict("Esa reserva cambió mientras tanto. Actualiza la lista.");

    const groups = setIds.length ? await tx.raffleGroup.findMany({ where: { id: { in: setIds } }, select: { label: true } }) : [];
    const loose = nums.filter((n) => n.groupId === null).map((n) => formatNumberValue(n.value));
    const items = [...groups.map((g) => `Conjunto ${g.label}`).sort(), ...(loose.length ? [loose.join(", ")] : [])].join(" · ");
    const matchLabel = label({ buyerName: nums[0]!.buyerName, raffleName: raffle.name, items });
    await tx.receivedPayment.update({
      where: { id: payment.id },
      data: {
        status: actor ? "approved" : "auto",
        raffleId: nums[0]!.raffleId,
        matchLabel,
        note: null,
        resolvedById: actor?.id ?? null,
        resolvedAt: new Date(),
      },
    });
    return { raffleId: nums[0]!.raffleId, raffleName: raffle.name, matchLabel, payment };
  });

  publishRaffleChange(result.raffleId);
  void syncCompletion(result.raffleId);
  const rows = await prisma.raffleNumber.findMany({ where: { id: { in: ids } }, select: buyerRowSelect });
  void emailBuyers(result.raffleId, rows, { kind: "approved", method: "breb" }, await mailOrigin());
  // Only the organizer approves by hand, so only an automatic approval needs telling them.
  if (!actor) {
    void notifyOrganizer(result.payment.ownerId, {
      title: `${result.raffleName} · pago Bre-B aprobado`,
      body: `${result.payment.payerName} pagó ${formatCurrency(result.payment.amount)}: ${result.matchLabel}. Se aprobó solo; si no es correcto, deshazlo en Pagos.`,
      url: "/pagos",
    });
  }
  return result.matchLabel;
}

export function approvePayment(paymentId: string, numberIds: string[], actor: { id: string; name: string }): Promise<string> {
  return locked(() => approveUnlocked(paymentId, numberIds, actor));
}

/** Takes an approval back: its numbers return to "apartado" (receipt kept) and the payment waits for review. */
export function undoPayment(paymentId: string, actor: { id: string; name: string }): Promise<void> {
  return locked(async () => {
    const raffleId = await prisma.$transaction(async (tx) => {
      const payment = await tx.receivedPayment.findUnique({ where: { id: paymentId } });
      if (!payment || (payment.status !== "auto" && payment.status !== "approved")) {
        throw new PaymentConflict("Este pago no está aprobado.");
      }
      await tx.raffleNumber.updateMany({
        where: { paymentRef: payment.id, status: "paid", raffle: { ownerId: payment.ownerId } },
        data: { status: "occupied", paymentStatus: "pending" satisfies PaymentStatus, paymentMethod: null, paymentRef: null, updatedById: actor.id },
      });
      await tx.receivedPayment.update({
        where: { id: payment.id },
        data: {
          status: "review",
          note: `${actor.name} deshizo la aprobación (${payment.matchLabel ?? "reserva"}). Elige la reserva correcta o ignóralo.`,
          resolvedById: actor.id,
          resolvedAt: new Date(),
        },
      });
      return payment.raffleId;
    });
    if (raffleId) {
      publishRaffleChange(raffleId);
      void syncCompletion(raffleId);
    }
  });
}

export function ignorePayment(paymentId: string, actor: { id: string }): Promise<void> {
  return locked(async () => {
    const { count } = await prisma.receivedPayment.updateMany({
      where: { id: paymentId, status: { in: ["review", "unmatched"] } },
      data: { status: "ignored", resolvedById: actor.id, resolvedAt: new Date() },
    });
    if (count !== 1) throw new PaymentConflict("Este pago ya se resolvió. Actualiza la lista.");
  });
}

export function reopenPayment(paymentId: string, actor: { id: string }): Promise<void> {
  return locked(async () => {
    const { count } = await prisma.receivedPayment.updateMany({
      where: { id: paymentId, status: "ignored" },
      data: { status: "unmatched", note: null, resolvedById: actor.id, resolvedAt: new Date() },
    });
    if (count !== 1) throw new PaymentConflict("Este pago no está ignorado.");
  });
}

/**
 * Re-runs the decision for the organization's payments still waiting (last few days): called when a payment
 * arrives and when a buyer sends a receipt, because the bank's notice usually arrives before the receipt.
 * Only a new automatic approval is announced; `fresh` (the payment that just arrived) is announced either way.
 */
export function rematchPayments(tenantId: string, fresh?: string): Promise<void> {
  return locked(async () => {
    const owner = await prisma.adminUser.findUnique({ where: { id: tenantId }, select: { autoApprovePayments: true } });
    if (!owner) return;
    const waiting = await prisma.receivedPayment.findMany({
      where: {
        ownerId: tenantId,
        status: { in: ["review", "unmatched"] },
        createdAt: { gte: new Date(Date.now() - MATCH_WINDOW_DAYS * 86400_000) },
      },
      orderBy: { paidAt: "asc" },
    });
    if (waiting.length === 0) return;
    let reservations = await openReservations(tenantId);
    for (const p of waiting) {
      // A payment someone already undid stays with the team: it must not jump straight back.
      const undone = p.status === "review" && p.resolvedById !== null;
      const decision = decide(p, reservations, owner.autoApprovePayments && !undone);
      if (decision.status === "auto") {
        try {
          await approveUnlocked(p.id, decision.match.numberIds, null);
          reservations = reservations.filter((r) => r.key !== decision.match.key);
          continue;
        } catch (err) {
          if (!(err instanceof PaymentConflict)) throw err;
          reservations = await openReservations(tenantId);
          continue;
        }
      }
      const note = undone ? p.note : decision.note;
      if (decision.status !== p.status || note !== p.note) {
        await prisma.receivedPayment.updateMany({
          where: { id: p.id, status: { in: ["review", "unmatched"] } },
          data: { status: decision.status, note },
        });
      }
      if (p.id === fresh) {
        void notifyOrganizer(tenantId, {
          title: decision.status === "review" ? "Pago Bre-B por revisar" : "Pago Bre-B sin reserva",
          body: `${p.payerName} · ${formatCurrency(p.amount)} (${BANK_LABEL[p.bank] ?? p.bank}). ${decision.note}`,
          url: "/pagos",
        });
      }
    }
  });
}

/** Stores a payment from pagoradar (once) and matches it. Returns "duplicate" when it was already here. */
/**
 * A payment for a raffle's activation (billing, lib/billing.ts) — the organization paying Ibirifas, not a buyer
 * paying a raffle — when the platform owner's billing account is also their organization's receiving account.
 */
export async function isBillingPayment(data: PagoradarPayment): Promise<boolean> {
  if (data.charge?.reference?.startsWith("rifa:")) return true;
  const chargeId = data.charge?.id ?? data.chargeId;
  if (!chargeId) return false;
  return (await prisma.raffle.count({ where: { activationChargeId: chargeId } })) > 0;
}

export async function ingestPayment(tenantId: string, data: PagoradarPayment): Promise<"stored" | "duplicate" | "billing"> {
  // It pays Ibirifas for a raffle's activation: never a buyer's payment to cross with reservations.
  if (await isBillingPayment(data)) return "billing";
  const exists = await prisma.receivedPayment.findUnique({ where: { id: data.id }, select: { id: true } });
  if (exists) return "duplicate";
  try {
    await prisma.receivedPayment.create({
      data: {
        id: data.id,
        ownerId: tenantId,
        bank: data.bank,
        method: data.method ?? null,
        amount: Math.round(data.amountCents / 100),
        payerName: data.payerName,
        payerBank: data.payerBank ?? null,
        reference: data.reference ?? null,
        paidAt: new Date(data.paidAt),
        sourceReceivedAt: new Date(data.receivedAt),
        status: "unmatched",
      },
    });
  } catch (err) {
    // The webhook and the catch-up poll can race for the same payment: whoever loses sees a duplicate.
    if ((err as { code?: string }).code === "P2002") return "duplicate";
    throw err;
  }
  await rematchPayments(tenantId, data.id);
  return "stored";
}

/**
 * Catch-up: asks pagoradar for the payments received since the last one we have, in case a webhook was lost
 * (the app was down for longer than pagoradar's retries). Runs from the sweeper; needs PAGORADAR_URL and
 * PAGORADAR_API_KEY.
 */
export async function reconcilePagoradar(fetchImpl: typeof fetch = fetch): Promise<number> {
  const config = pagoradarConfig();
  if (!config?.url || !config.apiKey) return 0;
  const last = await prisma.receivedPayment.findFirst({ orderBy: { sourceReceivedAt: "desc" }, select: { sourceReceivedAt: true } });
  let since = (last?.sourceReceivedAt ?? new Date(Date.now() - MATCH_WINDOW_DAYS * 86400_000)).toISOString();
  let stored = 0;
  try {
    for (let page = 0; page < 10; page++) {
      const { status, data } = await pagoradarApi<{ payments?: unknown[]; next?: string | null }>(
        `/v1/payments?since=${encodeURIComponent(since)}&limit=200`,
        {},
        fetchImpl,
      );
      if (status !== 200) return stored;
      const list = Array.isArray(data.payments) ? data.payments : [];
      for (const raw of list) {
        const parsed = pagoradarPaymentSchema.safeParse(raw);
        if (!parsed.success) continue;
        const tenantId = await tenantForAccount(parsed.data.account?.id ?? parsed.data.accountId);
        if (tenantId && (await ingestPayment(tenantId, parsed.data)) === "stored") stored++;
      }
      if (list.length < 200 || !data.next || data.next === since) break;
      since = data.next;
    }
  } catch (err) {
    console.error("[pagoradar] catch-up failed:", err instanceof Error ? err.message : err);
  }
  return stored;
}
