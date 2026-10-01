import { NextRequest, NextResponse } from "next/server";
import { ingestPayment, pagoradarConfig, pagoradarPaymentSchema, pagoradarTenantId, verifyPagoradarSignature } from "@/lib/pagoradar";

const MAX_BYTES = 64 * 1024;

/**
 * pagoradar tells us a payment reached the organization's account. The body is signed with
 * PAGORADAR_WEBHOOK_SECRET; anything unsigned, stale or malformed is refused. Answering 2xx means "got it";
 * anything else and pagoradar retries for about two days (so a missing organization is a 503, not a 200).
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
  if (event.type !== "payment.received") return NextResponse.json({ ok: true, ignored: true });

  const parsed = pagoradarPaymentSchema.safeParse(event.data);
  if (!parsed.success) return NextResponse.json({ error: "Pago inválido" }, { status: 400 });

  const tenantId = await pagoradarTenantId();
  if (!tenantId) {
    console.error(`[pagoradar] no hay una organización activa con el código "${config.orgCode}" (PAGORADAR_ORG)`);
    return NextResponse.json({ error: "Organización no encontrada" }, { status: 503 });
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
