"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { CopyButton } from "@/components/CopyButton";
import { groupByBuyer, type Participant } from "@/components/ParticipantsList";
import { publicLinkUrl } from "@/components/PublicLinkSheet";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { standingOf, type StageSettings } from "@/lib/stages";
import type { RaffleDTO, RaffleNumberDTO } from "@/lib/types";
import {
  broadcastDueLine,
  buildBroadcastMessage,
  NAME_TOKEN,
  normalizeWhatsAppPhone,
  personalizeBroadcast,
  whatsAppUrl,
} from "@/lib/whatsapp";

type BroadcastRaffle = Pick<RaffleDTO, "id" | "name" | "prizeLabel" | "drawDate" | "lottery" | "stages" | "numbers" | "groups" | "publicToken">;

type Audience = "all" | "upToDate" | "owing";

interface Recipient extends Participant {
  /** What they must pay now (stages: to play the draw being collected; otherwise their unpaid numbers). */
  due: number;
  dueLine: string | null;
}

/** Who was already sent the message today, so leaving for WhatsApp and coming back keeps the checkmarks. */
function sentKey(raffleId: string): string {
  return `ibirifas:broadcast-sent:${raffleId}`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function loadSent(raffleId: string): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(sentKey(raffleId)) ?? "null") as { day: string; keys: string[] } | null;
    return new Set(saved && saved.day === today() ? saved.keys : []);
  } catch {
    return new Set();
  }
}
function saveSent(raffleId: string, keys: Set<string>) {
  try {
    localStorage.setItem(sentKey(raffleId), JSON.stringify({ day: today(), keys: [...keys] }));
  } catch {
    // Private mode or blocked storage: the checkmarks just last while the sheet is open.
  }
}

/**
 * "Mensaje a todos": a motivational message for every buyer (ganadores so far, the next draw, the big prize), editable,
 * sent one by one from the organizer's own WhatsApp with each name filled in, or copied once for a group or a status.
 */
export function BroadcastSheet({
  raffle,
  priceOf,
  stageSettings,
  onClose,
}: {
  raffle: BroadcastRaffle;
  priceOf: (subset: RaffleNumberDTO[]) => number;
  stageSettings: StageSettings | null;
  onClose: () => void;
}) {
  const link = raffle.publicToken ? publicLinkUrl(raffle.publicToken) : null;
  const template = (withLink: boolean) =>
    buildBroadcastMessage({
      raffleName: raffle.name,
      prize: raffle.prizeLabel,
      drawDate: raffle.drawDate,
      lottery: raffle.lottery,
      stages: raffle.stages,
      link: withLink ? link : null,
    });

  const [includeLink, setIncludeLink] = useState(false);
  const [text, setText] = useState(() => template(false));
  const [edited, setEdited] = useState(false);
  const [addDue, setAddDue] = useState(true);
  const [audience, setAudience] = useState<Audience>("all");
  const [sent, setSent] = useState<Set<string>>(() => loadSent(raffle.id));

  const recipients = useMemo<Recipient[]>(() => {
    const labelOf = new Map(raffle.groups.map((g) => [g.id, g.label]));
    return groupByBuyer(raffle.numbers).map((p) => {
      let owed: RaffleNumberDTO[];
      let due: number;
      let lastDay: string | null = null;
      if (stageSettings) {
        const standings = p.numbers.map((n) => ({ n, s: standingOf(n.quotas, stageSettings) }));
        owed = standings.filter(({ s }) => s.due > 0).map(({ n }) => n);
        due = standings.reduce((sum, { s }) => sum + s.due, 0);
        lastDay = standings.find(({ s }) => s.due > 0 && !s.late)?.s.lastDay ?? null;
      } else {
        owed = p.numbers.filter((n) => n.status !== "paid");
        due = priceOf(owed);
      }
      const sets = [...new Set(owed.filter((n) => n.groupId).map((n) => labelOf.get(n.groupId!) ?? ""))].filter(Boolean);
      const looseValues = owed.filter((n) => !n.groupId).map((n) => n.value);
      return {
        ...p,
        due,
        dueLine: due > 0 ? broadcastDueLine({ sets, looseValues, amount: due, lastDay }) : null,
      };
    });
  }, [raffle.numbers, raffle.groups, stageSettings, priceOf]);

  const owingCount = recipients.filter((r) => r.due > 0).length;
  const visible = recipients.filter((r) => (audience === "owing" ? r.due > 0 : audience === "upToDate" ? r.due === 0 : true));
  const reachable = visible.filter((r) => normalizeWhatsAppPhone(r.phone));
  const withoutPhone = visible.length - reachable.length;
  const sentCount = reachable.filter((r) => sent.has(r.key)).length;
  const groupText = personalizeBroadcast(text, null);

  const toggleLink = (on: boolean) => {
    setIncludeLink(on);
    if (!edited) setText(template(on));
    else if (link) setText((t) => (on ? (t.includes(link) ? t : `${t.trimEnd()}\n\nMira los números aquí: ${link}`) : t.replace(`\n\nMira los números aquí: ${link}`, "")));
  };

  const markSent = (key: string) => {
    setSent((current) => {
      const next = new Set(current).add(key);
      saveSent(raffle.id, next);
      return next;
    });
  };

  const shareToGroup = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text: groupText });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    window.open(whatsAppUrl(null, groupText), "_blank", "noopener,noreferrer");
  };

  return (
    <BottomSheet title="Mensaje a compradores" subtitle={raffle.name} onClose={onClose}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="broadcastText" className="text-sm font-medium text-text-muted">
            Mensaje
          </label>
          {edited && (
            <button
              type="button"
              onClick={() => {
                setText(template(includeLink));
                setEdited(false);
              }}
              className="text-xs font-semibold text-gold-400"
            >
              Volver al sugerido
            </button>
          )}
        </div>
        <textarea
          id="broadcastText"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEdited(true);
          }}
          rows={12}
          className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm leading-relaxed text-text outline-none focus:border-gold-400"
        />
        <p className="text-xs text-text-muted">
          <span className="font-mono text-gold-400">{NAME_TOKEN}</span> se cambia por el nombre de cada persona. Los
          asteriscos salen en negrita en WhatsApp.
        </p>
      </div>

      <div className="space-y-2">
        {link && (
          <Toggle checked={includeLink} onChange={toggleLink} label="Incluir el enlace de la rifa" />
        )}
        {owingCount > 0 && (
          <Toggle
            checked={addDue}
            onChange={setAddDue}
            label="Agregar a quien debe lo que le falta pagar"
            hint={stageSettings ? "Lo que necesita para jugar el próximo sorteo y hasta cuándo." : "Sus números pendientes y el valor."}
          />
        )}
      </div>

      <div className="rounded-2xl border border-line bg-bg-elevated p-4">
        <p className="text-sm font-semibold text-text">Para un grupo o tu estado</p>
        <p className="mt-0.5 text-xs text-text-muted">El mismo mensaje, sin nombre.</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={shareToGroup}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#25d366] px-4 text-sm font-bold text-[#062b14] transition active:scale-95"
          >
            <WhatsAppGlyph className="h-4 w-4" />
            Compartir
          </button>
          <CopyButton text={groupText} label="mensaje" className="h-10 px-4" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-text">Uno por uno</p>
          {reachable.length > 0 && (
            <p className="text-xs text-text-muted" aria-live="polite">
              Enviados {sentCount} de {reachable.length}
            </p>
          )}
        </div>
        <div className="flex gap-2" role="tablist" aria-label="A quién">
          <Chip active={audience === "all"} onClick={() => setAudience("all")}>
            Todos · {recipients.length}
          </Chip>
          <Chip active={audience === "upToDate"} onClick={() => setAudience("upToDate")}>
            Al día · {recipients.length - owingCount}
          </Chip>
          <Chip active={audience === "owing"} onClick={() => setAudience("owing")}>
            Deben · {owingCount}
          </Chip>
        </div>

        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Nadie en este grupo.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {visible.map((r) => {
              const phone = normalizeWhatsAppPhone(r.phone);
              const done = sent.has(r.key);
              const message = personalizeBroadcast(text, r.name, addDue ? r.dueLine : null);
              return (
                <li key={r.key} className={`flex items-center gap-3 px-4 py-3 ${done ? "bg-green-500/5" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{r.name}</p>
                    <p className="truncate text-xs text-text-muted">
                      {r.numbers.map((n) => formatNumberValue(n.value)).join(", ")}
                      {r.due > 0 && <span className="text-gold-400"> · debe {formatCurrency(r.due)}</span>}
                    </p>
                  </div>
                  {phone ? (
                    <a
                      href={whatsAppUrl(phone, message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markSent(r.key)}
                      aria-label={`Enviar a ${r.name}`}
                      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold transition active:scale-95 ${
                        done ? "border border-green-500/40 text-green-400" : "bg-[#25d366] text-[#062b14]"
                      }`}
                    >
                      {done ? "Enviado" : "Enviar"}
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-text-muted">Sin teléfono</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {withoutPhone > 0 && (
          <p className="text-xs text-text-muted">
            {withoutPhone === 1 ? "1 persona no tiene" : `${withoutPhone} personas no tienen`} teléfono: agrégalo desde
            Participantes o mándales el mensaje del grupo.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-gold-400,#e5b94e)]" />
      <span className="min-w-0">
        <span className="block text-sm text-text">{label}</span>
        {hint && <span className="block text-xs text-text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-9 rounded-full border px-3.5 text-xs font-semibold transition active:scale-95 ${
        active ? "border-gold-400 bg-gold-400/10 text-gold-400" : "border-line text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.3z" />
    </svg>
  );
}
