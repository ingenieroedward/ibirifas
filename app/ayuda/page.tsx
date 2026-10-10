import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/landing/SiteChrome";
import { HelpGuide, type HelpRole } from "@/components/HelpGuide";

export const metadata: Metadata = {
  title: "Ayuda · Ibirifas",
  description: "Qué hace cada persona en Ibirifas: organizador, vendedor y comprador, paso a paso.",
};

const ROLES: HelpRole[] = ["organizador", "vendedor", "comprador", "administrador"];

/**
 * The public help page: a step-by-step guide per role. `?rol=vendedor` (organizador, comprador) opens that guide,
 * so an organizer can send each person the part that's theirs; signed in, it opens the viewer's own.
 */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const rol = (await searchParams).rol;
  const initial = typeof rol === "string" && (ROLES as string[]).includes(rol) ? (rol as HelpRole) : null;
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-bg text-text">
      <SiteHeader />
      <main className="flex-1 px-4 py-10 sm:px-6 md:py-14">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">Ayuda</p>
          <h1 className="mt-1 font-[family-name:var(--font-heading)] text-3xl font-extrabold sm:text-4xl">¿Qué hace cada persona?</h1>
          <p className="mt-3 max-w-2xl text-text-muted">Elige tu papel y sigue los pasos. Cada guía tiene un enlace para enviársela a tu equipo o a tus compradores.</p>
          <div className="mt-8">
            <HelpGuide initial={initial} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
