import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/lib/authCookies";
import { activationPrice, billingWhatsapp } from "@/lib/billing";
import { formatCurrency } from "@/lib/format";
import { CrownIcon } from "@/components/icons/Crown";
import { SiteFooter, SiteHeader } from "@/components/landing/SiteChrome";
import {
  ArrowRightIcon,
  BoltIcon,
  CheckIcon,
  ChevronDownIcon,
  DocumentIcon,
  GridIcon,
  ImageIcon,
  LinkIcon,
  PercentOffIcon,
  PhoneIcon,
  ShieldIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons/LineIcons";

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
  const ask = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent("Hola, quiero usar Ibirifas para mi rifa.")}` : "/login";
  const external: Record<string, string> = whatsapp ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const small = formatCurrency(activationPrice(100));
  const large = formatCurrency(activationPrice(1000));

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col bg-bg text-text">
      <SiteHeader />

      <main className="flex-1 overflow-hidden">
        {/* Hero */}
        <section className="relative px-4 sm:px-6">
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[-20%] h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-gold-400/15 blur-[130px]" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--color-gold-400)_1px,transparent_1px),linear-gradient(90deg,var(--color-gold-400)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]"
          />
          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 py-12 md:grid-cols-[1.1fr_1fr] md:py-20">
            <div className="text-center md:text-left">
              <p className="inline-flex items-center gap-2 rounded-full border border-gold-600/40 bg-gold-400/10 px-3 py-1 text-xs font-semibold text-gold-400">
                <span className="h-1.5 w-1.5 rounded-full bg-gold-400" />
                Tu primera rifa es gratis
              </p>
              <h1 className="mt-5 font-[family-name:var(--font-heading)] text-4xl font-extrabold leading-[1.05] sm:text-6xl">
                Organiza tus rifas <span className="bg-gradient-to-r from-gold-300 to-gold-500 bg-clip-text text-transparent">desde el celular</span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg md:mx-0">
                Vende números con tu equipo, cobra por Bre-B y anuncia al ganador. Sin cuadernos, sin capturas perdidas y sin
                enredos con los pagos.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
                <a
                  href={ask}
                  {...external}
                  className="group flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 px-7 text-base font-bold text-[#241a02] shadow-gold transition hover:brightness-105 active:scale-[0.98]"
                >
                  Quiero mi rifa
                  <ArrowRightIcon className="h-5 w-5 transition group-hover:translate-x-0.5" />
                </a>
                <Link
                  href="/login"
                  className="flex h-14 items-center justify-center rounded-2xl border border-line bg-bg-elevated/60 px-7 text-base font-semibold text-text transition hover:border-gold-600/50 active:scale-[0.98]"
                >
                  Ya tengo cuenta
                </Link>
              </div>
              <ul className="mt-8 grid grid-cols-3 gap-3 text-left sm:max-w-lg md:max-w-none">
                <Trust icon={<PercentOffIcon className="h-5 w-5" />} title="Sin comisión" text="de tus ventas" />
                <Trust icon={<BoltIcon className="h-5 w-5" />} title="Pagos Bre-B" text="que se confirman solos" />
                <Trust icon={<PhoneIcon className="h-5 w-5" />} title="Desde el celular" text="sin instalar nada" />
              </ul>
            </div>

            <HeroDevice />
          </div>
        </section>

        {/* Features */}
        <section id="funciones" className="scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <SectionTitle eyebrow="Funciones" title="Todo lo que tu rifa necesita" text="Desde el primer número vendido hasta el anuncio del ganador." />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li
                  key={f.title}
                  className="group rounded-2xl border border-line bg-bg-elevated p-6 shadow-card transition hover:-translate-y-0.5 hover:border-gold-600/40"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-gold-600/30 bg-gradient-to-b from-gold-400/20 to-gold-400/5 text-gold-400">
                    {f.icon}
                  </span>
                  <p className="mt-4 text-lg font-semibold text-text">{f.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Modalities */}
        <section id="modalidades" className="scroll-mt-20 border-y border-line/60 bg-bg-elevated/40 px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <SectionTitle eyebrow="Modalidades" title="Rifas que se venden solas" text="Elige la que más le guste a tu gente. Todas se deciden con la lotería oficial." />
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              <ModeCard title="Normal" text="El número que coincida con la lotería se lleva el premio. Simple y de confianza." example="100 números · juega con la Sinuano noche">
                <div className="flex justify-center">
                  <Ball value="47" big />
                </div>
              </ModeCard>
              <ModeCard
                title="Gana Más"
                text="Con el mismo resultado ganan más personas: al revés, primeras cifras y vecinos."
                example="Sale 3847: ganan el 47, 74, 38, 46 y 48"
                featured
              >
                <div className="flex items-end justify-center gap-2">
                  <Ball value="46" label="Vecino" />
                  <Ball value="47" label="Mayor" big />
                  <Ball value="48" label="Vecino" />
                  <Ball value="74" label="Al revés" />
                </div>
              </ModeCard>
              <ModeCard title="Por etapas" text="Un mismo número juega varios sorteos y se paga por cuotas. Ideal para premios grandes." example="3 sorteos con el mismo número">
                <ol className="flex items-center justify-center gap-2 text-xs font-semibold">
                  {["Etapa 1", "Etapa 2", "Final"].map((s, i) => (
                    <li key={s} className="flex items-center gap-2">
                      <span className={`rounded-full px-3 py-1.5 ${i === 2 ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]" : "border border-gold-600/40 text-gold-400"}`}>{s}</span>
                      {i < 2 && <span className="h-px w-4 bg-gold-600/50" />}
                    </li>
                  ))}
                </ol>
              </ModeCard>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <SectionTitle eyebrow="Cómo funciona" title="Así de fácil" />
            <ol className="relative mt-12 grid gap-6 md:grid-cols-3">
              <span aria-hidden="true" className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-gold-600/50 to-transparent md:block" />
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative text-center">
                  <span className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 font-[family-name:var(--font-heading)] text-xl font-extrabold text-[#241a02] shadow-gold">
                    {i + 1}
                  </span>
                  <p className="mt-4 text-lg font-semibold text-text">{s.title}</p>
                  <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-text-muted">{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Pricing */}
        <section id="precios" className="scroll-mt-20 border-y border-line/60 bg-bg-elevated/40 px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto w-full max-w-6xl">
            <SectionTitle eyebrow="Precios" title="Un solo pago por rifa" text="Sin mensualidades y sin comisión sobre lo que vendes." />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              <Price title="Primera rifa" price="Gratis" note="Hasta 100 números" featured cta={{ href: ask, label: "Empezar gratis", external }} />
              <Price title="Hasta 100 números" price={small} note="Por rifa" cta={{ href: ask, label: "Pedir mi rifa", external }} />
              <Price title="Hasta 1.000 números" price={large} note="Por rifa" cta={{ href: ask, label: "Pedir mi rifa", external }} />
            </div>
            <p className="mt-6 text-center text-sm text-text-muted">Todas incluyen todo: tablero, enlace con reservas, pagos Bre-B, imagen para compartir, equipo y avisos al ganador.</p>
          </div>
        </section>

        {/* Terms summary */}
        <section id="transparencia" className="scroll-mt-20 px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 rounded-3xl border border-line bg-bg-elevated p-6 shadow-card md:grid-cols-[auto_1fr_auto] md:p-10">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gold-600/30 bg-gold-400/10 text-gold-400">
              <ShieldIcon className="h-8 w-8" />
            </span>
            <div>
              <h2 className="font-[family-name:var(--font-heading)] text-2xl font-extrabold">Transparencia y responsabilidad</h2>
              <ul className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
                {TERMS_SUMMARY.map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/terminos"
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-gold-600/50 px-5 text-sm font-semibold text-gold-400 transition hover:bg-gold-400/10"
            >
              <DocumentIcon className="h-5 w-5" />
              Términos y condiciones
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section id="preguntas" className="scroll-mt-20 px-4 pb-16 sm:px-6 md:pb-24">
          <div className="mx-auto w-full max-w-3xl">
            <SectionTitle eyebrow="Preguntas" title="Preguntas frecuentes" />
            <div className="mt-10 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-bg-elevated">
              {FAQ.map((q) => (
                <details key={q.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold text-text transition hover:text-gold-400 [&::-webkit-details-marker]:hidden">
                    {q.q}
                    <ChevronDownIcon className="h-5 w-5 shrink-0 text-gold-400 transition group-open:rotate-180" />
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-text-muted">{q.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-gold-600/40 bg-gradient-to-b from-gold-400/15 to-bg-elevated px-6 py-12 text-center">
            <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-gold-400/20 blur-[90px]" />
            <CrownIcon className="relative mx-auto h-9 w-14 text-gold-400" />
            <h2 className="relative mt-4 font-[family-name:var(--font-heading)] text-3xl font-extrabold sm:text-4xl">¿Listo para tu próxima rifa?</h2>
            <p className="relative mx-auto mt-3 max-w-lg text-text-muted">Escríbenos y en minutos tienes tu organización lista. La primera rifa va por nuestra cuenta.</p>
            <a
              href={ask}
              {...external}
              className="relative mx-auto mt-8 flex h-14 max-w-xs items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 px-7 text-base font-bold text-[#241a02] shadow-gold transition hover:brightness-105 active:scale-[0.98]"
            >
              Quiero mi rifa
              <ArrowRightIcon className="h-5 w-5" />
            </a>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function SectionTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">{eyebrow}</p>
      <h2 className="mt-3 font-[family-name:var(--font-heading)] text-3xl font-extrabold sm:text-4xl">{title}</h2>
      {text && <p className="mt-3 text-text-muted">{text}</p>}
    </div>
  );
}

function Trust({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="rounded-xl border border-line bg-bg-elevated/60 p-3">
      <span className="text-gold-400">{icon}</span>
      <p className="mt-2 text-xs font-semibold text-text sm:text-sm">{title}</p>
      <p className="text-[11px] leading-snug text-text-muted sm:text-xs">{text}</p>
    </li>
  );
}

function Ball({ value, label, big = false }: { value: string; label?: string; big?: boolean }) {
  return (
    <span className="flex flex-col items-center gap-1.5">
      <span
        className={`flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--color-gold-300),var(--color-gold-500)_70%)] font-[family-name:var(--font-heading)] font-extrabold text-[#241a02] shadow-gold ${
          big ? "h-16 w-16 text-2xl" : "h-11 w-11 text-base"
        }`}
      >
        {value}
      </span>
      {label && <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">{label}</span>}
    </span>
  );
}

function ModeCard({ title, text, example, featured = false, children }: { title: string; text: string; example: string; featured?: boolean; children: React.ReactNode }) {
  return (
    <div className={`relative flex flex-col rounded-3xl border p-6 ${featured ? "border-gold-600/60 bg-gradient-to-b from-gold-400/15 to-bg-elevated" : "border-line bg-bg-elevated"}`}>
      {featured && <span className="absolute right-5 top-5 rounded-full bg-gold-400 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#241a02]">Nuevo</span>}
      <div className="flex h-28 items-center justify-center rounded-2xl border border-line/70 bg-bg/60">{children}</div>
      <p className="mt-5 font-[family-name:var(--font-heading)] text-2xl font-extrabold text-gold-400">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-text">{text}</p>
      <p className="mt-auto pt-4 text-xs text-text-muted">{example}</p>
    </div>
  );
}

function Price({
  title,
  price,
  note,
  featured = false,
  cta,
}: {
  title: string;
  price: string;
  note: string;
  featured?: boolean;
  cta: { href: string; label: string; external: Record<string, string> };
}) {
  return (
    <div className={`flex flex-col rounded-3xl border p-7 ${featured ? "border-gold-600/60 bg-gradient-to-b from-gold-400/15 to-bg-elevated shadow-gold" : "border-line bg-bg-elevated"}`}>
      <p className="text-sm font-semibold text-text-muted">{title}</p>
      <p className="mt-3 font-[family-name:var(--font-heading)] text-5xl font-extrabold text-gold-400">{price}</p>
      <p className="mt-1 text-sm text-text-muted">{note}</p>
      <ul className="mt-6 space-y-2 text-sm text-text">
        {["Todas las funciones", "Equipo de vendedores", "Pagos Bre-B automáticos"].map((f) => (
          <li key={f} className="flex items-center gap-2">
            <CheckIcon className="h-4 w-4 shrink-0 text-gold-400" />
            {f}
          </li>
        ))}
      </ul>
      <a
        href={cta.href}
        {...cta.external}
        className={`mt-7 flex h-12 items-center justify-center rounded-2xl text-sm font-bold transition active:scale-[0.98] ${
          featured ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02] shadow-gold" : "border border-gold-600/50 text-gold-400 hover:bg-gold-400/10"
        }`}
      >
        {cta.label}
      </a>
    </div>
  );
}

/** A phone with the app's board inside, and two notices floating around it. */
function HeroDevice() {
  const sold = new Set([3, 7, 8, 12, 15, 22, 26, 30, 33, 34]);
  const winner = 21;
  return (
    <div className="relative mx-auto w-full max-w-[340px]" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[3rem] bg-gold-400/10 blur-2xl" />
      <div className="relative rounded-[2.6rem] border border-gold-600/40 bg-[#07070a] p-2.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        <div className="rounded-[2.1rem] bg-bg p-4">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-line" />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <CrownIcon className="h-3.5 w-5 text-gold-400" />
              <span className="font-[family-name:var(--font-heading)] text-sm font-bold text-gold-400">Ibirifas</span>
            </span>
            <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> EN VIVO
            </span>
          </div>
          <p className="mt-3 font-[family-name:var(--font-heading)] text-lg font-bold text-text">Rifa Navideña</p>
          <div className="mt-2 flex divide-x divide-line rounded-xl border border-line">
            <div className="flex-1 px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">Premio</p>
              <p className="font-[family-name:var(--font-heading)] text-sm font-extrabold text-gold-400">$1.000.000</p>
            </div>
            <div className="flex-1 px-3 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-text-muted">Número</p>
              <p className="font-[family-name:var(--font-heading)] text-sm font-extrabold text-gold-400">$10.000</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {Array.from({ length: 36 }, (_, i) => (
              <span
                key={i}
                className={`flex aspect-square items-center justify-center rounded-md text-[10px] font-extrabold ${
                  i === winner
                    ? "bg-green-500 text-white ring-2 ring-gold-400"
                    : sold.has(i)
                      ? "border border-line bg-surface-2 text-text-muted/60"
                      : "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]"
                }`}
              >
                {String(i).padStart(2, "0")}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -left-8 top-44 hidden w-48 rounded-2xl border border-line bg-bg-elevated/95 p-3 shadow-card backdrop-blur sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-green-400">Pago confirmado</p>
        <p className="mt-0.5 text-xs text-text">Ana P. · número 21 · Bre-B</p>
      </div>
      <div className="absolute -right-6 bottom-16 hidden w-44 rounded-2xl border border-line bg-bg-elevated/95 p-3 shadow-card backdrop-blur sm:block">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-400">Reserva nueva</p>
        <p className="mt-0.5 text-xs text-text">Luis G. apartó el 07</p>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: <GridIcon />, title: "Tablero en vivo", text: "Todo tu equipo vende desde su celular y ve al instante qué números quedan, sin pisarse." },
  { icon: <LinkIcon />, title: "Enlace con reservas", text: "Tus compradores ven los números libres y reservan solos, con su nombre y teléfono." },
  { icon: <BoltIcon />, title: "Pagos Bre-B automáticos", text: "Cuando llega el aviso de tu banco, la reserva queda pagada sin revisar capturas." },
  { icon: <ImageIcon />, title: "Imagen para tus estados", text: "Una imagen lista con los números disponibles y tus colores, para WhatsApp e Instagram." },
  { icon: <TrophyIcon />, title: "Anuncia al ganador", text: "Avísale por WhatsApp, envía el resultado por correo y comparte la imagen del ganador." },
  { icon: <UsersIcon />, title: "Equipo de vendedores", text: "Cada vendedor con su código; ves cuánto vendió cada uno y quién falta por pagar." },
];

const STEPS = [
  { title: "Crea tu rifa", text: "Premio, valor, lotería, fecha y hora del sorteo. En un par de minutos." },
  { title: "Compártela", text: "Envía el enlace o la imagen por WhatsApp y deja que tus compradores reserven." },
  { title: "Cobra y anuncia", text: "Los pagos se cruzan solos y, al final, anuncias al ganador con un toque." },
];

const TERMS_SUMMARY = [
  "Ibirifas es una herramienta: no organiza, vende ni recibe el dinero de las rifas.",
  "Cada organizador responde por su rifa, su premio y sus permisos.",
  "Los compradores pagan directo a las cuentas del organizador.",
  "Los datos de los compradores solo se usan para gestionar la rifa.",
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
