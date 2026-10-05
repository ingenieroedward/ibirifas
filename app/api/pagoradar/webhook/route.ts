import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activateFromCharge, isBillingCharge, type BillingCharge } from "@/lib/billing";
import { ingestPayment, isBillingPayment, notifyOrganizer, pagoradarConfig, pagoradarPaymentSchema, tenantForAccount, verifyPagoradarSignature } from "@/lib/pagoradar";

const MAX_BYTES = 64 * 1024;

/**
 * pagoradar tells us a payment reached the organization's account. The body is signed with
 * PAGORADAR_WEBHOOK_SECRET; anything unsigned, stale or malformed is refused. Answering 2xx means "got it";
 * anything else and pagoradar retries for about two days. Each payment goes to the organization that connected
 * its receiving account (or, for the old single-organization setup, PAGORADAR_ORG).
 */
export async function POST(req: NextRequest) {
  const config = pagoradarConfig();
  if (!config) return NextResponse.json({ error: "No configurado" }, { status: 404 });

  const body = await readLimited(req, MAX_BYTES);
  if (body === null) return NextResponse.json({ error: "Demasiado grande" }, { status: 413 });
  if (!verifyPagoradarSignature(config.secret, req.headers.get("pagoradar-signature"), body)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let event: { type?: unknown; data?: unknown };
  try {
    event = JSON.parse(body) as { type?: unknown; data?: unknown };
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (event.type === "payment.test") {
    console.log("[pagoradar] evento de prueba recibido");
    return NextResponse.json({ ok: true, test: true });
  }
  // A receiving account's setup: Gmail's confirmation code arrived, or its first genuine notice.
  if (event.type === "account.confirmation_code" || event.type === "account.activated") {
    const data = (event.data ?? {}) as { account?: { id?: unknown }; code?: unknown };
    const tenantId = typeof data.account?.id === "string" ? await tenantForAccount(data.account.id) : null;
    if (tenantId) {
      void notifyOrganizer(
        tenantId,
        event.type === "account.activated"
          ? { title: "Pagos Bre-B conectados", body: "Llegó el primer aviso de tu banco: los pagos ya se cruzan solos con las reservas.", url: "/usuarios" }
          : {
              title: "Confirma el reenvío de Gmail",
              body: typeof data.code === "string" ? `Código de Gmail: ${data.code}. Escríbelo en Gmail para terminar de conectar los pagos.` : "Gmail pide confirmar el reenvío: mira el código en Mi equipo.",
              url: "/usuarios",
            },
      );
    }
    return NextResponse.json({ ok: true });
  }
  // A raffle's activation got paid (billing): the raffle starts selling and its organizer hears about it.
  if (event.type === "charge.paid" || event.type === "charge.expired") {
    const charge = (event.data ?? null) as BillingCharge | null;
    if (!isBillingCharge(charge)) return NextResponse.json({ ok: true, ignored: true });
    if (event.type === "charge.paid") {
      const raffleId = await activateFromCharge(charge!);
      if (raffleId) {
        const raffle = await prisma.raffle.findUnique({ where: { id: raffleId }, select: { ownerId: true, name: true } });
        if (raffle) {
          void notifyOrganizer(raffle.ownerId, { title: "Rifa activada", body: `Recibimos el pago: «${raffle.name}» ya puede vender.`, url: `/rifas/${raffleId}` });
        }
      }
    }
    return NextResponse.json({ ok: true });
  }
  if (event.type !== "payment.received") return NextResponse.json({ ok: true, ignored: true });

  const parsed = pagoradarPaymentSchema.safeParse(event.data);
  if (!parsed.success) return NextResponse.json({ error: "Pago inválido" }, { status: 400 });

  // Paying a raffle's activation (billing): handled by charge.paid, never a buyer's payment.
  if (await isBillingPayment(parsed.data)) return NextResponse.json({ ok: true, ignored: "billing" });
  const tenantId = await tenantForAccount(parsed.data.account?.id ?? parsed.data.accountId);
  if (!tenantId) {
    // An account nobody here connected (or a deleted organization): acknowledged, so pagoradar stops retrying.
    console.error(`[pagoradar] pago ${parsed.data.id} de una cuenta sin organización (${parsed.data.account?.id ?? parsed.data.accountId ?? "sin cuenta"})`);
    return NextResponse.json({ ok: true, ignored: "no organization" });
  }
  const result = await ingestPayment(tenantId, parsed.data);
  return NextResponse.json({ ok: true, result });
}

/** The raw body as text, or null as soon as it goes over `max` bytes (declared or actually sent). */
async function readLimited(req: NextRequest, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
