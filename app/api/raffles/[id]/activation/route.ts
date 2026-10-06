import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { BODY_LIMITS, RECEIPT_IMAGE_RE, readJsonBody } from "@/lib/body";
import { sendPush } from "@/lib/push";
import { formatCurrency } from "@/lib/format";
import { requestOrigin } from "@/lib/siteUrl";
import { publishRaffleChange } from "@/lib/realtime";
import {
  activateWithAllowance,
  ActivationError,
  activationState,
  billingBreb,
  billingPaymentsReady,
  billingWhatsapp,
  startActivationPayment,
  submitPackReceipt,
  type ActivationState,
} from "@/lib/billing";
import type { ActivationStateDTO } from "@/lib/types";

// The browser compresses the photo to a few hundred KB; this is only a ceiling.
const MAX_RECEIPT_LENGTH = 1.5 * 1024 * 1024;

const bodySchema = z.object({
  action: z.enum(["allowance", "pay", "receipt"]),
  pack: z.enum(["small", "large"]).optional(),
  // "receipt": the photo of the transfer (no SVG: only what a camera or a screenshot produces) and whose account paid.
  receiptDataUrl: z.string().max(MAX_RECEIPT_LENGTH).regex(RECEIPT_IMAGE_RE).optional(),
  payerName: z.string().trim().max(80).optional(),
});

async function dto(state: ActivationState): Promise<ActivationStateDTO> {
  return { ...state, payOnline: billingPaymentsReady(), whatsapp: billingWhatsapp(), breb: await billingBreb() };
}

async function ownRaffle(req: NextRequest, id: string) {
  const user = await getCurrentUser(req);
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  const tenantId = tenantIdFor(user);
  const raffle = await prisma.raffle.findUnique({ where: { id }, select: { ownerId: true } });
  if (!raffle || !tenantId || raffle.ownerId !== tenantId) {
    return { error: NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 }) };
  }
  return { user };
}

/** The raffle's activation: whether it sells, and how it would be activated (free, a credit, or paying). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownRaffle(req, id);
  if (own.error) return own.error;
  const state = await activationState(id);
  if (!state) return NextResponse.json({ error: "Rifa no encontrada" }, { status: 404 });
  return NextResponse.json(await dto(state));
}

/**
 * The organizer activates the raffle: "allowance" spends the free raffle or a credit; "pay" buys a pack (`pack`,
 * small by default): it opens (or reuses) a pagoradar charge and returns where to pay — once the payment is
 * confirmed the pack's raffles become credits and this raffle activates itself with one. "receipt": the pack was
 * paid by transfer to the platform owner's Bre-B key; the receipt waits for the superadmin's review.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownRaffle(req, id);
  if (own.error) return own.error;
  if (own.user.role !== "ORGANIZER") return NextResponse.json({ error: "Solo el organizador activa la rifa." }, { status: 403 });

  const body = await readJsonBody(req, BODY_LIMITS.receipt);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    if (parsed.data.action === "allowance") {
      const state = await activateWithAllowance(id);
      publishRaffleChange(id);
      return NextResponse.json(await dto(state));
    }
    if (parsed.data.action === "receipt") {
      if (!parsed.data.receiptDataUrl) return NextResponse.json({ error: "Adjunta la foto del comprobante." }, { status: 400 });
      const sent = await submitPackReceipt(id, parsed.data.pack ?? "small", parsed.data.receiptDataUrl, parsed.data.payerName || null);
      void notifySuperadmins(sent.ownerId, sent.raffleName, sent.pack.raffles, sent.pack.price);
      const state = await activationState(id);
      return NextResponse.json(await dto(state!));
    }
    const returnUrl = new URL(`/rifas/${id}?activacion=1`, await requestOrigin()).toString();
    return NextResponse.json(await dto(await startActivationPayment(id, parsed.data.pack ?? "small", returnUrl)));
  } catch (err) {
    if (err instanceof ActivationError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

/** Tells the platform owner(s) a receipt is waiting in Cobros. */
async function notifySuperadmins(ownerId: string, raffleName: string, raffles: number, price: number) {
  try {
    const [owner, admins] = await Promise.all([
      prisma.adminUser.findUnique({ where: { id: ownerId }, select: { name: true, orgCode: true } }),
      prisma.adminUser.findMany({ where: { role: "SUPERADMIN", active: true }, select: { id: true } }),
    ]);
    await sendPush(
      admins.map((a) => a.id),
      {
        title: "Comprobante de paquete por revisar",
        body: `${owner?.name ?? "Un organizador"}${owner?.orgCode ? ` (${owner.orgCode})` : ""} pagó el paquete de ${raffles} rifas (${formatCurrency(price)}) desde «${raffleName}».`,
        url: "/cobros",
      },
    );
  } catch (err) {
    console.error("[billing] could not notify the superadmin:", err instanceof Error ? err.message : err);
  }
}
