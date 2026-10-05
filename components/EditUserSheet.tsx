"use client";

import { useState } from "react";
import { ApiError, updateUser } from "@/lib/api-client";
import type { ManagedUserDTO, UpdateUserInput } from "@/lib/types";
import { BottomSheet } from "@/components/BottomSheet";
import { AccessCodeTools } from "@/components/AccessCodeTools";
import { CodeInput } from "@/components/CodeInput";
import { generateAccessCode } from "@/lib/accessCode";
import { generateOrgCode, isValidOrgCode, normalizeOrgCode, ORG_CODE_HELP } from "@/lib/orgCode";
import { Spinner } from "@/components/Spinner";

interface EditUserSheetProps {
  user: ManagedUserDTO;
  /** e.g. "organizador" or "vendedor" — used only in copy. */
  targetRoleLabel: string;
  /** The superadmin can rename an organizer's organization code. */
  canEditOrgCode: boolean;
  onClose: () => void;
  onSaved: (user: ManagedUserDTO) => void;
}

const CODE_LENGTH = 6;

export function EditUserSheet({ user, targetRoleLabel, canEditOrgCode, onClose, onSaved }: EditUserSheetProps) {
  const [name, setName] = useState(user.name);
  const [orgCode, setOrgCode] = useState(user.orgCode ?? "");
  const [code, setCode] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  const [fill, setFill] = useState({ value: "", signal: 0 });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Billing, for the platform owner editing an organizer (lib/billing.ts).
  const billing = canEditOrgCode ? user.billing : undefined;
  const [exempt, setExempt] = useState(billing?.exempt ?? false);
  const [credits, setCredits] = useState(billing?.credits ?? 0);

  const nameChanged = name.trim() !== user.name;
  const codeChanged = code.length > 0;
  const orgCodeChanged = canEditOrgCode && normalizeOrgCode(orgCode) !== (user.orgCode ?? "");
  const exemptChanged = Boolean(billing) && exempt !== billing!.exempt;
  const creditsChanged = Boolean(billing) && credits !== billing!.credits;
  const canSave = (nameChanged || codeChanged || orgCodeChanged || exemptChanged || creditsChanged) && name.trim().length > 0;

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    if (codeChanged && code.length !== CODE_LENGTH) {
      setFormError("El código nuevo debe tener 6 dígitos, o déjalo vacío para conservar el actual.");
      return;
    }

    if (orgCodeChanged && !isValidOrgCode(normalizeOrgCode(orgCode))) {
      setFormError(`Código de organización inválido. ${ORG_CODE_HELP}`);
      return;
    }

    const input: UpdateUserInput = {};
    if (nameChanged) input.name = trimmedName;
    if (orgCodeChanged) input.orgCode = normalizeOrgCode(orgCode);
    if (codeChanged) input.code = code;
    if (exemptChanged) input.billingExempt = exempt;
    if (creditsChanged) input.raffleCredits = credits;

    setSaving(true);
    setFormError(null);
    try {
      onSaved(await updateUser(user.id, input));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.");
      setSaving(false);
      if (codeChanged) {
        setCode("");
        setResetSignal((n) => n + 1);
      }
    }
  };

  return (
    <BottomSheet title={`Editar ${targetRoleLabel}`} subtitle={user.name} onClose={saving ? () => {} : onClose}>
      <div className="space-y-1.5">
        <label htmlFor="editUserName" className="text-sm font-medium text-text-muted">
          Nombre <span className="text-gold-400">*</span>
        </label>
        <input
          id="editUserName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          disabled={saving}
          className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
        />
      </div>

      {canEditOrgCode && (
        <div className="space-y-1.5">
          <div className="flex items-end justify-between gap-2">
            <label htmlFor="editUserOrgCode" className="text-sm font-medium text-text-muted">
              Código de organización
            </label>
            <button
              type="button"
              onClick={() => setOrgCode(generateOrgCode())}
              disabled={saving}
              className="text-sm font-semibold text-gold-400 transition active:scale-95 disabled:opacity-40"
            >
              Aleatorio
            </button>
          </div>
          <input
            id="editUserOrgCode"
            type="text"
            value={orgCode}
            onChange={(e) => setOrgCode(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            disabled={saving}
            className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
          />
          <p className="text-xs text-text-muted">
            Si lo cambias, esta organización y sus vendedores tendrán que usar el nuevo al ingresar.
          </p>
        </div>
      )}

      {billing && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface-2/60 p-4">
          <p className="text-sm font-semibold text-text">Cobro de rifas</p>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={exempt}
              onChange={(e) => setExempt(e.target.checked)}
              disabled={saving}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#f5c542]"
            />
            <span>
              <span className="block text-sm font-medium text-text">Sin cobro</span>
              <span className="block text-xs text-text-muted">Sus rifas se activan solas y nunca paga (tu organización, amigos).</span>
            </span>
          </label>
          {!exempt && (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-text">Rifas de regalo</span>
                <span className="block text-xs text-text-muted">
                  Activa rifas sin pagar, de cualquier tamaño (ej. pagó en efectivo).
                  {billing.freeUsed ? " Ya usó su rifa gratis." : " Aún tiene su primera rifa gratis."}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  aria-label="Quitar una rifa de regalo"
                  onClick={() => setCredits((c) => Math.max(0, c - 1))}
                  disabled={saving || credits === 0}
                  className="h-9 w-9 rounded-full border border-line text-lg font-bold text-text disabled:opacity-40"
                >
                  −
                </button>
                <span aria-label="Rifas de regalo" className="w-6 text-center text-base font-bold text-gold-400">
                  {credits}
                </span>
                <button
                  type="button"
                  aria-label="Dar una rifa de regalo"
                  onClick={() => setCredits((c) => Math.min(1000, c + 1))}
                  disabled={saving}
                  className="h-9 w-9 rounded-full border border-line text-lg font-bold text-text disabled:opacity-40"
                >
                  +
                </button>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-text-muted">Código de acceso nuevo (opcional)</span>
        <CodeInput
          disabled={saving}
          autoFocus={false}
          onChange={setCode}
          resetSignal={resetSignal}
          fillValue={fill.value}
          fillSignal={fill.signal}
          ariaLabel="Código de acceso nuevo de 6 dígitos"
        />
        <AccessCodeTools
          code={code}
          disabled={saving}
          onGenerate={() => setFill((f) => ({ value: generateAccessCode(), signal: f.signal + 1 }))}
        />
        <p className="text-xs text-text-muted">
          Déjalo vacío para conservar el actual. Si lo cambias, esta persona tendrá que entrar de nuevo con el
          código nuevo.
        </p>
      </div>

      {formError && <p className="text-sm font-medium text-red-400">{formError}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !canSave}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? (
          <>
            <Spinner size={20} />
            Guardando…
          </>
        ) : (
          "Guardar cambios"
        )}
      </button>
    </BottomSheet>
  );
}
