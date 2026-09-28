"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createRaffle, updateRaffle } from "@/lib/api-client";
import { formatNumberValue } from "@/lib/format";
import { lighten } from "@/lib/color";
import { DEFAULT_THEME } from "@/lib/theme";
import type { RaffleDTO } from "@/lib/types";
import { Spinner } from "@/components/Spinner";

const DEFAULT_TOTAL_NUMBERS = 100;

interface RaffleFormProps {
  mode: "create" | "edit";
  /** Required for "edit" — the raffle being edited, as loaded from getRaffleById. */
  raffle?: RaffleDTO;
}

/**
 * The raffle name/prize/price/colors form, shared by the "create" and "edit"
 * screens. `totalNumbers` is only editable on create — changing it afterwards
 * would desync the already-created RaffleNumber rows.
 */
export function RaffleForm({ mode, raffle }: RaffleFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [name, setName] = useState(raffle?.name ?? "");
  const [prizeLabel, setPrizeLabel] = useState(raffle?.prizeLabel ?? "");
  const [numberPrice, setNumberPrice] = useState(raffle ? String(raffle.numberPrice) : "");
  const [totalNumbers, setTotalNumbers] = useState(String(raffle?.totalNumbers ?? DEFAULT_TOTAL_NUMBERS));
  const [drawDate, setDrawDate] = useState(raffle?.drawDate ? raffle.drawDate.slice(0, 10) : "");

  const [background, setBackground] = useState(raffle?.themeBackground || DEFAULT_THEME.background);
  const [numberColor, setNumberColor] = useState(raffle?.themeNumberColor || DEFAULT_THEME.numberColor);
  const [textColor, setTextColor] = useState(raffle?.themeTextColor || DEFAULT_THEME.textColor);
  // Tracks which color pickers the organizer actually touched, so a raffle
  // that never gets its colors changed keeps its theme fields untouched
  // (null on create, unchanged on edit) instead of always writing the
  // defaults back as explicit values.
  const [themeTouched, setThemeTouched] = useState({ background: false, numberColor: false, textColor: false });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const price = Number(numberPrice);
    const total = totalNumbers.trim() === "" ? DEFAULT_TOTAL_NUMBERS : Number(totalNumbers);

    if (!trimmedName) {
      setError("El nombre de la rifa es obligatorio.");
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError("El valor del número debe ser mayor a cero.");
      return;
    }
    if (!isEdit && (!Number.isInteger(total) || total < 10 || total > 1000)) {
      setError("La cantidad de números debe estar entre 10 y 1000.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const themePayload = {
        themeBackground: themeTouched.background ? background : isEdit ? undefined : null,
        themeNumberColor: themeTouched.numberColor ? numberColor : isEdit ? undefined : null,
        themeTextColor: themeTouched.textColor ? textColor : isEdit ? undefined : null,
      };

      if (isEdit && raffle) {
        await updateRaffle(raffle.id, {
          name: trimmedName,
          prizeLabel: prizeLabel.trim() || null,
          numberPrice: Math.round(price),
          drawDate: drawDate ? new Date(drawDate).toISOString() : null,
          ...themePayload,
        });
        router.push(`/rifas/${raffle.id}`);
      } else {
        const created = await createRaffle({
          name: trimmedName,
          prizeLabel: prizeLabel.trim() || null,
          numberPrice: Math.round(price),
          totalNumbers: total,
          drawDate: drawDate ? new Date(drawDate).toISOString() : null,
          ...themePayload,
        });
        router.push(`/rifas/${created.id}`);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `No se pudo ${isEdit ? "guardar los cambios" : "crear la rifa"}. Inténtalo de nuevo.`,
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <Field label="Nombre de la rifa" htmlFor="name" required>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Rifa de Navidad"
          disabled={submitting}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </Field>

      <Field label="Premio (opcional)" htmlFor="prizeLabel">
        <input
          id="prizeLabel"
          type="text"
          value={prizeLabel}
          onChange={(e) => setPrizeLabel(e.target.value)}
          placeholder='Ej. Televisor 55"'
          disabled={submitting}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </Field>

      <Field label="Valor por número" htmlFor="numberPrice" required>
        <input
          id="numberPrice"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={numberPrice}
          onChange={(e) => setNumberPrice(e.target.value)}
          placeholder="Ej. 10000"
          disabled={submitting}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </Field>

      <Field
        label="Cantidad de números"
        htmlFor="totalNumbers"
        hint={isEdit ? "No se puede cambiar después de crear la rifa." : undefined}
      >
        <input
          id="totalNumbers"
          type="number"
          inputMode="numeric"
          min={10}
          max={1000}
          step={1}
          value={totalNumbers}
          onChange={(e) => setTotalNumbers(e.target.value)}
          disabled={submitting || isEdit}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </Field>

      <Field label="Fecha del sorteo (opcional)" htmlFor="drawDate">
        <input
          id="drawDate"
          type="date"
          value={drawDate}
          onChange={(e) => setDrawDate(e.target.value)}
          disabled={submitting}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </Field>

      <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
        <div>
          <p className="text-sm font-semibold text-text">Colores de la rifa (opcional)</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Personaliza el tablero de números para esta rifa. Si no cambias nada, se usa el diseño
            dorado de siempre.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <ColorField
            label="Fondo"
            value={background}
            disabled={submitting}
            onChange={(value) => {
              setBackground(value);
              setThemeTouched((t) => ({ ...t, background: true }));
            }}
          />
          <ColorField
            label="Número"
            value={numberColor}
            disabled={submitting}
            onChange={(value) => {
              setNumberColor(value);
              setThemeTouched((t) => ({ ...t, numberColor: true }));
            }}
          />
          <ColorField
            label="Texto"
            value={textColor}
            disabled={submitting}
            onChange={(value) => {
              setTextColor(value);
              setThemeTouched((t) => ({ ...t, textColor: true }));
            }}
          />
        </div>

        <ThemePreview background={background} numberColor={numberColor} textColor={textColor} />
      </div>

      {error && <p className="text-sm font-medium text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? (
          <>
            <Spinner size={20} />
            {isEdit ? "Guardando…" : "Creando…"}
          </>
        ) : isEdit ? (
          "Guardar cambios"
        ) : (
          "Crear rifa"
        )}
      </button>
    </form>
  );
}

function ColorField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col items-center gap-1.5 text-center">
      <span className="text-xs font-medium text-text-muted">{label}</span>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface-2 p-1 disabled:opacity-60"
      />
      <span className="font-mono text-[10px] uppercase text-text-muted">{value}</span>
    </label>
  );
}

function ThemePreview({
  background,
  numberColor,
  textColor,
}: {
  background: string;
  numberColor: string;
  textColor: string;
}) {
  return (
    <div
      className="flex items-center justify-center gap-4 rounded-xl border border-line px-4 py-5"
      style={{ backgroundColor: background }}
    >
      <div
        className="flex aspect-square w-16 select-none items-center justify-center rounded-2xl font-[family-name:var(--font-heading)] text-lg font-bold shadow-gold"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${lighten(numberColor, 0.22)}, ${numberColor})`,
          color: textColor,
        }}
      >
        {formatNumberValue(7)}
      </div>
      <p className="max-w-[10rem] text-xs text-text-muted" style={{ color: lighten(background, 0.5) }}>
        Así se verán los números disponibles en tu rifa.
      </p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-muted">
        {label} {required && <span className="text-gold-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
