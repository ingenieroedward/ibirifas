"use client";

import { useState } from "react";
import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import { currentStage, installmentsNeeded, lastPayDay, playsStage, standingOf, type StageSettings } from "@/lib/stages";
import type { RaffleDTO, RaffleStageDTO } from "@/lib/types";
import { BottomSheet } from "@/components/BottomSheet";
import { Spinner } from "@/components/Spinner";
import { WinnerWhatsApp } from "@/components/WinnerWhatsApp";

/** What a stage's result means, in words. */
function resultLine(stage: RaffleStageDTO): string {
  if (stage.winnerValue === null) return "";
  const n = formatNumberValue(stage.winnerValue);
  return stage.outcome === "won"
    ? `Salió el ${n}: ganó ${stage.winnerName ?? "su comprador"}`
    : `Salió el ${n}: no estaba al día, el premio queda en la casa`;
}

/**
 * The draws of a raffle by stages, on the board: each one's prize, date and deadline, who is up to date for the
 * one being collected, the results so far and (for the organizer) recording or undoing a result.
 */
export function StagesPanel({
  raffle,
  settings,
  isOrganizer,
  onDraw,
  onUndo,
}: {
  raffle: RaffleDTO;
  settings: StageSettings;
  isOrganizer: boolean;
  onDraw: (stage: RaffleStageDTO, winnerValue: number) => Promise<void>;
  onUndo: (stage: RaffleStageDTO) => Promise<void>;
}) {
  const [drawing, setDrawing] = useState<RaffleStageDTO | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);
  const next = currentStage(settings.stages);
  const lastDrawn = [...settings.stages].reverse().find((s) => s.outcome) ?? null;
  const sold = raffle.numbers.filter((n) => n.status !== "available");
  const upToDate = sold.filter((n) => standingOf(n.quotas, settings).upToDate).length;
  const fullyPaid = sold.filter((n) => n.status === "paid").length;
  const active = raffle.status === "active";

  return (
    <section aria-label="Etapas" className="mb-5 space-y-2">
      <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold text-text">Etapas</h2>
      <ol className="space-y-2">
        {settings.stages.map((stage) => {
          const isNext = next?.id === stage.id;
          const day = stage.bonus ? null : lastPayDay(stage, settings.deadlineDays);
          return (
            <li
              key={stage.id}
              className={`rounded-2xl border p-3 ${
                isNext && active ? "border-gold-500/60 bg-gold-500/5" : "border-line bg-surface-2"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">
                    {stage.label} · <span className="text-gold-400">{stage.prize}</span>
                  </p>
                  <p className="text-xs text-text-muted">
                    {stage.drawDate ? formatDrawDate(stage.drawDate) : "Sin fecha"}
                    {stage.lottery || raffle.lottery ? ` · ${stage.lottery || raffle.lottery}` : ""}
                  </p>
                  <p className="text-xs text-text-muted">
                    {stage.bonus
                      ? "Sorteo extra: juegan los números pagados completos a tiempo"
                      : `Juegan con ${installmentsNeeded(stage, settings.stages)} ${installmentsNeeded(stage, settings.stages) === 1 ? "cuota" : "cuotas"} (${formatCurrency(
                          settings.stages
                            .filter((s) => !s.bonus && s.position <= stage.position)
                            .reduce((sum, s) => sum + s.price, 0),
                        )})${day ? ` pagadas hasta el ${day}` : ""}`}
                  </p>
                </div>
                {stage.outcome ? (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      stage.outcome === "won" ? "bg-green-500/15 text-green-400" : "bg-surface text-text-muted"
                    }`}
                  >
                    {stage.outcome === "won" ? "Ganador" : "Casa"}
                  </span>
                ) : (
                  isNext && active && <span className="shrink-0 rounded-full bg-gold-500/15 px-2 py-0.5 text-[11px] font-semibold text-gold-400">Sigue</span>
                )}
              </div>

              {stage.outcome && <p className="mt-2 text-sm font-medium text-text">{resultLine(stage)}</p>}
              {stage.outcome && stage.winnerValue !== null && (
                <WinnerWhatsApp
                  raffle={raffle}
                  winnerValue={stage.winnerValue}
                  prize={stage.prize}
                  stageLabel={stage.label}
                  drawDate={stage.drawDate}
                  lottery={stage.lottery || raffle.lottery}
                  outcome={stage.outcome}
                />
              )}

              {isNext && active && !stage.bonus && (
                <p className="mt-2 text-xs text-text-muted">
                  {upToDate} de {sold.length} vendidos al día para esta etapa
                </p>
              )}
              {isNext && active && stage.bonus && (
                <p className="mt-2 text-xs text-text-muted">{fullyPaid} números pagados completos</p>
              )}

              {isOrganizer && (
                <div className="mt-2 flex gap-2">
                  {isNext && active && (
                    <button
                      type="button"
                      onClick={() => setDrawing(stage)}
                      className="h-10 flex-1 rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] transition active:scale-[0.98]"
                    >
                      Registrar resultado
                    </button>
                  )}
                  {lastDrawn?.id === stage.id && (
                    <button
                      type="button"
                      onClick={async () => {
                        setUndoing(stage.id);
                        try {
                          await onUndo(stage);
                        } catch {
                          // The page showed the error.
                        } finally {
                          setUndoing(null);
                        }
                      }}
                      disabled={undoing !== null}
                      className="flex h-10 items-center justify-center rounded-xl border border-line px-4 text-xs font-semibold text-text-muted transition active:scale-95 disabled:opacity-50"
                    >
                      {undoing === stage.id ? <Spinner size={14} /> : "Deshacer resultado"}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {drawing && (
        <DrawStageSheet
          raffle={raffle}
          settings={settings}
          stage={drawing}
          onClose={() => setDrawing(null)}
          onConfirm={async (value) => {
            await onDraw(drawing, value);
            setDrawing(null);
          }}
        />
      )}
    </section>
  );
}

/** Records the number that came out in a stage, showing first whether its buyer wins or the prize stays home. */
function DrawStageSheet({
  raffle,
  settings,
  stage,
  onClose,
  onConfirm,
}: {
  raffle: RaffleDTO;
  settings: StageSettings;
  stage: RaffleStageDTO;
  onClose: () => void;
  onConfirm: (winnerValue: number) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const value = text.trim() === "" ? null : Number(text);
  const invalid = value !== null && (!Number.isInteger(value) || value < 0 || value >= raffle.totalNumbers);
  const number = value !== null && !invalid ? raffle.numbers.find((n) => n.value === value) : undefined;
  const holder = number && number.status !== "available" ? number : null;
  const plays = holder ? playsStage(holder.quotas, stage, settings.stages, settings.deadlineDays) : false;
  const remaining = settings.stages.filter((s) => !s.outcome && s.id !== stage.id).length;

  return (
    <BottomSheet title={`Resultado · ${stage.label}`} subtitle={stage.prize} onClose={saving ? () => {} : onClose}>
      <div className="space-y-1.5">
        <label htmlFor="stageWinner" className="text-sm font-medium text-text-muted">
          Número que salió{stage.lottery || raffle.lottery ? ` (${stage.lottery || raffle.lottery})` : ""}
        </label>
        <input
          id="stageWinner"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="Ej. 47"
          disabled={saving}
          autoComplete="off"
          className="h-14 w-full rounded-xl border border-line bg-surface-2 px-4 text-center font-[family-name:var(--font-heading)] text-3xl font-extrabold text-gold-400 outline-none focus:border-gold-400 disabled:opacity-60"
        />
        {invalid && <p className="text-sm font-medium text-red-400">Ese número no existe en esta rifa.</p>}
        {value !== null && !invalid && (
          <p role="status" className={`text-sm font-medium ${plays ? "text-green-400" : "text-text"}`}>
            {!holder
              ? "Nadie tiene ese número: el premio queda en la casa."
              : plays
                ? `Gana ${holder.buyerName ?? "su comprador"}: está al día.`
                : `${holder.buyerName ?? "Su comprador"} no estaba al día: el premio queda en la casa.`}
          </p>
        )}
      </div>
      {remaining === 0 && (
        <p className="rounded-2xl border border-line bg-surface-2 p-3 text-xs text-text-muted">
          Es el último sorteo: al registrarlo la rifa se cierra. Puedes deshacerlo si te equivocas.
        </p>
      )}
      <button
        type="button"
        onClick={async () => {
          if (value === null || invalid) return;
          setSaving(true);
          try {
            await onConfirm(value);
          } catch {
            setSaving(false);
          }
        }}
        disabled={saving || value === null || invalid}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Spinner size={20} /> : "Registrar resultado"}
      </button>
    </BottomSheet>
  );
}
