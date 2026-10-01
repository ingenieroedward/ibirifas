"use client";

import { useState } from "react";
import { Spinner } from "@/components/Spinner";

/**
 * A buyer's phone, with "Agregar teléfono" when it's missing and "Editar" when it isn't: for buyers someone
 * registered without one (it's what the WhatsApp reminders and receipts need).
 */
export function PhoneEditor({ phone, onSave }: { phone: string | null; onSave: (phone: string | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setValue(phone ?? "");
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    const next = value.trim();
    if (next && (next.replace(/\D/g, "").length < 7 || !/^[+\d\s().-]+$/.test(next))) {
      setError("Escribe un número válido, ej. 3001234567.");
      return;
    }
    if (next === (phone ?? "")) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next || null);
      setEditing(false);
    } catch {
      // The page already told what went wrong; keep the field so it can be retried.
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return phone ? (
      <span className="inline-flex flex-wrap items-center gap-x-2">
        <a href={`tel:${phone}`} className="text-sm text-gold-400 underline-offset-2 hover:underline">
          {phone}
        </a>
        <button type="button" onClick={start} className="text-xs font-semibold text-text-muted underline-offset-2 hover:underline" aria-label="Editar teléfono">
          Editar
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={start}
        className="mt-0.5 inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-gold-600/60 px-3 text-xs font-semibold text-gold-400 transition active:scale-[0.97]"
      >
        + Agregar teléfono
      </button>
    );
  }

  return (
    <form
      className="mt-1 w-full space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          aria-label="Teléfono del comprador"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ej. 3001234567"
          maxLength={30}
          disabled={saving}
          className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-base text-text outline-none focus:border-gold-400"
        />
        <button
          type="submit"
          disabled={saving}
          className="flex h-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-4 text-sm font-bold text-[#241a02] transition active:scale-[0.97] disabled:opacity-50"
        >
          {saving ? <Spinner size={16} /> : "Guardar"}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="h-10 shrink-0 px-2 text-sm font-semibold text-text-muted">
          Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
