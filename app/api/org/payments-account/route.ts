import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { PagoradarUnavailable, pagoradarApi, pagoradarApiReady, paymentsConnected } from "@/lib/pagoradar";
import type { PaymentsAccountDTO } from "@/lib/types";

const BANKS = ["nequi_negocios", "nequi", "bancolombia"] as const;
const inputSchema = z.object({
  ownerEmail: z.string().trim().toLowerCase().email().max(120),
  banks: z.array(z.enum(BANKS)).min(1).max(BANKS.length),
});

interface RemoteAccount {
  id: string;
  address: string;
  ownerEmails: string[];
  banks: string[];
  status: "pending" | "active" | "disabled";
  confirmationCode: string | null;
  confirmationLink: string | null;
  confirmationAt: string | null;
  lastPaymentAt: string | null;
  setup?: { gmailFilterFrom?: string };
  error?: string;
}

const toAccount = (a: RemoteAccount): NonNullable<PaymentsAccountDTO["account"]> => ({
  id: a.id,
  address: a.address,
  ownerEmails: a.ownerEmails,
  banks: a.banks,
  status: a.status,
  confirmationCode: a.confirmationCode,
  confirmationLink: a.confirmationLink,
  confirmationAt: a.confirmationAt,
  lastPaymentAt: a.lastPaymentAt,
  gmailFilterFrom: a.setup?.gmailFilterFrom ?? "",
});

async function organizerOnly(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (user.role !== "ORGANIZER") return { error: NextResponse.json({ error: "Solo el organizador conecta la cuenta de pagos" }, { status: 403 }) };
  return { user };
}

const unavailable = () => NextResponse.json({ error: "No se pudo hablar con el lector de pagos. Inténtalo en un momento." }, { status: 502 });

/** What Mi equipo shows: is this organization's account connected, its address, Gmail code and status. */
async function state(organizerId: string): Promise<PaymentsAccountDTO> {
  const org = await prisma.adminUser.findUniqueOrThrow({ where: { id: organizerId }, select: { pagoradarAccountId: true, autoApprovePayments: true } });
  const base = {
    available: pagoradarApiReady(),
    legacy: !org.pagoradarAccountId && (await paymentsConnected(organizerId)),
    autoApprove: org.autoApprovePayments,
  };
  if (!org.pagoradarAccountId || !base.available) return { ...base, account: null };
  try {
    const { status, data } = await pagoradarApi<RemoteAccount>(`/v1/accounts/${encodeURIComponent(org.pagoradarAccountId)}`);
    if (status === 404) {
      // Deleted from pagoradar's panel: the link is gone.
      await prisma.adminUser.update({ where: { id: organizerId }, data: { pagoradarAccountId: null } });
      return { ...base, account: null };
    }
    return { ...base, account: toAccount(data) };
  } catch (err) {
    if (err instanceof PagoradarUnavailable) return { ...base, account: null, unreachable: true };
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const auth = await organizerOnly(req);
  if (auth.error) return auth.error;
  return NextResponse.json(await state(auth.user.id));
}

/** Connect: pagoradar creates this organization's receiving account (tenantRef = the organizer's id). */
export async function POST(req: NextRequest) {
  const auth = await organizerOnly(req);
  if (auth.error) return auth.error;
  if (!pagoradarApiReady()) return NextResponse.json({ error: "Este servidor no tiene el lector de pagos configurado." }, { status: 503 });
  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = inputSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Escribe un correo válido y elige al menos un banco." }, { status: 400 });

  const org = await prisma.adminUser.findUniqueOrThrow({ where: { id: auth.user.id }, select: { name: true, orgCode: true, pagoradarAccountId: true } });
  if (org.pagoradarAccountId) return NextResponse.json({ error: "Ya tienes una cuenta conectada." }, { status: 409 });
  try {
    const { status, data } = await pagoradarApi<RemoteAccount>("/v1/accounts", {
      method: "POST",
      body: {
        name: `${org.name}${org.orgCode ? ` (${org.orgCode})` : ""}`.slice(0, 60),
        ownerEmails: [parsed.data.ownerEmail],
        banks: parsed.data.banks,
        tenantRef: auth.user.id,
      },
    });
    if (status !== 201) return NextResponse.json({ error: data.error ?? "No se pudo crear la cuenta." }, { status: 400 });
    await prisma.adminUser.update({ where: { id: auth.user.id }, data: { pagoradarAccountId: data.id } });
  } catch (err) {
    if (err instanceof PagoradarUnavailable) return unavailable();
    throw err;
  }
  return NextResponse.json(await state(auth.user.id), { status: 201 });
}

/** Change the Gmail the bank writes to, or the banks. */
export async function PATCH(req: NextRequest) {
  const auth = await organizerOnly(req);
  if (auth.error) return auth.error;
  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = inputSchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Escribe un correo válido y elige al menos un banco." }, { status: 400 });
  const org = await prisma.adminUser.findUniqueOrThrow({ where: { id: auth.user.id }, select: { pagoradarAccountId: true } });
  if (!org.pagoradarAccountId) return NextResponse.json({ error: "No tienes una cuenta conectada." }, { status: 404 });
  try {
    const { status, data } = await pagoradarApi<RemoteAccount>(`/v1/accounts/${encodeURIComponent(org.pagoradarAccountId)}`, {
      method: "PATCH",
      body: { ownerEmails: [parsed.data.ownerEmail], banks: parsed.data.banks, active: true },
    });
    if (status !== 200) return NextResponse.json({ error: data.error ?? "No se pudo guardar." }, { status: 400 });
  } catch (err) {
    if (err instanceof PagoradarUnavailable) return unavailable();
    throw err;
  }
  return NextResponse.json(await state(auth.user.id));
}

/** Disconnect: the receiving account is deleted (or disabled, if it already received payments). */
export async function DELETE(req: NextRequest) {
  const auth = await organizerOnly(req);
  if (auth.error) return auth.error;
  const org = await prisma.adminUser.findUniqueOrThrow({ where: { id: auth.user.id }, select: { pagoradarAccountId: true } });
  if (org.pagoradarAccountId) {
    try {
      await pagoradarApi(`/v1/accounts/${encodeURIComponent(org.pagoradarAccountId)}`, { method: "DELETE" });
    } catch (err) {
      if (err instanceof PagoradarUnavailable) return unavailable();
      throw err;
    }
    await prisma.adminUser.update({ where: { id: auth.user.id }, data: { pagoradarAccountId: null } });
  }
  return NextResponse.json(await state(auth.user.id));
}
