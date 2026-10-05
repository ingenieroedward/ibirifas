import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getVapidPublicKey, sendPush } from "@/lib/push";

const COOLDOWN_MS = 5_000;
const lastTestByUser = new Map<string, number>();

/** Sends a test notification to the caller's own devices so they can confirm it works. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!getVapidPublicKey()) {
    return NextResponse.json({ error: "Las notificaciones no están activadas en el servidor" }, { status: 503 });
  }

  const now = Date.now();
  if (now - (lastTestByUser.get(user.id) ?? 0) < COOLDOWN_MS) {
    return NextResponse.json({ error: "Espera unos segundos antes de probar de nuevo" }, { status: 429 });
  }
  lastTestByUser.set(user.id, now);

  const result = await sendPush([user.id], {
    title: "Ibirifas",
    body: "Las notificaciones funcionan. Te avisaremos de ventas y pagos.",
    url: "/rifas",
  });

  if (result.sent === 0) {
    return NextResponse.json(
      { error: "No se pudo enviar. Desactiva y vuelve a activar las notificaciones." },
      { status: 502 },
    );
  }
  return NextResponse.json({ sent: result.sent });
}
