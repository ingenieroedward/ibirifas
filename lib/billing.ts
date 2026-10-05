import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pagoradarApi, pagoradarApiReady, PagoradarUnavailable } from "@/lib/pagoradar";
import { publishRaffleChange } from "@/lib/realtime";

/**
 * Billing: a raffle sells (numbers change hands, the public link opens) only once it is activated. How it gets
 * activated, in this order:
 *   - its organization is exempt (`billingExempt`: the platform owner's own, friends) — always active;
 *   - the organization's first raffle of up to FREE_MAX_NUMBERS numbers is free;
 *   - a raffle credit the platform owner gave or sold by hand (`raffleCredits`, any size);
 *   - otherwise it is paid: a pagoradar charge to the platform owner's account (PAGORADAR_BILLING_ACCOUNT),
 *     activated when pagoradar reports it paid (charge.paid), or by hand through a credit.
 * Never a cut of what the raffle sells: a flat price by size. BILLING=off turns all of it off.
 */

export const FREE_MAX_NUMBERS = 100;
export const SMALL_MAX_NUMBERS = 100;

export type ActivationKind = "legacy" | "exempt" | "free" | "credit" | "paid";
export type ActivationOption = "free" | "credit" | "pay";

export function billingEnabled(): boolean {
  return (process.env.BILLING ?? "").trim().toLowerCase() !== "off";
}

function priceEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** What activating a raffle of `totalNumbers` numbers costs, in pesos. */
export function activationPrice(totalNumbers: number): number {
  return totalNumbers <= SMALL_MAX_NUMBERS ? priceEnv("RAFFLE_PRICE_SMALL", 15_000) : priceEnv("RAFFLE_PRICE_LARGE", 35_000);
}

/** Whether a raffle can sell right now. */
export function raffleActive(raffle: { activatedAt: Date | null }, owner: { billingExempt: boolean }): boolean {
  return !billingEnabled() || raffle.activatedAt !== null || owner.billingExempt;
}

const BLOCKED = "Esta rifa aún no está activa. El organizador debe activarla para empezar a vender.";

/** For the routes that sell: a 402 response while the raffle isn't active, null when it can sell. */
export async function activationBlock(raffleId: string): Promise<NextResponse | null> {
  if (!billingEnabled()) return null;
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { activatedAt: true, owner: { select: { billingExempt: true } } },
  });
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
  price: number;
  credits: number;
  /** A payment under way: where to pay. */
  checkoutUrl: string | null;
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

function stateOf(raffle: RaffleForBilling, checkoutUrl: string | null = null): ActivationState {
  const active = raffleActive(raffle, raffle.owner);
  return {
    active,
    kind: raffle.activatedAt ? ((raffle.activationKind as ActivationKind | null) ?? "paid") : active ? "exempt" : null,
    option: active ? null : activationOption(raffle),
    price: activationPrice(raffle.totalNumbers),
    credits: raffle.owner.raffleCredits,
    checkoutUrl: active ? null : checkoutUrl,
  };
}

/**
 * The raffle's activation state. With a payment under way it also asks pagoradar how it went, so a missed
 * webhook still activates the raffle as soon as the organizer looks.
 */
export async function activationState(raffleId: string): Promise<ActivationState | null> {
  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId }, select: raffleSelect });
  if (!raffle) return null;
  if (raffleActive(raffle, raffle.owner) || !raffle.activationChargeId) return stateOf(raffle);
  const charge = await fetchCharge(raffle.activationChargeId).catch(() => null);
  if (charge?.status === "paid") {
    await activateFromCharge(charge);
    const fresh = await prisma.raffle.findUniqueOrThrow({ where: { id: raffleId }, select: raffleSelect });
    return stateOf(fresh);
  }
  return stateOf(raffle, charge?.status === "pending" ? charge.checkoutUrl : null);
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
  metadata?: { ibirifas?: unknown; raffleId?: unknown } | null;
}

/** pagoradar charges made by billing carry this mark in their metadata. */
export const BILLING_MARK = "activation";

export function isBillingCharge(charge: { metadata?: { ibirifas?: unknown } | null } | null | undefined): boolean {
  return charge?.metadata?.ibirifas === BILLING_MARK;
}

async function fetchCharge(id: string): Promise<BillingCharge | null> {
  if (!pagoradarApiReady()) return null;
  const { status, data } = await pagoradarApi<BillingCharge>(`/v1/charges/${encodeURIComponent(id)}`);
  return status === 200 ? data : null;
}

/**
 * Where to pay for a raffle's activation: the open pagoradar charge when there is one, or a new one (amount made
 * unique by pagoradar so the bank notice identifies it). Throws ActivationError when it can't be paid this way.
 */
export async function startActivationPayment(raffleId: string, returnUrl: string | null): Promise<ActivationState> {
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { ...raffleSelect, name: true, owner: { select: { billingExempt: true, freeRaffleUsedAt: true, raffleCredits: true, orgCode: true } } },
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
      if (open?.status === "pending") return stateOf(raffle, open.checkoutUrl);
    }
    const { status, data } = await pagoradarApi<BillingCharge & { error?: string }>("/v1/charges", {
      method: "POST",
      body: {
        account,
        amount: activationPrice(raffle.totalNumbers),
        description: `Ibirifas · activar la rifa «${raffle.name.slice(0, 90)}»`,
        reference: `rifa:${raffle.id}`,
        expiresInMinutes: 60,
        metadata: { ibirifas: BILLING_MARK, raffleId: raffle.id, org: raffle.owner.orgCode },
        ...(returnUrl ? { returnUrl } : {}),
      },
    });
    if (status !== 200 && status !== 201) throw new ActivationError(data.error ?? "No se pudo crear el cobro.", 502);
    await prisma.raffle.update({ where: { id: raffleId }, data: { activationChargeId: data.id } });
    return stateOf(raffle, data.checkoutUrl);
  } catch (err) {
    if (err instanceof PagoradarUnavailable) throw new ActivationError("El pago en línea no responde ahora. Intenta en unos minutos.", 503);
    throw err;
  }
}

/**
 * A billing charge got paid (charge.paid, or found paid when asked): activates its raffle once. Returns the
 * raffle id when this call activated it, null otherwise (already active, unknown raffle, not ours).
 */
export async function activateFromCharge(charge: BillingCharge): Promise<string | null> {
  if (!isBillingCharge(charge) || charge.status !== "paid") return null;
  const raffleId = typeof charge.metadata?.raffleId === "string" ? charge.metadata.raffleId : null;
  if (!raffleId) return null;
  const done = await prisma.raffle.updateMany({
    where: { id: raffleId, activatedAt: null },
    data: { activatedAt: new Date(), activationKind: "paid", activationAmount: charge.paidAmount ?? charge.amount, activationChargeId: charge.id },
  });
  if (done.count !== 1) return null;
  publishRaffleChange(raffleId);
  return raffleId;
}
