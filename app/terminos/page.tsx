import type { Metadata } from "next";
import Link from "next/link";
import { CrownIcon } from "@/components/icons/Crown";
import { TermsContent } from "@/components/TermsContent";

export const metadata: Metadata = {
  title: "Términos de uso · Ibirifas",
  description: "Ibirifas es una herramienta de gestión; cada organizador responde por sus rifas.",
};

/** The platform's terms of use: public, linked from the login, the public raffle pages and the acceptance screen. */
export default function TermsPage() {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-bg pb-12">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-safe">
        <div className="flex items-center justify-center gap-2 py-5">
          <CrownIcon className="h-5 w-8 text-gold-400" />
          <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-gold-400">Ibirifas</span>
        </div>
        <article className="space-y-4 rounded-2xl border border-line bg-bg-elevated p-5 shadow-card">
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-text">Términos de uso</h1>
          <TermsContent />
          <Link href="/" className="inline-block text-sm font-semibold text-gold-400 underline-offset-2 hover:underline">
            Ir a Ibirifas
          </Link>
        </article>
      </main>
    </div>
  );
}
