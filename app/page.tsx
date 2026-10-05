import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/authCookies";
import { activationPrice, billingWhatsapp } from "@/lib/billing";
import { formatCurrency } from "@/lib/format";
import { CrownIcon } from "@/components/icons/Crown";

export const metadata: Metadata = {
  title: "Ibirifas · Organiza tus rifas desde el celular",
  description: "Vende números, cobra por Bre-B, comparte el enlace y anuncia al ganador. Tu primera rifa es gratis.",
};

/**
 * The public home page (ibirifas.com): what Ibirifas is, what it does and what it costs, for people arriving from a
 * shared link or a search. Someone already signed in goes straight to their raffles.
 */
export default async function HomePage() {
  const jar = await cookies();
  if (jar.has(ACCESS_TOKEN_COOKIE) || jar.has(REFRESH_TOKEN_COOKIE)) redirect("/rifas");

  const whatsapp = billingWhatsapp();
  const ask = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hola, quiero usar Ibirifas para mi rifa 🎟️")}`
    : "/login";
  const small = formatCurrency(activationPrice(100));
  const large = formatCurrency(activationPrice(1000));

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-hidden bg-bg text-text">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[-12%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gold-400/15 blur-[120px]" />

      {/* Header */}
      <header className="relative z-10 px-4 pt-safe sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2">
            <CrownIcon className="h-6 w-9 text-gold-400" />
            <span className="font-[family-name:var(--font-heading)] text-xl font-bold text-gold-400">Ibirifas</span>
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-gold-600/50 px-4 py-2 text-sm font-semibold text-gold-400 transition active:scale-95"
          >
            Ingresar
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 pb-16 sm:px-6">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-5xl items-center gap-10 pt-6 md:grid-cols-2 md:pt-14">
          <div className="text-center md:text-left">
            <p className="inline-flex rounded-full border border-gold-600/40 bg-gold-400/10 px-3 py-1 text-xs font-semibold text-gold-400">
              Tu primera rifa es gratis
            </p>
            <h1 className="mt-4 font-[family-name:var(--font-heading)] text-4xl font-extrabold leading-tight sm:text-5xl">
              Organiza tus rifas <span className="text-gold-400">desde el celular</span>
            </h1>
            <p className="mt-4 text-base text-text-muted sm:text-lg">
              Vende números, cobra por Bre-B, comparte el enlace y anuncia al ganador. Sin cuadernos, sin capturas perdidas y
              sin enredos con los pagos.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row md:justify-start sm:justify-center">
              <a
                href={ask}
                target={whatsapp ? "_blank" : undefined}
                rel={whatsapp ? "noopener noreferrer" : undefined}
                className="flex h-14 items-center justify-center rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 px-7 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98]"
              >
                Quiero mi rifa
              </a>
              <Link
                href="/login"
                className="flex h-14 items-center justify-center rounded-2xl border border-line px-7 text-base font-semibold text-text transition active:scale-[0.98]"
              >
                Ya tengo cuenta
              </Link>
            </div>
          </div>

          <BoardMock />
        </section>

        {/* Features */}
        <section className="mx-auto mt-20 w-full max-w-5xl" aria-labelledby="features">
          <h2 id="features" className="text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold">
            Todo lo que tu rifa necesita
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-2xl border border-line bg-bg-elevated p-5 shadow-card">
                <p className="text-2xl" aria-hidden="true">
                  {f.icon}
                </p>
                <p className="mt-2 font-semibold text-text">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-text-muted">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Modalities */}
        <section className="mx-auto mt-20 w-full max-w-5xl" aria-labelledby="modes">
          <h2 id="modes" className="text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold">
            Rifas que se venden solas
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-text-muted">Elige la modalidad que más le guste a tu gente.</p>
          <ul className="mt-8 grid gap-4 md:grid-cols-3">
            {MODES.map((m) => (
              <li key={m.title} className="rounded-2xl border border-gold-600/40 bg-gradient-to-b from-gold-400/10 to-transparent p-5">
                <p className="font-[family-name:var(--font-heading)] text-xl font-extrabold text-gold-400">{m.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-text">{m.text}</p>
                <p className="mt-3 text-xs text-text-muted">{m.example}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section className="mx-auto mt-20 w-full max-w-5xl" aria-labelledby="how">
          <h2 id="how" className="text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold">
            Así de fácil
          </h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-2xl border border-line bg-bg-elevated p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 font-[family-name:var(--font-heading)] text-lg font-extrabold text-[#241a02]">
                  {i + 1}
                </span>
                <span>
                  <span className="block font-semibold text-text">{s.title}</span>
                  <span className="mt-1 block text-sm text-text-muted">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Pricing */}
        <section className="mx-auto mt-20 w-full max-w-5xl" aria-labelledby="pricing">
          <h2 id="pricing" className="text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold">
            Precios claros
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-text-muted">Un solo pago por rifa. No cobramos comisión de tus ventas.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <Price title="Primera rifa" price="Gratis" note="Hasta 100 números, con todo incluido, para que pruebes." highlight />
            <Price title="Hasta 100 números" price={small} note="Por rifa. Todo incluido." />
            <Price title="Hasta 1.000 números" price={large} note="Por rifa. Todo incluido." />
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto mt-20 w-full max-w-3xl" aria-labelledby="faq">
          <h2 id="faq" className="text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold">
            Preguntas frecuentes
          </h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((q) => (
              <details key={q.q} className="group rounded-2xl border border-line bg-bg-elevated p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-text">
                  {q.q}
                  <span aria-hidden="true" className="text-gold-400 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-text-muted">{q.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final call */}
        <section className="mx-auto mt-20 w-full max-w-3xl rounded-3xl border border-gold-600/40 bg-gradient-to-b from-gold-400/15 to-bg-elevated p-8 text-center">
          <CrownIcon className="mx-auto h-8 w-12 text-gold-400" />
          <h2 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-extrabold">¿Listo para tu próxima rifa?</h2>
          <p className="mt-2 text-text-muted">Escríbenos y en minutos tienes tu organización lista. La primera rifa va por nuestra cuenta.</p>
          <a
            href={ask}
            target={whatsapp ? "_blank" : undefined}
            rel={whatsapp ? "noopener noreferrer" : undefined}
            className="mx-auto mt-6 flex h-14 max-w-xs items-center justify-center rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 px-7 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98]"
          >
            Quiero mi rifa
          </a>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line px-4 py-6 pb-safe text-center text-xs text-text-muted sm:px-6">
        <p className="mx-auto max-w-2xl leading-relaxed">
          Ibirifas es una herramienta de gestión: no organiza, vende ni recibe el dinero de las rifas. Cada rifa es
          responsabilidad de quien la organiza.
        </p>
        <p className="mt-3 flex items-center justify-center gap-3">
          <Link href="/terminos" className="underline-offset-2 hover:underline">
            Términos de uso
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/login" className="underline-offset-2 hover:underline">
            Ingresar
          </Link>
          <span aria-hidden="true">·</span>
          <span>© {new Date().getFullYear()} Ibirifas</span>
        </p>
      </footer>
    </div>
  );
}

function Price({ title, price, note, highlight = false }: { title: string; price: string; note: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 text-center ${highlight ? "border-gold-600/60 bg-gold-400/10" : "border-line bg-bg-elevated"}`}>
      <p className="text-sm font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      <p className="mt-2 font-[family-name:var(--font-heading)] text-4xl font-extrabold text-gold-400">{price}</p>
      <p className="mt-2 text-sm text-text-muted">{note}</p>
    </div>
  );
}

/** A little board, like the app's: free numbers in gold, sold ones dark, the winner marked. */
function BoardMock() {
  const sold = new Set([3, 7, 8, 12, 15, 21, 22, 26, 30, 33, 34]);
  const winner = 21;
  return (
    <div className="mx-auto w-full max-w-sm rounded-3xl border border-gold-600/30 bg-bg-elevated p-5 shadow-card" aria-hidden="true">
      <div className="flex items-center justify-between">
        <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-text">Rifa Navideña</span>
        <span className="rounded-full bg-gold-400/15 px-2.5 py-1 text-[11px] font-bold text-gold-400">EN VIVO</span>
      </div>
      <div className="mt-3 flex divide-x divide-line rounded-xl border border-line">
        <div className="flex-1 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Premio</p>
          <p className="font-[family-name:var(--font-heading)] font-extrabold text-gold-400">$1.000.000</p>
        </div>
        <div className="flex-1 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">Número</p>
          <p className="font-[family-name:var(--font-heading)] font-extrabold text-gold-400">$10.000</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-6 gap-2">
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className={`relative flex aspect-square items-center justify-center rounded-lg text-xs font-extrabold ${
              i === winner
                ? "bg-green-500 text-white ring-2 ring-gold-400"
                : sold.has(i)
                  ? "border border-line bg-surface-2 text-text-muted line-through"
                  : "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]"
            }`}
          >
            {String(i).padStart(2, "0")}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-xl bg-green-500/10 px-3 py-2 text-xs text-green-300">
        <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
        Pago de Ana confirmado por Bre-B · número 21
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: "🎟️", title: "Tablero en vivo", text: "Todo tu equipo vende desde su celular y ve al instante qué números quedan, sin pisarse." },
  { icon: "🔗", title: "Enlace para compartir", text: "Tus compradores ven los números libres y reservan solos, con su nombre y teléfono." },
  { icon: "💸", title: "Pagos Bre-B que se confirman solos", text: "Cuando llega el aviso de tu banco, la reserva queda pagada sin que revises capturas." },
  { icon: "🖼️", title: "Imagen para tus estados", text: "Una imagen lista con los números disponibles y tus colores, para WhatsApp e Instagram." },
  { icon: "🏆", title: "Anuncia al ganador", text: "Avísale por WhatsApp, envía correos con el resultado y comparte la imagen del ganador." },
  { icon: "👥", title: "Tu equipo de vendedores", text: "Cada vendedor con su código; tú ves cuánto vendió cada uno y quién falta por pagar." },
];

const MODES = [
  { title: "Normal", text: "El número que coincida con la lotería se lleva el premio.", example: "Ej. 100 números, juega con la Sinuano noche." },
  {
    title: "Gana Más",
    text: "Con el mismo resultado ganan más personas: al revés, primeras cifras y vecinos.",
    example: "Sale 3847: gana el 47, el 74, el 38, el 46 y el 48.",
  },
  {
    title: "Por etapas",
    text: "Un mismo número juega varios sorteos y se paga por cuotas. Ideal para premios grandes.",
    example: "3 sorteos: $500.000, $500.000 y la gran final.",
  },
];

const STEPS = [
  { title: "Crea tu rifa", text: "Premio, valor, lotería, fecha y hora. En un par de minutos." },
  { title: "Compártela", text: "Envía el enlace o la imagen por WhatsApp y deja que reserven." },
  { title: "Cobra y anuncia", text: "Los pagos se cruzan solos y, al final, el ganador se anuncia con un toque." },
];

const FAQ = [
  {
    q: "¿Cómo me pagan mis compradores?",
    a: "Directo a tus cuentas: Nequi, Bancolombia, llave Bre-B… Ibirifas nunca recibe el dinero. Si conectas los avisos de tu banco, los pagos Bre-B se confirman solos.",
  },
  {
    q: "¿Cobran comisión sobre mis ventas?",
    a: "No. Pagas una tarifa fija por rifa según su tamaño, y la primera rifa de hasta 100 números es gratis.",
  },
  {
    q: "¿Necesito instalar algo?",
    a: "No. Funciona desde el navegador del celular y, si quieres, la puedes instalar como app en tu pantalla de inicio.",
  },
  {
    q: "¿Necesito permiso para hacer una rifa?",
    a: "Según su tamaño, las rifas pueden requerir permiso de la alcaldía, la gobernación o Coljuegos. Cada organizador es responsable de su rifa; si tienes permiso, lo puedes mostrar en la página y la imagen de la rifa.",
  },
  {
    q: "¿Cómo se escoge al ganador?",
    a: "Con el resultado oficial de la lotería que elijas. Tú lo escribes y la app dice al instante quién ganó, para que todo sea transparente.",
  },
];
