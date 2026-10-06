import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, tenantIdFor } from "@/lib/session";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { requestOrigin } from "@/lib/siteUrl";
import { publishRaffleChange } from "@/lib/realtime";
import {
  activateWithAllowance,
  ActivationError,
  activationState,
  billingPaymentsReady,
  billingWhatsapp,
  startActivationPayment,
  type ActivationState,
} from "@/lib/billing";
import type { ActivationStateDTO } from "@/lib/types";

const bodySchema = z.object({ action: z.enum(["allowance", "pay"]), pack: z.enum(["small", "large"]).optional() });

function dto(state: ActivationState): ActivationStateDTO {
  return { ...state, payOnline: billingPaymentsReady(), whatsapp: billingWhatsapp() };
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
  return NextResponse.json(dto(state));
}

/**
 * The organizer activates the raffle: "allowance" spends the free raffle or a credit; "pay" buys a pack (`pack`,
 * small by default): it opens (or reuses) a pagoradar charge and returns where to pay — once the payment is
 * confirmed the pack's raffles become credits and this raffle activates itself with one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const own = await ownRaffle(req, id);
  if (own.error) return own.error;
  if (own.user.role !== "ORGANIZER") return NextResponse.json({ error: "Solo el organizador activa la rifa." }, { status: 403 });

  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    if (parsed.data.action === "allowance") {
      const state = await activateWithAllowance(id);
      publishRaffleChange(id);
      return NextResponse.json(dto(state));
    }
    const returnUrl = new URL(`/rifas/${id}?activacion=1`, await requestOrigin()).toString();
    return NextResponse.json(dto(await startActivationPayment(id, parsed.data.pack ?? "small", returnUrl)));
  } catch (err) {
    if (err instanceof ActivationError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
