import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { mailEnabled, sendMail } from "@/lib/mail";

// One test email per organizer per minute is plenty to check the setup.
const lastSent = new Map<string, number>();

/** Sends a test email to the organizer's contact address, to check the server's email setup. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "ORGANIZER") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!mailEnabled()) {
    return NextResponse.json({ error: "El servidor no tiene el correo configurado (SMTP)." }, { status: 409 });
  }
  const row = await prisma.adminUser.findUniqueOrThrow({ where: { id: user.id }, select: { contactEmail: true } });
  if (!row.contactEmail) return NextResponse.json({ error: "Primero guarda tu correo de contacto." }, { status: 400 });
  const now = Date.now();
  if (now - (lastSent.get(user.id) ?? 0) < 60_000) {
    return NextResponse.json({ error: "Espera un minuto antes de enviar otra prueba." }, { status: 429 });
  }
  lastSent.set(user.id, now);
  const ok = await sendMail({
    to: row.contactEmail,
    subject: "Prueba de correo · Ibirifas",
    text: "Si lees esto, los correos a tus compradores están funcionando.",
    html: "<p>Si lees esto, los correos a tus compradores están funcionando. ✅</p>",
  });
  if (!ok) return NextResponse.json({ error: "El servidor de correo rechazó el envío. Revisa la configuración SMTP." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
