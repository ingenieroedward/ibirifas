import type { Metadata } from "next";
import Link from "next/link";
import { TERMS_SECTIONS, TermsContent } from "@/components/TermsContent";
import { SiteFooter, SiteHeader } from "@/components/landing/SiteChrome";
import { DocumentIcon } from "@/components/icons/LineIcons";

export const metadata: Metadata = {
  title: "Términos y condiciones · Ibirifas",
  description: "Ibirifas es una herramienta de gestión; cada organizador responde por sus rifas.",
};

/** The platform's terms and conditions: public, linked from the home page, the login and every raffle's page. */
export default function TermsPage() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-bg text-text">
      <SiteHeader />
      <main className="flex-1 px-4 py-10 sm:px-6 md:py-16">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold-600/30 bg-gold-400/10 text-gold-400">
              <DocumentIcon className="h-7 w-7" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">Legal</p>
              <h1 className="font-[family-name:var(--font-heading)] text-3xl font-extrabold sm:text-4xl">Términos y condiciones</h1>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-text-muted">
            En resumen: Ibirifas es la herramienta con la que cada organizador gestiona sus rifas, y cada organizador responde por
            las suyas.
          </p>

          <div className="mt-10 grid gap-8 md:grid-cols-[220px_1fr]">
            <nav aria-label="Contenido" className="md:sticky md:top-24 md:self-start">
              <p className="text-xs font-semibold uppercase tracking-wider text-text">Contenido</p>
              <ol className="mt-3 space-y-2 text-sm">
                {TERMS_SECTIONS.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-text-muted transition hover:text-gold-400">
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <article className="rounded-3xl border border-line bg-bg-elevated p-6 shadow-card sm:p-8 [&_h2]:text-lg [&_h2]:text-gold-400 [&_section]:border-b [&_section]:border-line/60 [&_section]:pb-5 [&_section:last-of-type]:border-0">
              <TermsContent />
            </article>
          </div>

          <div className="mt-10 text-center">
            <Link href="/" className="text-sm font-semibold text-gold-400 underline-offset-4 hover:underline">
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
