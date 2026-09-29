"use client";

import { useState } from "react";
import { ApiError, createUser } from "@/lib/api-client";
import type { ManagedUserDTO } from "@/lib/types";
import { CodeInput } from "@/components/CodeInput";
import { isValidOrgCode, normalizeOrgCode, ORG_CODE_HELP, slugifyOrgCode } from "@/lib/orgCode";
import { Spinner } from "@/components/Spinner";

interface CreateUserSheetProps {
  open: boolean;
  /** e.g. "organizador" or "vendedor" — used only in copy. */
  targetRoleLabel: string;
  /** The superadmin creating an organizer also chooses the organization's code. */
  askOrgCode: boolean;
  onClose: () => void;
  onCreated: (user: ManagedUserDTO) => void;
}

const CODE_LENGTH = 6;

export function CreateUserSheet({ open, targetRoleLabel, askOrgCode, onClose, onCreated }: CreateUserSheetProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm"
      />
      <SheetContent targetRoleLabel={targetRoleLabel} askOrgCode={askOrgCode} onClose={onClose} onCreated={onCreated} />
    </div>
  );
}

function SheetContent({
  targetRoleLabel,
  askOrgCode,
  onClose,
  onCreated,
}: {
  targetRoleLabel: string;
  askOrgCode: boolean;
  onClose: () => void;
  onCreated: (user: ManagedUserDTO) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  // Follows the name until the person edits it by hand.
  const [orgCodeInput, setOrgCodeInput] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const orgCode = orgCodeInput ?? (name.trim() ? slugifyOrgCode(name) : "");
  const orgCodeValid = !askOrgCode || isValidOrgCode(normalizeOrgCode(orgCode));
  const isComplete = name.trim().length > 0 && code.length === CODE_LENGTH && orgCodeValid;

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setFormError("El código debe tener 6 dígitos.");
      return;
    }
    if (!orgCodeValid) {
      setFormError(`Código de organización inválido. ${ORG_CODE_HELP}`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await createUser({
        name: trimmedName,
        code,
        ...(askOrgCode ? { orgCode: normalizeOrgCode(orgCode) } : {}),
      });
      onCreated(created);
    } catch (err) {
      // 409 = code already in use by another user; the server message is
      // written to be shown to the person creating the account.
      setFormError(
        err instanceof ApiError ? err.message : "No se pudo crear la cuenta. Inténtalo de nuevo.",
      );
      setSaving(false);
      setCode("");
      setResetSignal((n) => n + 1);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Nuevo ${targetRoleLabel}`}
      onClick={(e) => e.stopPropagation()}
      className="relative z-10 max-h-[92dvh] w-full animate-sheet-up overflow-y-auto scrollbar-thin rounded-t-3xl border-t border-line bg-surface pb-safe shadow-card sm:max-h-[85vh] sm:max-w-md sm:rounded-3xl sm:border"
    >
      <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-line" />

      <div className="flex items-start justify-between px-5 pt-4">
        <div>
          <p className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text capitalize">
            Nuevo {targetRoleLabel}
          </p>
          <p className="text-sm text-text-muted">Crea el acceso con nombre y código.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90 disabled:opacity-50"
        >
          ✕
        </button>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="space-y-1.5">
          <label htmlFor="newUserName" className="text-sm font-medium text-text-muted">
            Nombre <span className="text-gold-400">*</span>
          </label>
          <input
            id="newUserName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Juan Gómez"
            autoComplete="name"
            disabled={saving}
            className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
          />
        </div>

        {askOrgCode && (
          <div className="space-y-1.5">
            <label htmlFor="newUserOrgCode" className="text-sm font-medium text-text-muted">
              Código de organización <span className="text-gold-400">*</span>
            </label>
            <input
              id="newUserOrgCode"
              type="text"
              value={orgCode}
              onChange={(e) => setOrgCodeInput(e.target.value)}
              placeholder="ej. rifas-norte"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              disabled={saving}
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400 disabled:opacity-60"
            />
            <p className="text-xs text-text-muted">
              Es lo que esta organización y sus vendedores escriben al ingresar, junto con su código de 6 dígitos.
              {" "}
              {ORG_CODE_HELP}
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-sm font-medium text-text-muted">
            Código de acceso <span className="text-gold-400">*</span>
          </span>
          <CodeInput
            disabled={saving}
            autoFocus={false}
            onChange={setCode}
            resetSignal={resetSignal}
            ariaLabel="Código de acceso de 6 dígitos"
          />
        </div>

        {formError && <p className="text-sm font-medium text-red-400">{formError}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving || !isComplete}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <>
              <Spinner size={20} />
              Creando…
            </>
          ) : (
            "Crear acceso"
          )}
        </button>
      </div>
    </div>
  );
}
