"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createRaffle, getOrgSettings, updateRaffle } from "@/lib/api-client";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { contrastRatio, lighten, luminance } from "@/lib/color";
import { GROUP_LABELS, drawRandomSets, setsThatFit } from "@/lib/groups";
import { DEFAULT_THEME, tileTextColor } from "@/lib/theme";
import type { RaffleAccountInput, RaffleDTO, RaffleGroupInput, ReservationSetting } from "@/lib/types";
import { GroupPlanner, type PlannerSet } from "@/components/GroupPlanner";
import { Spinner } from "@/components/Spinner";

const DEFAULT_TOTAL_NUMBERS = 100;
const DEFAULT_HOLD_DAYS = 3;
const MAX_ACCOUNTS = 5;

/** A payment-account row being edited in the form, before submit. */
interface AccountRow {
  key: string;
  label: string;
  number: string;
  holderName: string;
}

let nextRowKey = 0;
function newAccountRow(source?: Partial<AccountRow>): AccountRow {
  nextRowKey += 1;
  return {
    key: `row-${nextRowKey}`,
    label: source?.label ?? "",
    number: source?.number ?? "",
    holderName: source?.holderName ?? "",
  };
}

const DEFAULT_SET_SIZE = 10;

/** Fresh sets for `total` numbers dealt into sets of `size`: dealt at random, or empty to be filled by hand. */
/** How many sets to make: what the person asked for (blank = as many as fit), never more than fit. */
function chosenSetCount(fit: number, countText: string): number {
  const asked = Number(countText);
  return countText.trim() !== "" && Number.isInteger(asked) && asked >= 1 ? Math.min(asked, fit) : fit;
}

/** Ready-made looks for people who don't want to pick colors: a page background and the tile color. */
const THEME_PRESETS = [
  { name: "Clásico", background: "#0b0b0f", numberColor: "#f5c518" },
  { name: "Azul", background: "#ffffff", numberColor: "#1d4ed8" },
  { name: "Rojo", background: "#ffffff", numberColor: "#dc2626" },
  { name: "Verde", background: "#f4fbf6", numberColor: "#15803d" },
  { name: "Morado", background: "#faf5ff", numberColor: "#7e22ce" },
  { name: "Naranja", background: "#0b0b0f", numberColor: "#f97316" },
  { name: "Celeste", background: "#f0f9ff", numberColor: "#0284c7" },
  { name: "Rosa", background: "#fff1f5", numberColor: "#db2777" },
] as const;

function buildSets(
  total: number,
  size: number,
  mode: "random" | "manual",
  price: string,
  previous: PlannerSet[],
  countText: string,
): PlannerSet[] {
  const count = chosenSetCount(setsThatFit(total, size), countText);
  if (mode === "random") {
    return drawRandomSets(total, size, count).map((values, i) => ({ label: GROUP_LABELS[i]!, price, values }));
  }
  // By hand: keep what was already picked (minus numbers that no longer exist).
  return Array.from({ length: count }, (_, i) => ({
    label: GROUP_LABELS[i]!,
    price: previous[i]?.price ?? price,
    values: (previous[i]?.values ?? []).filter((v) => v < total),
  }));
}

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
  const [lottery, setLottery] = useState(raffle?.lottery ?? "");
  const [numberPrice, setNumberPrice] = useState(raffle ? String(raffle.numberPrice) : "");
  const [totalNumbers, setTotalNumbers] = useState(String(raffle?.totalNumbers ?? DEFAULT_TOTAL_NUMBERS));
  const [drawDate, setDrawDate] = useState(raffle?.drawDate ? raffle.drawDate.slice(0, 10) : "");

  // Sold-but-unpaid numbers can expire after some days (and optionally go back on sale by themselves).
  const [holdOn, setHoldOn] = useState(Boolean(raffle?.holdDays));
  const [holdDays, setHoldDays] = useState(String(raffle?.holdDays ?? DEFAULT_HOLD_DAYS));
  const [autoRelease, setAutoRelease] = useState(raffle?.autoRelease ?? false);

  // Reservations from the public link: follow the organization's default, or decide for this raffle.
  const [reservations, setReservations] = useState<ReservationSetting>(raffle?.publicReservations ?? "inherit");
  const [orgAllows, setOrgAllows] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getOrgSettings()
      .then((s) => {
        if (!cancelled) setOrgAllows(s.publicReservations);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Selling in lettered sets (A, B, C…) is chosen when the raffle is created.
  const [useSets, setUseSets] = useState(false);
  const [setSize, setSetSize] = useState(String(DEFAULT_SET_SIZE));
  // Blank = as many sets as fit; fewer sets leave numbers loose, sold one by one at the individual price.
  const [setCount, setSetCount] = useState("");
  const [setPrice, setSetPrice] = useState("");
  const [setMode, setSetMode] = useState<"random" | "manual">("random");
  const [sets, setSets] = useState<PlannerSet[]>([]);
  const existingSets = raffle?.groups ?? [];

  const [accounts, setAccounts] = useState<AccountRow[]>(() =>
    raffle?.accounts && raffle.accounts.length > 0
      ? raffle.accounts.map((a) => newAccountRow({ label: a.label, number: a.number, holderName: a.holderName ?? "" }))
      : [],
  );

  const [background, setBackground] = useState(raffle?.themeBackground || DEFAULT_THEME.background);
  const [numberColor, setNumberColor] = useState(raffle?.themeNumberColor || DEFAULT_THEME.numberColor);
  const [textColor, setTextColor] = useState(raffle?.themeTextColor || DEFAULT_THEME.textColor);
  // Tracks which color pickers the organizer actually touched, so a raffle
  // that never gets its colors changed keeps its theme fields untouched
  // (null on create, unchanged on edit) instead of always writing the
  // defaults back as explicit values.
  const [themeTouched, setThemeTouched] = useState({ background: false, numberColor: false, textColor: false });
  // The digits' color is chosen automatically (white or near-black, whichever reads better) unless the
  // organizer picks one.
  const [textAuto, setTextAuto] = useState(!raffle?.themeTextColor);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalValue = totalNumbers.trim() === "" ? DEFAULT_TOTAL_NUMBERS : Number(totalNumbers);
  const sizeValue = Number(setSize);
  const totalOk = Number.isInteger(totalValue) && totalValue >= 10 && totalValue <= 1000;
  const sizeOk = Number.isInteger(sizeValue) && sizeValue >= 1;
  const assignedCount = sets.reduce((sum, set) => sum + set.values.length, 0);
  // Numbers outside every set are sold one by one at the number price.
  const looseCount = useSets ? Math.max(0, (totalOk ? totalValue : 0) - assignedCount) : 0;
  const setsFit = totalOk && sizeOk ? setsThatFit(totalValue, sizeValue) : 0;

  /** Re-deal (or trim) the sets after the total or the set size changed. */
  const resetSets = (
    nextTotal: string,
    nextSize: string,
    mode = setMode,
    price = setPrice,
    previous = sets,
    nextCount = setCount,
  ) => {
    const total = nextTotal.trim() === "" ? DEFAULT_TOTAL_NUMBERS : Number(nextTotal);
    const size = Number(nextSize);
    if (!Number.isInteger(total) || total < 10 || total > 1000 || !Number.isInteger(size) || size < 1) {
      setSets([]);
      return;
    }
    setSets(buildSets(total, size, mode, price, previous, nextCount));
  };

  const handleTotalChange = (value: string) => {
    setTotalNumbers(value);
    if (useSets) resetSets(value, setSize);
  };

  const handleSetSizeChange = (value: string) => {
    setSetSize(value);
    resetSets(totalNumbers, value);
  };

  const handleSetCountChange = (value: string) => {
    setSetCount(value);
    resetSets(totalNumbers, setSize, setMode, setPrice, sets, value);
  };

  const handleSetPriceChange = (value: string) => {
    setSetPrice(value);
    setSets((current) => current.map((set) => ({ ...set, price: value })));
  };

  const handleToggleSets = (on: boolean) => {
    setUseSets(on);
    if (on) resetSets(totalNumbers, setSize, setMode, setPrice, []);
    else setSets([]);
  };

  const handleModeChange = (mode: "random" | "manual") => {
    setSetMode(mode);
    // Going to "by hand" starts from what's on screen; going back to random deals again.
    if (mode === "random") resetSets(totalNumbers, setSize, mode, setPrice, sets);
  };

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
    const creatingSets = !isEdit && useSets;
    const needsNumberPrice = !creatingSets || looseCount > 0;
    if (needsNumberPrice && (!Number.isFinite(price) || price <= 0)) {
      setError(creatingSets ? "El valor de cada número suelto debe ser mayor a cero." : "El valor del número debe ser mayor a cero.");
      return;
    }
    if (!isEdit && (!Number.isInteger(total) || total < 10 || total > 1000)) {
      setError("La cantidad de números debe estar entre 10 y 1000.");
      return;
    }

    // Empty letters are dropped and the rest renamed A, B, C… in order.
    let groupsPayload: RaffleGroupInput[] | undefined;
    if (creatingSets) {
      const filled = sets.filter((set) => set.values.length > 0);
      if (filled.length === 0) {
        setError(
          sets.length === 0
            ? "Con ese tamaño no cabe ningún conjunto. Ajusta la cantidad de números o el tamaño."
            : "Reparte al menos un número en un conjunto.",
        );
        return;
      }
      const badPrice = filled.find((set) => !Number.isInteger(Number(set.price)) || Number(set.price) <= 0);
      if (badPrice) {
        setError(`Ponle un precio (mayor a cero) al conjunto ${badPrice.label}.`);
        return;
      }
      groupsPayload = filled.map((set, i) => ({ label: GROUP_LABELS[i]!, price: Number(set.price), values: set.values }));
    }
    // Every number in a set: there is no loose price to ask for, so keep something sensible on record.
    const looseNumberPrice = needsNumberPrice
      ? Math.round(price)
      : Number.isFinite(price) && price > 0
        ? Math.round(price)
        : Math.max(1, Math.round(groupsPayload![0]!.price / groupsPayload![0]!.values.length));

    // Blank rows (never filled in) are dropped silently; a row with only one
    // of label/number filled in is a real mistake, so we ask for it to be fixed.
    const nonEmptyAccounts = accounts.filter((a) => a.label.trim() || a.number.trim());
    const incomplete = nonEmptyAccounts.some((a) => !a.label.trim() || !a.number.trim());
    if (incomplete) {
      setError("Cada cuenta de pago necesita un nombre (ej. Nequi) y un número.");
      return;
    }
    const holdValue = Number(holdDays);
    if (holdOn && !(Number.isInteger(holdValue) && holdValue >= 1 && holdValue <= 365)) {
      setError("Los días para pagar deben ser un número entre 1 y 365.");
      return;
    }
    const holdPayload = { holdDays: holdOn ? holdValue : null, autoRelease: holdOn && autoRelease, publicReservations: reservations };
    const accountsPayload: RaffleAccountInput[] = nonEmptyAccounts.map((a) => ({
      label: a.label.trim(),
      number: a.number.trim(),
      holderName: a.holderName.trim() || null,
    }));

    setSubmitting(true);
    setError(null);
    try {
      const themePayload = {
        themeBackground: themeTouched.background ? background : isEdit ? undefined : null,
        themeNumberColor: themeTouched.numberColor ? numberColor : isEdit ? undefined : null,
        themeTextColor: textAuto ? null : themeTouched.textColor ? textColor : isEdit ? undefined : null,
      };

      if (isEdit && raffle) {
        await updateRaffle(raffle.id, {
          name: trimmedName,
          prizeLabel: prizeLabel.trim() || null,
          lottery: lottery.trim() || null,
          numberPrice: Math.round(price),
          drawDate: drawDate ? new Date(drawDate).toISOString() : null,
          accounts: accountsPayload,
          ...holdPayload,
          ...themePayload,
        });
        router.push(`/rifas/${raffle.id}`);
      } else {
        const created = await createRaffle({
          name: trimmedName,
          prizeLabel: prizeLabel.trim() || null,
          lottery: lottery.trim() || null,
          numberPrice: looseNumberPrice,
          totalNumbers: total,
          drawDate: drawDate ? new Date(drawDate).toISOString() : null,
          accounts: accountsPayload,
          ...holdPayload,
          ...(groupsPayload ? { groups: groupsPayload } : {}),
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

  // The individual price is always on screen (with sets it sits right under the set price, so it is
  // never hard to find); it is only required when some numbers stay outside the sets.
  const individualPriceField = (
  <Field
      label={useSets || existingSets.length > 0 ? "Precio individual (números sueltos)" : "Valor por número"}
      htmlFor="numberPrice"
      required={!useSets || looseCount > 0}
      hint={
        useSets
          ? looseCount > 0
            ? `Precio de cada uno de los ${looseCount} ${looseCount === 1 ? "número que queda suelto" : "números que quedan sueltos"}, fuera de los conjuntos.`
            : "Ahora no queda ningún número suelto: todos están en conjuntos. Baja la \"Cantidad de conjuntos\" (o saca números de una letra en el modo a mano) para dejar números que se vendan de a uno a este precio."
          : existingSets.length > 0
            ? "Se usa solo para los números que no pertenecen a ningún conjunto."
            : undefined
      }
    >
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
  );

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

      <Field
        label="Lotería (opcional)"
        htmlFor="lottery"
        hint="La lotería oficial de la que sale el número ganador, ej. Sinuano Noche."
      >
        <input
          id="lottery"
          type="text"
          value={lottery}
          onChange={(e) => setLottery(e.target.value)}
          placeholder="Ej. Sinuano Noche"
          disabled={submitting}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </Field>

      <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id="holdOn"
            type="checkbox"
            checked={holdOn}
            onChange={(e) => setHoldOn(e.target.checked)}
            disabled={submitting}
            className="mt-1 h-5 w-5 accent-[#f5c542]"
          />
          <span>
            <span className="block text-sm font-semibold text-text">Los apartados sin pagar vencen</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              Un número vendido que sigue sin pagarse pasado el plazo se marca como vencido y avisamos al equipo.
            </span>
          </span>
        </label>

        {holdOn && (
          <div className="space-y-3">
            <Field label="Días para pagar" htmlFor="holdDays">
              <input
                id="holdDays"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                step={1}
                value={holdDays}
                onChange={(e) => setHoldDays(e.target.value)}
                disabled={submitting}
                className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
              />
            </Field>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                id="autoRelease"
                type="checkbox"
                checked={autoRelease}
                onChange={(e) => setAutoRelease(e.target.checked)}
                disabled={submitting}
                className="mt-1 h-5 w-5 accent-[#f5c542]"
              />
              <span>
                <span className="block text-sm font-semibold text-text">Liberarlos automáticamente</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Vuelven a estar disponibles solos (los conjuntos, completos). Si no, solo se avisa una vez al día y tú decides.
                </span>
              </span>
            </label>
          </div>
        )}
      </div>


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
          onChange={(e) => handleTotalChange(e.target.value)}
          disabled={submitting || isEdit}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </Field>

      <div className="space-y-2 rounded-2xl border border-line bg-surface-2/60 p-4">
        <Field
          label="Reservas desde el enlace público"
          htmlFor="publicReservations"
          hint="Quien abre el enlace de la rifa puede apartar números o letras por su cuenta. Necesita un plazo de pago (arriba) para que lo no pagado se libere."
        >
          <select
            id="publicReservations"
            value={reservations}
            onChange={(e) => setReservations(e.target.value as ReservationSetting)}
            disabled={submitting}
            className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
          >
            <option value="inherit">
              Como mi organización{orgAllows === null ? "" : orgAllows ? " (permitidas)" : " (no permitidas)"}
            </option>
            <option value="on">Permitir en esta rifa</option>
            <option value="off">No permitir en esta rifa</option>
          </select>
        </Field>
        {(reservations === "on" || (reservations === "inherit" && orgAllows === true)) && !holdOn && (
          <p role="status" className="text-xs font-medium text-gold-400">
            Para recibir reservas activa arriba &quot;Los apartados sin pagar vencen&quot; y elige los días.
          </p>
        )}
      </div>

      {isEdit && existingSets.length > 0 ? (
        <div className="space-y-1 rounded-2xl border border-line bg-surface-2/60 p-4">
          <p className="text-sm font-semibold text-text">Se vende por conjuntos</p>
          <p className="text-xs text-text-muted">
            {existingSets.map((g) => `${g.label} · ${formatCurrency(g.price)}`).join("   ")}
          </p>
          <p className="text-xs text-text-muted">Los conjuntos y sus números no se pueden cambiar después de crear la rifa.</p>
        </div>
      ) : (
        !isEdit && (
          <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                id="useSets"
                type="checkbox"
                checked={useSets}
                onChange={(e) => handleToggleSets(e.target.checked)}
                disabled={submitting}
                className="mt-1 h-5 w-5 accent-[#f5c542]"
              />
              <span>
                <span className="block text-sm font-semibold text-text">Vender por conjuntos (letras)</span>
                <span className="mt-0.5 block text-xs text-text-muted">
                  Agrupa los números en letras (A, B, C…): cada letra se vende completa por un precio. Los números que no
                  metas en ninguna se venden de a uno.
                </span>
              </span>
            </label>

            {useSets && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Números por conjunto" htmlFor="setSize">
                    <input
                      id="setSize"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={setSize}
                      onChange={(e) => handleSetSizeChange(e.target.value)}
                      disabled={submitting}
                      className="h-12 w-full rounded-xl border border-line bg-bg-elevated px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
                    />
                  </Field>
                  <Field label="Cantidad de conjuntos" htmlFor="setCount">
                    <input
                      id="setCount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={setsFit || undefined}
                      step={1}
                      value={setCount}
                      onChange={(e) => handleSetCountChange(e.target.value)}
                      placeholder={setsFit ? `Todos (${setsFit})` : "—"}
                      disabled={submitting}
                      className="h-12 w-full rounded-xl border border-line bg-bg-elevated px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
                    />
                  </Field>
                </div>
                <Field
                  label="Precio de cada conjunto"
                  htmlFor="setPrice"
                  required
                  hint="Menos conjuntos que el máximo dejan números sueltos: esos se venden de a uno al precio individual (más abajo)."
                >
                  <input
                    id="setPrice"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={setPrice}
                    onChange={(e) => handleSetPriceChange(e.target.value)}
                    placeholder="Ej. 40000"
                    disabled={submitting}
                    className="h-12 w-full rounded-xl border border-line bg-bg-elevated px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
                  />
                </Field>
                {individualPriceField}

                {totalOk && sizeOk ? (
                  <>
                    <p className="text-sm font-medium text-text">
                      {sets.length === 0
                        ? "No cabe ningún conjunto con ese tamaño."
                        : `${sets.length} ${sets.length === 1 ? "conjunto" : "conjuntos"} (${sets[0]!.label}${sets.length > 1 ? `–${sets[sets.length - 1]!.label}` : ""}) de ${setSize} números`}
                    </p>
                    {sets.length > 0 && (
                      <GroupPlanner
                        total={totalValue}
                        size={sizeValue}
                        sets={sets}
                        mode={setMode}
                        disabled={submitting}
                        onModeChange={handleModeChange}
                        onRedraw={() => resetSets(totalNumbers, setSize, "random", setPrice, sets)}
                        onSetsChange={setSets}
                      />
                    )}
                  </>
                ) : (
                  <p className="text-xs text-text-muted">Revisa la cantidad de números y el tamaño del conjunto.</p>
                )}
              </div>
            )}
          </div>
        )
      )}

      {!useSets && individualPriceField}

      <Field label="Fecha del sorteo (opcional)" htmlFor="drawDate">
        <input
          id="drawDate"
          type="date"
          value={drawDate}
          onChange={(e) => setDrawDate(e.target.value)}
          disabled={submitting}
          className="h-12 w-full min-w-0 max-w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </Field>

      <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
        <div>
          <p className="text-sm font-semibold text-text">Cuentas de pago (opcional)</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Agrega dónde pueden pagarte tus compradores (Nequi, Bancolombia, etc.). El responsable
            es opcional y solo se muestra si lo llenas.
          </p>
        </div>

        {accounts.length > 0 && (
          <div className="space-y-3">
            {accounts.map((row, index) => (
              <div
                key={row.key}
                className="space-y-2 rounded-xl border border-line bg-surface-2 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Cuenta {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAccounts((rows) => rows.filter((r) => r.key !== row.key))}
                    disabled={submitting}
                    aria-label="Quitar cuenta"
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90 disabled:opacity-60"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={row.label}
                    onChange={(e) =>
                      setAccounts((rows) =>
                        rows.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)),
                      )
                    }
                    placeholder="Ej. Nequi"
                    disabled={submitting}
                    aria-label="Nombre de la cuenta"
                    className="h-11 w-full rounded-xl border border-line bg-bg-elevated px-3 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
                  />
                  <input
                    type="text"
                    value={row.number}
                    onChange={(e) =>
                      setAccounts((rows) =>
                        rows.map((r) => (r.key === row.key ? { ...r, number: e.target.value } : r)),
                      )
                    }
                    placeholder="Ej. 300 123 4567"
                    disabled={submitting}
                    aria-label="Número de la cuenta"
                    className="h-11 w-full rounded-xl border border-line bg-bg-elevated px-3 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
                  />
                </div>

                <input
                  type="text"
                  value={row.holderName}
                  onChange={(e) =>
                    setAccounts((rows) =>
                      rows.map((r) => (r.key === row.key ? { ...r, holderName: e.target.value } : r)),
                    )
                  }
                  placeholder="Responsable (opcional)"
                  disabled={submitting}
                  aria-label="Responsable de la cuenta"
                  className="h-11 w-full rounded-xl border border-line bg-bg-elevated px-3 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
                />
              </div>
            ))}
          </div>
        )}

        {accounts.length < MAX_ACCOUNTS && (
          <button
            type="button"
            onClick={() => setAccounts((rows) => [...rows, newAccountRow()])}
            disabled={submitting}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-line text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-60"
          >
            <PlusIcon className="h-4 w-4" />
            Agregar cuenta
          </button>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
        <div>
          <p className="text-sm font-semibold text-text">Colores de la rifa (opcional)</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Personaliza cómo se ve la rifa en el enlace público para compradores y en la imagen para
            compartir. La aplicación siempre se ve en amarillo y negro. Si no cambias nada, se usa el
            diseño dorado de siempre.
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
              setTextAuto(false);
              setThemeTouched((t) => ({ ...t, textColor: true }));
            }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-text-muted">
            {textAuto
              ? "El texto de los números se elige solo (blanco o negro, el que mejor se lea)."
              : "Elegiste el color del texto."}
          </p>
          {!textAuto && (
            <button
              type="button"
              onClick={() => setTextAuto(true)}
              disabled={submitting}
              className="h-9 shrink-0 rounded-full border border-gold-600/50 px-3 text-xs font-semibold text-gold-400 transition active:scale-95"
            >
              Automático
            </button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-muted">O parte de un estilo</p>
          <div className="grid grid-cols-4 gap-2">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                disabled={submitting}
                onClick={() => {
                  setBackground(preset.background);
                  setNumberColor(preset.numberColor);
                  setTextAuto(true);
                  setThemeTouched({ background: true, numberColor: true, textColor: true });
                }}
                aria-label={`Estilo ${preset.name}`}
                className="flex flex-col items-center gap-1 rounded-xl border border-line p-1.5 transition active:scale-95"
              >
                <span
                  className="flex h-9 w-full items-center justify-center rounded-lg"
                  style={{ backgroundColor: preset.background }}
                >
                  <span
                    className="h-5 w-5 rounded-md"
                    style={{ backgroundImage: `linear-gradient(to bottom, ${lighten(preset.numberColor, 0.22)}, ${preset.numberColor})` }}
                  />
                </span>
                <span className="text-[10px] font-medium leading-tight text-text-muted">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <ThemePreview background={background} numberColor={numberColor} textColor={textAuto ? null : textColor} />
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
  /** null = automatic. */
  textColor: string | null;
}) {
  // A chosen text color that can't be read on the tile (contrast under 3) is replaced by an automatic one.
  const shownText = tileTextColor(numberColor, textColor);
  const hardToRead = textColor !== null && contrastRatio(textColor, numberColor) < 3;
  const lightBackground = luminance(background) >= 0.18;

  return (
    <div className="space-y-2">
      <div
        className="flex items-center justify-center gap-4 rounded-xl border border-line px-4 py-5"
        style={{ backgroundColor: background }}
      >
        <div
          className="flex aspect-square w-16 select-none items-center justify-center rounded-2xl font-[family-name:var(--font-heading)] text-lg font-bold shadow-gold"
          style={{
            backgroundImage: `linear-gradient(to bottom, ${lighten(numberColor, 0.22)}, ${numberColor})`,
            color: shownText,
          }}
        >
          {formatNumberValue(7)}
        </div>
        <p className="max-w-[10rem] text-xs" style={{ color: lightBackground ? "#3a3548" : lighten(background, 0.5) }}>
          Así se verán los números disponibles en el enlace público y en la imagen.
        </p>
      </div>
      {hardToRead && (
        <p role="status" className="text-xs font-medium text-gold-400">
          Ese color de texto casi no se lee sobre el color de los números, así que se usará blanco o negro
          automáticamente. Toca &quot;Automático&quot; para dejarlo así.
        </p>
      )}
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
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-muted">
        {label} {required && <span className="text-gold-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 7h16M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7m2 0v12.5A1.5 1.5 0 0 1 15.5 21h-7A1.5 1.5 0 0 1 7 19.5V7h10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
