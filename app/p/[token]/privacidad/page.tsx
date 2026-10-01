import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageThemeStyle } from "@/lib/theme";
import { CrownIcon } from "@/components/icons/Crown";

export const metadata: Metadata = {
  title: "Aviso de privacidad · Ibirifas",
  robots: { index: false, follow: false },
};

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{22}$/;

/**
 * The privacy notice shown to buyers before they reserve (Colombia, Ley 1581 de 2012): who is
 * responsible for their data, what is collected and why, and how to exercise their rights.
 */
export default async function PrivacyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_SHAPE.test(token)) notFound();
  const raffle = await prisma.raffle.findUnique({
    where: { publicToken: token },
    select: {
      name: true,
      themeBackground: true,
      themeNumberColor: true,
      owner: { select: { name: true, contactEmail: true } },
    },
  });
  if (!raffle) notFound();
  const who = raffle.owner.name;
  const contact = raffle.owner.contactEmail;

  return (
    <div
      className="flex min-h-dvh flex-1 flex-col pb-12"
      style={pageThemeStyle({ background: raffle.themeBackground, numberColor: raffle.themeNumberColor })}
    >
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-safe">
        <div className="flex items-center justify-center gap-2 py-5">
          <CrownIcon className="h-5 w-8 text-gold-400" />
          <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-gold-400">Ibirifas</span>
        </div>
        <article className="space-y-4 rounded-2xl border border-line bg-bg-elevated p-5 text-sm leading-relaxed text-text shadow-card">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Aviso de privacidad</h1>
          <p className="text-text-muted">Rifa «{raffle.name}»</p>

          <section className="space-y-1">
            <h2 className="font-semibold">Responsable de tus datos</h2>
            <p>
              <strong>{who}</strong>, quien organiza esta rifa
              {contact ? (
                <>
                  , con quien te puedes comunicar en <a className="text-gold-400 underline" href={`mailto:${contact}`}>{contact}</a>
                </>
              ) : (
                ", con quien te puedes comunicar por el mismo medio en que te compartió la rifa"
              )}
              . Ibirifas es la plataforma que usa para gestionarla y trata los datos solo por su cuenta y siguiendo sus
              instrucciones.
            </p>
          </section>

          <section className="space-y-1">
            <h2 className="font-semibold">Qué datos pedimos</h2>
            <p>
              Tu nombre, tu teléfono, tu correo (si decides darlo), los números que apartas y la foto del comprobante de pago
              que envíes.
            </p>
          </section>

          <section className="space-y-1">
            <h2 className="font-semibold">Para qué los usamos</h2>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>Registrar tu reserva y verificar tu pago.</li>
              <li>Contactarte por WhatsApp, llamada o correo sobre tu reserva, tus pagos y el resultado del sorteo.</li>
              <li>Saber a quién entregar el premio si tu número gana.</li>
            </ul>
            <p>No vendemos ni compartimos tus datos con terceros para publicidad.</p>
          </section>

          <section className="space-y-1">
            <h2 className="font-semibold">Cuánto tiempo los guardamos</h2>
            <p>
              Mientras la rifa esté activa y el tiempo necesario después para entregar el premio y atender reclamos. Si tu
              reserva se libera sin pago, tus datos se borran de esos números.
            </p>
          </section>

          <section className="space-y-1">
            <h2 className="font-semibold">Tus derechos</h2>
            <p>
              Según la Ley 1581 de 2012 puedes conocer, actualizar, rectificar y pedir que se borren tus datos, revocar tu
              autorización y presentar quejas ante la Superintendencia de Industria y Comercio. Para hacerlo, escribe al
              responsable{contact ? ` (${contact})` : ""}.
            </p>
          </section>

          <section className="space-y-1">
            <h2 className="font-semibold">Tu autorización</h2>
            <p>
              Al marcar «Acepto el aviso de privacidad» cuando reservas, autorizas el uso de tus datos para estos fines.
              Guardamos la fecha en que lo aceptaste.
            </p>
          </section>

          <Link href={`/p/${token}`} className="inline-block font-semibold text-gold-400 underline-offset-2 hover:underline">
            Volver a la rifa
          </Link>
        </article>
      </main>
    </div>
  );
}
