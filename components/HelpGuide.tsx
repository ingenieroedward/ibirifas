"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { CopyButton } from "@/components/CopyButton";
import { CheckIcon, PhoneIcon, ShieldIcon, TrophyIcon, UsersIcon } from "@/components/icons/LineIcons";

export type HelpRole = "organizador" | "vendedor" | "comprador" | "administrador";

interface Section {
  title: string;
  steps: React.ReactNode[];
  note?: React.ReactNode;
}

interface Guide {
  label: string;
  icon: (p: { className?: string }) => React.ReactNode;
  intro: string;
  sections: Section[];
}

const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold text-text">{children}</b>;

const GUIDES: Record<HelpRole, Guide> = {
  organizador: {
    label: "Organizador",
    icon: TrophyIcon,
    intro: "Creas las rifas, armas tu equipo de vendedores, cobras y anuncias al ganador.",
    sections: [
      {
        title: "La primera vez",
        steps: [
          <>Entra a <B>ibirifas.com</B> → <B>Ingresar</B> con tu código de organización y tu código de 6 dígitos, y acepta los términos.</>,
          <>Instala la app en tu celular (el navegador te ofrece <B>Instalar</B> o <B>Agregar a inicio</B>) y activa la <B>campana</B> para recibir avisos.</>,
          <><B>Menú → Mi equipo → Nuevo vendedor</B>: crea a cada vendedor con su nombre y un código. Pásales tu código de organización y su código.</>,
          <><B>Menú → Pagos → Conectar mi cuenta</B> (recomendado): escribe el Gmail donde tu banco te avisa los pagos y sigue los pasos de reenvío. Así los pagos por Bre-B se aprueban solos.</>,
        ],
      },
      {
        title: "En cada rifa",
        steps: [
          <><B>Crear rifa</B>: cuántos números, valor del número, premio, lotería, fecha y hora del sorteo y las cuentas donde te pagan. Si quieres, agrega <B>combos</B> (por ejemplo 2 números por $4.000) o premios <B>Gana Más</B>.</>,
          <><B>Activar</B>: tu primera rifa de hasta 100 números es gratis. Después compras un paquete de rifas: transfieres a la llave Bre-B que aparece y subes el comprobante.</>,
          <><B>Compartir</B>: copia el enlace de la rifa y descarga la imagen para tus estados y grupos de WhatsApp. Ahí la gente aparta sus números sola.</>,
          <>Vende desde el tablero (o deja que vendan tus vendedores). Los pagos que no se cruzan solos los revisas en <B>Menú → Pagos</B>; también puedes aprobar comprobantes desde cada número.</>,
          <>El día del sorteo, a la hora que pusiste, se cierran las reservas en línea. Toca <B>Cerrar</B>, escribe el número ganador y usa <B>Avisar por WhatsApp</B> e <B>Imagen para el estado</B>.</>,
        ],
        note: <>¿Borraste una rifa por error? Queda 30 días en <B>Menú → Papelera</B> y la puedes restaurar.</>,
      },
    ],
  },
  vendedor: {
    label: "Vendedor",
    icon: UsersIcon,
    intro: "Vendes números desde tu celular y todo el equipo lo ve al instante.",
    sections: [
      {
        title: "La primera vez",
        steps: [
          <>Entra a <B>ibirifas.com</B> → <B>Ingresar</B> con el código de organización que te dio el organizador y <B>tu</B> código de 6 dígitos.</>,
          <>Instala la app y activa la <B>campana</B> para enterarte de pagos y reservas.</>,
        ],
      },
      {
        title: "Para vender",
        steps: [
          <>Toca un número libre → escribe el <B>nombre</B> y el <B>teléfono</B> del comprador → <B>Guardar</B>. Para varios números a la vez, mantén presionado uno y ve marcando los demás.</>,
          <>Cuando te paguen, abre el número y márcalo <B>Pagado</B> (con el medio de pago). Si la rifa tiene combos, el precio del combo se aplica solo al vender varios juntos.</>,
          <>¿Te deben? Usa <B>Cobrar por WhatsApp</B>: arma el mensaje con los números, el total y las cuentas de pago.</>,
          <>En <B>Participantes → Mis ventas</B> ves cuánto vendiste, cuánto está cobrado y cuánto falta.</>,
        ],
        note: <>Activar rifas, configurar pagos y cerrar la rifa lo hace el organizador.</>,
      },
    ],
  },
  comprador: {
    label: "Comprador",
    icon: PhoneIcon,
    intro: "Apartas tus números desde el enlace que te compartieron, sin instalar nada.",
    sections: [
      {
        title: "Para comprar",
        steps: [
          <>Abre el <B>enlace</B> de la rifa que te compartieron por WhatsApp.</>,
          <>Elige tus números (los dorados ya están vendidos) y toca <B>Reservar</B>. Escribe tu nombre y teléfono; el correo es opcional, pero te avisa cada paso.</>,
          <>Paga el total a una de las cuentas que muestra la página (Bre-B, Nequi u otra que indique el organizador).</>,
          <><B>Sube la foto del comprobante</B> o escribe a nombre de quién salió el pago. Cuando el organizador lo confirme, tus números quedan pagados.</>,
          <>Con el mismo enlace puedes ver tu reserva cuando quieras. El día del sorteo verás el número ganador ahí mismo.</>,
        ],
        note: <>Si no pagas a tiempo, la reserva puede liberarse para que otra persona compre ese número.</>,
      },
    ],
  },
  administrador: {
    label: "Administrador",
    icon: ShieldIcon,
    intro: "Das acceso a los organizadores y cobras los paquetes de rifas.",
    sections: [
      {
        title: "Una sola vez",
        steps: [
          <><B>Menú → Cobros</B>: escribe tu llave Bre-B y tu nombre para recibir el pago de los paquetes.</>,
          <><B>Organizadores</B>: abre tu organización y marca <B>Sin cobro</B> (y las de amigos que no cobres).</>,
          <>En pagoradar, el webhook debe apuntar a <B>https://ibirifas.com/api/pagoradar/webhook</B>.</>,
        ],
      },
      {
        title: "Por cada cliente nuevo",
        steps: [
          <><B>Organizadores → Nuevo organizador</B>: nombre, código de organización (ej. rifas-norte) y código de 6 dígitos.</>,
          <>Envíale el enlace <B>ibirifas.com</B>, su código de organización, su código y esta guía (pestaña Organizador).</>,
        ],
      },
      {
        title: "Día a día",
        steps: [
          <>Cuando llegue un comprobante de paquete: <B>Cobros</B> → revisa en tu banco que la plata llegó → <B>Aprobar</B> o <B>Rechazar</B> con el motivo.</>,
          <>Si te pagan en efectivo: <B>Organizadores → editar → Rifas de saldo → +3 o +10</B>.</>,
          <>En <B>Menú → Actividad</B> ves las rifas eliminadas, restauradas y los paquetes comprados de todas las organizaciones.</>,
        ],
      },
    ],
  },
};

const PUBLIC_ROLES: HelpRole[] = ["organizador", "vendedor", "comprador"];

/** The step-by-step guide for each kind of person, with a tab per role and a link to share each one. */
export function HelpGuide({ initial }: { initial: HelpRole | null }) {
  const { user } = useAuth();
  const [picked, setPicked] = useState<HelpRole | null>(null);
  const roles: HelpRole[] = user?.role === "SUPERADMIN" ? ["administrador", ...PUBLIC_ROLES] : PUBLIC_ROLES;
  const fromAccount: HelpRole | null =
    user?.role === "SUPERADMIN" ? "administrador" : user?.role === "SELLER" ? "vendedor" : user?.role === "ORGANIZER" ? "organizador" : null;
  const wanted = picked ?? initial ?? fromAccount ?? "organizador";
  const role = roles.includes(wanted) ? wanted : "organizador";
  const guide = GUIDES[role];
  const Icon = guide.icon;
  const shareUrl = `https://ibirifas.com/ayuda?rol=${role}`;

  return (
    <div>
      <div role="tablist" aria-label="¿Quién eres?" className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-bg-elevated p-1">
        {roles.map((r) => (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={r === role}
            onClick={() => setPicked(r)}
            className={`h-11 flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition ${
              r === role ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02]" : "text-text-muted hover:text-text"
            }`}
          >
            {GUIDES[r].label}
          </button>
        ))}
      </div>

      <section role="tabpanel" aria-label={guide.label} className="mt-6 space-y-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-gold-600/30 bg-gold-400/10 text-gold-400">
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-[family-name:var(--font-heading)] text-2xl font-extrabold">Si eres {guide.label.toLowerCase()}</h2>
            <p className="mt-1 text-text-muted">{guide.intro}</p>
          </div>
        </div>

        {guide.sections.map((s) => (
          <div key={s.title} className="rounded-3xl border border-line bg-bg-elevated p-5 shadow-card sm:p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gold-400">{s.title}</h3>
            <ol className="mt-4 space-y-4">
              {s.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-sm font-bold text-gold-400">{i + 1}</span>
                  <p className="pt-0.5 text-sm leading-relaxed text-text-muted sm:text-base">{step}</p>
                </li>
              ))}
            </ol>
            {s.note && (
              <p className="mt-4 flex gap-2 rounded-2xl bg-surface-2/60 p-3 text-sm text-text-muted">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
                <span>{s.note}</span>
              </p>
            )}
          </div>
        ))}

        {role !== "administrador" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-gold-600/40 p-4">
            <p className="text-sm text-text-muted">Envía esta guía a quien la necesite:</p>
            <span className="flex items-center gap-2">
              <code className="hidden rounded-lg bg-surface-2 px-2 py-1 text-xs text-text sm:inline">{shareUrl.replace("https://", "")}</code>
              <CopyButton text={shareUrl} label={`el enlace de la guía para ${guide.label.toLowerCase()}`} />
            </span>
          </div>
        )}

        {!user && (
          <p className="text-center text-sm text-text-muted">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-semibold text-gold-400 underline-offset-2 hover:underline">
              Ingresar
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
