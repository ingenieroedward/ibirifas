"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError, createRaffle } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { Spinner } from "@/components/Spinner";

const DEFAULT_TOTAL_NUMBERS = 100;

export default function NewRafflePage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [name, setName] = useState("");
  const [prizeLabel, setPrizeLabel] = useState("");
  const [numberPrice, setNumberPrice] = useState("");
  const [totalNumbers, setTotalNumbers] = useState(String(DEFAULT_TOTAL_NUMBERS));
  const [drawDate, setDrawDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // Only an ORGANIZER can create a raffle — SELLER and SUPERADMIN never see this form.
  useEffect(() => {
    if (!authLoading && user && user.role !== "ORGANIZER") {
      router.replace(user.role === "SUPERADMIN" ? "/usuarios" : "/");
    }
  }, [authLoading, user, router]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

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
    if (!Number.isInteger(total) || total < 10 || total > 1000) {
      setError("La cantidad de números debe estar entre 10 y 1000.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const raffle = await createRaffle({
        name: trimmedName,
        prizeLabel: prizeLabel.trim() || null,
        numberPrice: Math.round(price),
        totalNumbers: total,
        drawDate: drawDate ? new Date(drawDate).toISOString() : null,
      });
      router.push(`/rifas/${raffle.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la rifa. Inténtalo de nuevo.");
      setSubmitting(false);
    }
  };

  if (authLoading || !user || user.role !== "ORGANIZER") {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center py-24">
        <Spinner size={32} className="text-gold-400" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader
        userName={user.name}
        onLogout={handleLogout}
        title="Nueva rifa"
        subtitle="Define los datos y crea los números de la rifa."
        backHref="/"
        backLabel="Volver a tus rifas"
      />

      <main className="mt-4 flex-1 px-4 sm:px-6 lg:px-8">
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
              placeholder="Ej. Televisor 55&quot;"
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

          <Field label="Cantidad de números" htmlFor="totalNumbers">
            <input
              id="totalNumbers"
              type="number"
              inputMode="numeric"
              min={10}
              max={1000}
              step={1}
              value={totalNumbers}
              onChange={(e) => setTotalNumbers(e.target.value)}
              disabled={submitting}
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

          {error && <p className="text-sm font-medium text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Spinner size={20} />
                Creando…
              </>
            ) : (
              "Crear rifa"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-muted">
        {label} {required && <span className="text-gold-400">*</span>}
      </label>
      {children}
    </div>
  );
}
