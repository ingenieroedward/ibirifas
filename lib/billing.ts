import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pagoradarApi, pagoradarApiReady, PagoradarUnavailable } from "@/lib/pagoradar";
import { publishRaffleChange } from "@/lib/realtime";
import { logActivity } from "@/lib/activity";

/**
 * Billing: a raffle sells (numbers change hands, the public link opens) only once it is activated. How it gets
 * activated, in this order:
 *   - its organization is exempt (`billingExempt`: the platform owner's own, friends) — always active;
 *   - the organization's first raffle of up to FREE_MAX_NUMBERS numbers is free;
 *   - a prepaid raffle (`raffleCredits`, any size): left from a pack, or given by the platform owner by hand;
 *   - otherwise the organizer buys a pack of raffles (3 or 10; bigger deals are agreed by WhatsApp), either
 *     online — a pagoradar charge to the platform owner's account (PAGORADAR_BILLING_ACCOUNT), granted when
 *     pagoradar reports it paid (charge.paid) — or by transfer to the platform owner's Bre-B key with a receipt
 *     the superadmin approves. Either way the pack's raffles become credits and the raffle it was bought from
 *     takes one of them.
 * Never a cut of what the raffle sells. BILLING=off turns all of it off.
 */

export const FREE_MAX_NUMBERS = 100;

export type ActivationKind = "legacy" | "exempt" | "free" | "credit" | "paid";
export type ActivationOption = "free" | "credit" | "pay";

export function billingEnabled(): boolean {
  return (process.env.BILLING ?? "").trim().toLowerCase() !== "off";
}

function intEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export type PackId = "small" | "large";

/** A pack of prepaid raffles: `raffles` activations, any size, for `price` pesos. */
export interface RafflePack {
  id: PackId;
  raffles: number;
  price: number;
}

/** The packs on sale, smallest first (PACK_SMALL_RAFFLES/PACK_SMALL_PRICE, PACK_LARGE_RAFFLES/PACK_LARGE_PRICE). */
export function rafflePacks(): RafflePack[] {
  return [
    { id: "small", raffles: intEnv("PACK_SMALL_RAFFLES", 3), price: intEnv("PACK_SMALL_PRICE", 15_000) },
    { id: "large", raffles: intEnv("PACK_LARGE_RAFFLES", 10), price: intEnv("PACK_LARGE_PRICE", 35_000) },
  ];
}

export function rafflePack(id: string): RafflePack | null {
  return rafflePacks().find((p) => p.id === id) ?? null;
}

/** Whether a raffle can sell right now. */
export function raffleActive(raffle: { activatedAt: Date | null }, owner: { billingExempt: boolean }): boolean {
  return !billingEnabled() || raffle.activatedAt !== null || owner.billingExempt;
}

const BLOCKED = "Esta rifa aún no está activa. El organizador debe activarla para empezar a vender.";

/** For the routes that sell: a 402 response while the raffle isn't active (404 once in the trash), null when it can sell. */
export async function activationBlock(raffleId: string): Promise<NextResponse | null> {
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { activatedAt: true, deletedAt: true, owner: { select: { billingExempt: true } } },
  });
  // Also the guard of every route that sells: a raffle in the trash (lib/trash.ts) is gone until restored.
  if (raffle?.deletedAt) return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  if (!billingEnabled()) return null;
  if (!raffle || raffleActive(raffle, raffle.owner)) return null;
  return NextResponse.json({ error: BLOCKED, code: "activation_required" }, { status: 402 });
}

/** The pagoradar side is set up: payments can be collected and confirmed on their own. */
export function billingPaymentsReady(): boolean {
  return pagoradarApiReady() && Boolean(billingAccountId());
}

function billingAccountId(): string | null {
  return (process.env.PAGORADAR_BILLING_ACCOUNT ?? "").trim() || null;
}

/** The platform owner's WhatsApp (digits, with country code), for paying by hand; null when not configured. */
export function billingWhatsapp(): string | null {
  const digits = (process.env.BILLING_WHATSAPP ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

export interface ActivationState {
  active: boolean;
  kind: ActivationKind | null;
  /** How it would be activated now (null when already active). */
  option: ActivationOption | null;
  packs: RafflePack[];
  credits: number;
  /** A payment under way: where to pay, and for which pack. */
  checkoutUrl: string | null;
  pendingPack: PackId | null;
  /** A receipt sent from this raffle that's waiting for review or was rejected. */
  receipt: ActivationReceipt | null;
}

type RaffleForBilling = {
  id: string;
  totalNumbers: number;
  activatedAt: Date | null;
  activationKind: string | null;
  activationChargeId: string | null;
  owner: { billingExempt: boolean; freeRaffleUsedAt: Date | null; raffleCredits: number };
};

const raffleSelect = {
  id: true,
  totalNumbers: true,
  activatedAt: true,
  activationKind: true,
  activationChargeId: true,
  owner: { select: { billingExempt: true, freeRaffleUsedAt: true, raffleCredits: true } },
} as const;

export function activationOption(raffle: RaffleForBilling): ActivationOption {
  if (!raffle.owner.freeRaffleUsedAt && raffle.totalNumbers <= FREE_MAX_NUMBERS) return "free";
  if (raffle.owner.raffleCredits > 0) return "credit";
  return "pay";
}

function stateOf(raffle: RaffleForBilling, pending: BillingCharge | null = null, receipt: ActivationReceipt | null = null): ActivationState {
  const active = raffleActive(raffle, raffle.owner);
  const open = !active && pending?.status === "pending" ? pending : null;
  return {
    active,
    kind: raffle.activatedAt ? ((raffle.activationKind as ActivationKind | null) ?? "paid") : active ? "exempt" : null,
    option: active ? null : activationOption(raffle),
    packs: rafflePacks(),
    credits: raffle.owner.raffleCredits,
    checkoutUrl: open?.checkoutUrl ?? null,
    pendingPack: open ? chargePackId(open) : null,
    receipt: active ? null : receipt,
  };
}

/**
 * The raffle's activation state. With a payment under way it also asks pagoradar how it went, so a missed
 * webhook still activates the raffle as soon as the organizer looks.
 */
export async function activationState(raffleId: string): Promise<ActivationState | null> {
  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId }, select: raffleSelect });
  if (!raffle) return null;
  if (raffleActive(raffle, raffle.owner)) return stateOf(raffle);
  const receipt = await raffleReceipt(raffleId);
  if (!raffle.activationChargeId) return stateOf(raffle, null, receipt);
  const charge = await fetchCharge(raffle.activationChargeId).catch(() => null);
  if (charge?.status === "paid") {
    await activateFromCharge(charge);
    const fresh = await prisma.raffle.findUniqueOrThrow({ where: { id: raffleId }, select: raffleSelect });
    return stateOf(fresh, null, await raffleReceipt(raffleId));
  }
  return stateOf(raffle, charge, receipt);
}

export class ActivationError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

/** Activates with the free raffle or a credit (whichever applies). Both are spent atomically, once. */
export async function activateWithAllowance(raffleId: string): Promise<ActivationState> {
  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId }, select: { ...raffleSelect, ownerId: true } });
  if (!raffle) throw new ActivationError("Rifa no encontrada", 404);
  if (raffleActive(raffle, raffle.owner)) return stateOf(raffle);
  const option = activationOption(raffle);
  if (option === "pay") throw new ActivationError("Esta rifa se activa con el pago.", 402);

  await prisma.$transaction(async (tx) => {
    const spent =
      option === "free"
        ? await tx.adminUser.updateMany({ where: { id: raffle.ownerId, freeRaffleUsedAt: null }, data: { freeRaffleUsedAt: new Date() } })
        : await tx.adminUser.updateMany({ where: { id: raffle.ownerId, raffleCredits: { gt: 0 } }, data: { raffleCredits: { decrement: 1 } } });
    if (spent.count !== 1) throw new ActivationError("Ya se usó: vuelve a intentarlo.");
    const done = await tx.raffle.updateMany({
      where: { id: raffleId, activatedAt: null },
      data: { activatedAt: new Date(), activationKind: option, activationAmount: 0 },
    });
    if (done.count !== 1) throw new ActivationError("La rifa ya está activa.");
  });
  return stateOf(await prisma.raffle.findUniqueOrThrow({ where: { id: raffleId }, select: raffleSelect }));
}

// ---- Paying through pagoradar ----

/** The fields of a pagoradar charge we use (GET /v1/charges/:id, and the data of charge.* events). */
export interface BillingCharge {
  id: string;
  status: "pending" | "paid" | "expired" | "canceled";
  amount: number;
  paidAmount?: number | null;
  checkoutUrl: string;
  metadata?: { ibirifas?: unknown; raffleId?: unknown; owner?: unknown; pack?: unknown; raffles?: unknown } | null;
}

/** pagoradar charges made by billing carry this mark in their metadata. */
export const BILLING_MARK = "activation";

export function isBillingCharge(charge: { metadata?: { ibirifas?: unknown } | null } | null | undefined): boolean {
  return charge?.metadata?.ibirifas === BILLING_MARK;
}

/** The pack a charge pays for; null for charges from before packs (they paid for one raffle). */
function chargePackId(charge: BillingCharge): PackId | null {
  const pack = charge.metadata?.pack;
  return pack === "small" || pack === "large" ? pack : null;
}

async function fetchCharge(id: string): Promise<BillingCharge | null> {
  if (!pagoradarApiReady()) return null;
  const { status, data } = await pagoradarApi<BillingCharge>(`/v1/charges/${encodeURIComponent(id)}`);
  return status === 200 ? data : null;
}

/**
 * Where to pay for a pack bought from a waiting raffle: the open pagoradar charge for that same pack when there is
 * one, or a new one (amount made unique by pagoradar so the bank notice identifies it). Throws ActivationError when
 * it can't be paid this way.
 */
export async function startActivationPayment(raffleId: string, packId: string, returnUrl: string | null): Promise<ActivationState> {
  const pack = rafflePack(packId);
  if (!pack) throw new ActivationError("Ese paquete no existe.", 400);
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { ...raffleSelect, ownerId: true, owner: { select: { billingExempt: true, freeRaffleUsedAt: true, raffleCredits: true, orgCode: true } } },
  });
  if (!raffle) throw new ActivationError("Rifa no encontrada", 404);
  if (raffleActive(raffle, raffle.owner)) return stateOf(raffle);
  if (activationOption(raffle) !== "pay") throw new ActivationError("Esta rifa se activa sin pagar.");
  const account = billingAccountId();
  if (!account || !pagoradarApiReady()) throw new ActivationError("El pago en línea no está disponible.", 503);

  try {
    if (raffle.activationChargeId) {
      const open = await fetchCharge(raffle.activationChargeId);
      if (open?.status === "paid") {
        await activateFromCharge(open);
        return stateOf(await prisma.raffle.findUniqueOrThrow({ where: { id: raffleId }, select: raffleSelect }));
      }
      if (open?.status === "pending" && chargePackId(open) === pack.id) return stateOf(raffle, open);
    }
    const { status, data } = await pagoradarApi<BillingCharge & { error?: string }>("/v1/charges", {
      method: "POST",
      body: {
        account,
        amount: pack.price,
        description: `Ibirifas · paquete de ${pack.raffles} rifas`,
        reference: `rifa:${raffle.id}`,
        expiresInMinutes: 60,
        metadata: { ibirifas: BILLING_MARK, raffleId: raffle.id, owner: raffle.ownerId, org: raffle.owner.orgCode, pack: pack.id, raffles: pack.raffles },
        ...(returnUrl ? { returnUrl } : {}),
      },
    });
    if (status !== 200 && status !== 201) throw new ActivationError(data.error ?? "No se pudo crear el cobro.", 502);
    await prisma.raffle.update({ where: { id: raffleId }, data: { activationChargeId: data.id } });
    return stateOf(raffle, { ...data, status: "pending", metadata: { pack: pack.id } });
  } catch (err) {
    if (err instanceof PagoradarUnavailable) throw new ActivationError("El pago en línea no responde ahora. Intenta en unos minutos.", 503);
    throw err;
  }
}

export interface PackPaid {
  ownerId: string;
  raffles: number;
  amount: number;
  /** The raffle the pack was bought from, when it took one of the raffles just now. */
  activatedRaffleId: string | null;
}

/**
 * A billing charge got paid (charge.paid, or found paid when asked): grants its pack (lib/billing.ts grantPack).
 * Returns null when this call did nothing (already counted, not ours, unknown organization).
 */
export async function activateFromCharge(charge: BillingCharge): Promise<PackPaid | null> {
  if (!isBillingCharge(charge) || charge.status !== "paid") return null;
  const raffleId = typeof charge.metadata?.raffleId === "string" ? charge.metadata.raffleId : null;
  const packId = chargePackId(charge);
  const declared = Number(charge.metadata?.raffles);
  return grantPack({
    purchaseId: charge.id,
    raffleId,
    ownerHint: typeof charge.metadata?.owner === "string" ? charge.metadata.owner : null,
    pack: packId ?? "single",
    // Charges from before packs paid for that one raffle.
    raffles: packId && Number.isInteger(declared) && declared > 0 ? declared : 1,
    amount: charge.paidAmount ?? charge.amount,
    method: "Bre-B en línea",
  });
}

/**
 * A pack was paid (a pagoradar charge, or a receipt the superadmin approved): adds its raffles to the
 * organization's credits, once per `purchaseId` (CreditPurchase.chargeId is unique), and activates the raffle it
 * was bought from with one of them if it's still waiting. Records it in the activity log. Returns null when this
 * call did nothing (already counted, unknown organization).
 */
export async function grantPack(input: {
  purchaseId: string;
  raffleId: string | null;
  ownerHint?: string | null;
  pack: string;
  raffles: number;
  amount: number;
  method: string;
}): Promise<PackPaid | null> {
  const { purchaseId, raffleId, pack, raffles, amount } = input;
  const raffle = raffleId
    ? await prisma.raffle.findUnique({ where: { id: raffleId }, select: { id: true, ownerId: true, activatedAt: true, deletedAt: true } })
    : null;
  const ownerId = raffle?.ownerId ?? input.ownerHint ?? null;
  if (!ownerId) return null;

  let activatedRaffleId: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.creditPurchase.create({ data: { ownerId, chargeId: purchaseId, pack, raffles, amount, raffleId } });
      if (raffle && !raffle.activatedAt && !raffle.deletedAt) {
        const done = await tx.raffle.updateMany({
          where: { id: raffle.id, activatedAt: null },
          data: {
            activatedAt: new Date(),
            activationKind: "paid",
            activationAmount: Math.round(amount / raffles),
            ...(purchaseId.startsWith("receipt:") ? {} : { activationChargeId: purchaseId }),
          },
        });
        if (done.count === 1) activatedRaffleId = raffle.id;
      }
      const left = raffles - (activatedRaffleId ? 1 : 0);
      if (left > 0) await tx.adminUser.update({ where: { id: ownerId }, data: { raffleCredits: { increment: left } } });
    });
  } catch (err) {
    // Already counted (a repeated charge.paid, or the webhook and a check racing): the unique chargeId says so.
    if ((err as { code?: string }).code === "P2002") return null;
    // The organization is gone: nothing to add the raffles to.
    if ((err as { code?: string }).code === "P2025") return null;
    throw err;
  }
  if (activatedRaffleId) publishRaffleChange(activatedRaffleId);
  const owner = await prisma.adminUser.findUnique({ where: { id: ownerId }, select: { name: true } });
  await logActivity({
    ownerId,
    actorName: owner?.name ?? "Organizador",
    action: "pack.purchased",
    targetName: raffles === 1 ? "1 rifa" : `Paquete de ${raffles} rifas`,
    details: { raffles, amount, method: input.method },
  });
  return { ownerId, raffles, amount, activatedRaffleId };
}

// ---- Paying by transfer + receipt (the superadmin reviews it) ----

const BREB_KEY = "billing.brebKey";
const BREB_HOLDER = "billing.brebHolder";

export interface BillingBreb {
  key: string;
  holder: string | null;
}

/** The platform owner's Bre-B key for packs paid by transfer (set in the superadmin's Cobros page), or null. */
export async function billingBreb(): Promise<BillingBreb | null> {
  const rows = await prisma.platformSetting.findMany({ where: { key: { in: [BREB_KEY, BREB_HOLDER] } } });
  const key = rows.find((r) => r.key === BREB_KEY)?.value.trim();
  if (!key) return null;
  return { key, holder: rows.find((r) => r.key === BREB_HOLDER)?.value.trim() || null };
}

export async function saveBillingBreb(key: string, holder: string): Promise<BillingBreb | null> {
  await prisma.$transaction([
    prisma.platformSetting.upsert({ where: { key: BREB_KEY }, create: { key: BREB_KEY, value: key }, update: { value: key } }),
    prisma.platformSetting.upsert({ where: { key: BREB_HOLDER }, create: { key: BREB_HOLDER, value: holder }, update: { value: holder } }),
  ]);
  return billingBreb();
}

/** The latest receipt sent from a raffle, while it still matters (waiting for review, or rejected). */
export async function raffleReceipt(raffleId: string): Promise<ActivationReceipt | null> {
  const last = await prisma.packRequest.findFirst({
    where: { raffleId },
    orderBy: { createdAt: "desc" },
    select: { status: true, pack: true, raffles: true, amount: true, rejectReason: true, createdAt: true },
  });
  if (!last || last.status === "approved") return null;
  return {
    status: last.status === "rejected" ? "rejected" : "pending",
    pack: last.pack === "large" ? "large" : "small",
    raffles: last.raffles,
    amount: last.amount,
    reason: last.rejectReason,
    sentAt: last.createdAt.toISOString(),
  };
}

export interface ActivationReceipt {
  status: "pending" | "rejected";
  pack: PackId;
  raffles: number;
  amount: number;
  reason: string | null;
  sentAt: string;
}

/**
 * The organizer paid a pack by transfer and sends the receipt from a waiting raffle. A receipt still waiting for
 * review from the same raffle is replaced (new photo or another pack). Returns the request id.
 */
export async function submitPackReceipt(
  raffleId: string,
  packId: string,
  receiptDataUrl: string,
  payerName: string | null,
): Promise<{ id: string; ownerId: string; raffleName: string; pack: RafflePack }> {
  const pack = rafflePack(packId);
  if (!pack) throw new ActivationError("Ese paquete no existe.", 400);
  if (!(await billingBreb())) throw new ActivationError("El pago por transferencia no está disponible.", 503);
  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId }, select: { ...raffleSelect, ownerId: true, name: true } });
  if (!raffle) throw new ActivationError("Rifa no encontrada", 404);
  if (raffleActive(raffle, raffle.owner)) throw new ActivationError("La rifa ya está activa.");
  if (activationOption(raffle) !== "pay") throw new ActivationError("Esta rifa se activa sin pagar.");

  const data = { pack: pack.id, raffles: pack.raffles, amount: pack.price, payerName, receiptDataUrl };
  const open = await prisma.packRequest.findFirst({ where: { raffleId, status: "pending" }, select: { id: true } });
  // Only while it's still waiting: one the superadmin just reviewed stays as it is, and this one is new.
  const replaced = open
    ? await prisma.packRequest.updateMany({ where: { id: open.id, status: "pending" }, data: { ...data, createdAt: new Date() } })
    : { count: 0 };
  const id = replaced.count === 1
    ? open!.id
    : (await prisma.packRequest.create({ data: { ...data, ownerId: raffle.ownerId, raffleId }, select: { id: true } })).id;
  return { id, ownerId: raffle.ownerId, raffleName: raffle.name, pack };
}

/**
 * The superadmin reviews a receipt: "approve" grants the pack (once), "reject" sends it back with a reason so
 * the organizer can send another. Returns what happened, for the notice to the organizer.
 */
export async function reviewPackRequest(
  id: string,
  action: "approve" | "reject",
  reviewerName: string,
  reason: string | null,
): Promise<{ ownerId: string; raffleId: string | null; raffles: number; activatedRaffleId: string | null }> {
  const request = await prisma.packRequest.findUnique({ where: { id } });
  if (!request) throw new ActivationError("Comprobante no encontrado", 404);
  if (request.status !== "pending") throw new ActivationError("Este comprobante ya se revisó.");
  // Claim it first, so two reviews at once can't both act.
  const claimed = await prisma.packRequest.updateMany({
    where: { id, status: "pending" },
    data: { status: action === "approve" ? "approved" : "rejected", reviewedAt: new Date(), reviewedByName: reviewerName, rejectReason: action === "reject" ? reason : null },
  });
  if (claimed.count !== 1) throw new ActivationError("Este comprobante ya se revisó.");
  if (action === "reject") return { ownerId: request.ownerId, raffleId: request.raffleId, raffles: request.raffles, activatedRaffleId: null };
  const paid = await grantPack({
    purchaseId: `receipt:${request.id}`,
    raffleId: request.raffleId,
    ownerHint: request.ownerId,
    pack: request.pack,
    raffles: request.raffles,
    amount: request.amount,
    method: "comprobante",
  });
  return { ownerId: request.ownerId, raffleId: request.raffleId, raffles: request.raffles, activatedRaffleId: paid?.activatedRaffleId ?? null };
}
