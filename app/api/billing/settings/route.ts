import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";
import { billingBreb, billingPaymentsReady, billingWhatsapp, rafflePacks, saveBillingBreb } from "@/lib/billing";
import type { BillingSettingsDTO } from "@/lib/types";

const bodySchema = z.object({
  key: z.string().trim().min(3).max(80),
  holder: z.string().trim().max(80),
});

async function superadmin(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (user.role !== "SUPERADMIN") return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  return { user };
}

async function dto(): Promise<BillingSettingsDTO> {
  return { breb: await billingBreb(), payOnline: billingPaymentsReady(), whatsapp: billingWhatsapp(), packs: rafflePacks() };
}

/** How organizers pay for packs: the Bre-B key for transfers (editable here), and whether online payment is set up. */
export async function GET(req: NextRequest) {
  const auth = await superadmin(req);
  if (auth.error) return auth.error;
  return NextResponse.json(await dto());
}

/** The superadmin sets the Bre-B key (and its holder's name) organizers transfer to when paying a pack. */
export async function PUT(req: NextRequest) {
  const auth = await superadmin(req);
  if (auth.error) return auth.error;
  const body = await readJsonBody(req, BODY_LIMITS.small);
  if (!body.ok) return body.response;
  const parsed = bodySchema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Escribe la llave Bre-B." }, { status: 400 });
  await saveBillingBreb(parsed.data.key, parsed.data.holder);
  return NextResponse.json(await dto());
}
