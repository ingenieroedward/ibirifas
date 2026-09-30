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

  // A device belongs to whoever is logged in on it now: signing in as someone
  // else on the same phone moves the subscription instead of duplicating it.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
