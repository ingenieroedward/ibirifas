"use client";

/** Whoever owns the account the money came from, as the bank shows it: with the amount, it lets the team (and,
 *  later, the payment reader) match a transfer to its reservation. Prefilled with the buyer's own name. */
export const PAYER_NAME_MIN = 3;

export function payerNameError(value: string): string | null {
  return value.trim().length < PAYER_NAME_MIN ? "Escribe el nombre del titular de la cuenta desde la que pagaste." : null;
}

export function PayerNameInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-muted">
        Titular de la cuenta desde la que pagaste <span className="text-gold-400">*</span>
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nombre como aparece en tu banco"
        autoComplete="name"
        maxLength={80}
        className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
      />
      <p className="text-xs text-text-muted">Si pagaste desde la cuenta de otra persona, escribe su nombre.</p>
    </div>
  );
}
