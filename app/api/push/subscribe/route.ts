import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getVapidPublicKey, isAllowedPushEndpoint } from "@/lib/push";
import { BODY_LIMITS, readJsonBody } from "@/lib/body";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

/** The page's origin from the Origin header ("https://ibirifas.com"), or null when absent or malformed. */
function pageOrigin(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!getVapidPublicKey()) {
    return NextResponse.json({ error: "Las notificaciones no están activadas en el servidor" }, { status: 503 });
  }

  const rawBodyBody = await readJsonBody(req, BODY_LIMITS.small);
  if (!rawBodyBody.ok) return rawBodyBody.response;
  const rawBody: unknown = rawBodyBody.value;

  const parsed = subscribeSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { endpoint, keys } = parsed.data;

  if (!isAllowedPushEndpoint(endpoint)) {
    return NextResponse.json({ error: "Servicio de notificaciones no permitido" }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  const origin = pageOrigin(req.headers.get("origin"));

  // A device belongs to whoever is logged in on it now: signing in as someone
  // else on the same phone moves the subscription instead of duplicating it.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent, origin },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent, origin },
  });
  // After a domain change the old site's service worker is still registered on the person's phones and would
  // show every notification again: subscribing on this site drops their subscriptions from any other one.
  if (origin) {
    await prisma.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint: { not: endpoint }, OR: [{ origin: null }, { origin: { not: origin } }] },
    });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
