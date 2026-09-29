"use client";

import { useState } from "react";
import { ApiError, updateUser } from "@/lib/api-client";
import type { ManagedUserDTO, UpdateUserInput } from "@/lib/types";
import { BottomSheet } from "@/components/BottomSheet";
import { CodeInput } from "@/components/CodeInput";
import { isValidOrgCode, normalizeOrgCode, ORG_CODE_HELP } from "@/lib/orgCode";
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
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const nameChanged = name.trim() !== user.name;
  const codeChanged = code.length > 0;
  const orgCodeChanged = canEditOrgCode && normalizeOrgCode(orgCode) !== (user.orgCode ?? "");
  const canSave = (nameChanged || codeChanged || orgCodeChanged) && name.trim().length > 0;

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
          <label htmlFor="editUserOrgCode" className="text-sm font-medium text-text-muted">
            Código de organización
          </label>
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

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-text-muted">Código de acceso nuevo (opcional)</span>
        <CodeInput
          disabled={saving}
          autoFocus={false}
          onChange={setCode}
          resetSignal={resetSignal}
          ariaLabel="Código de acceso nuevo de 6 dígitos"
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
