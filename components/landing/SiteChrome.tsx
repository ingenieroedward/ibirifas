import Link from "next/link";
import { CrownIcon } from "@/components/icons/Crown";

const NAV = [
  { href: "/#funciones", label: "Funciones" },
  { href: "/#modalidades", label: "Modalidades" },
  { href: "/#precios", label: "Precios" },
  { href: "/#preguntas", label: "Preguntas" },
  { href: "/ayuda", label: "Ayuda" },
  { href: "/terminos", label: "Términos" },
];

/** The public pages' top bar: brand, sections (on wider screens) and "Ingresar". */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/80 px-4 pt-safe backdrop-blur-md sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label="Ibirifas, inicio">
          <CrownIcon className="h-6 w-9 text-gold-400" />
          <span className="font-[family-name:var(--font-heading)] text-xl font-bold text-gold-400">Ibirifas</span>
        </Link>
        <nav aria-label="Secciones" className="hidden items-center gap-6 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-sm font-medium text-text-muted transition hover:text-gold-400">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/login"
          className="rounded-full border border-gold-600/50 px-4 py-2 text-sm font-semibold text-gold-400 transition hover:bg-gold-400/10 active:scale-95"
        >
          Ingresar
        </Link>
      </div>
    </header>
  );
}

/** The public pages' footer: what Ibirifas is (and isn't), the terms and the way in. */
export function SiteFooter() {
  return (
    <footer className="border-t border-line px-4 pb-safe sm:px-6">
      <div className="mx-auto grid w-full max-w-6xl gap-8 py-10 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Link href="/" className="flex items-center gap-2">
            <CrownIcon className="h-5 w-8 text-gold-400" />
            <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-gold-400">Ibirifas</span>
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-muted">
            Herramienta para gestionar rifas desde el celular. Ibirifas no organiza, vende ni recibe el dinero de las rifas:
            cada rifa es responsabilidad de quien la organiza.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text">Producto</p>
          <ul className="mt-3 space-y-2 text-sm text-text-muted">
            <li><Link href="/#funciones" className="hover:text-gold-400">Funciones</Link></li>
            <li><Link href="/#modalidades" className="hover:text-gold-400">Modalidades</Link></li>
            <li><Link href="/#precios" className="hover:text-gold-400">Precios</Link></li>
            <li><Link href="/ayuda" className="hover:text-gold-400">Ayuda: qué hace cada persona</Link></li>
            <li><Link href="/login" className="hover:text-gold-400">Ingresar</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text">Legal</p>
          <ul className="mt-3 space-y-2 text-sm text-text-muted">
            <li><Link href="/terminos" className="hover:text-gold-400">Términos y condiciones</Link></li>
            <li><Link href="/terminos#datos" className="hover:text-gold-400">Datos personales</Link></li>
            <li><Link href="/#preguntas" className="hover:text-gold-400">Preguntas frecuentes</Link></li>
          </ul>
        </div>
      </div>
      <p className="mx-auto w-full max-w-6xl border-t border-line/60 py-5 text-center text-xs text-text-muted">
        © {new Date().getFullYear()} Ibirifas · Hecho en Colombia
      </p>
    </footer>
  );
}
