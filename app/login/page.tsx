"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { CrownIcon } from "@/components/icons/Crown";
import { CodeInput } from "@/components/CodeInput";
import { InstallAppButton } from "@/components/InstallAppButton";
import { normalizeOrgCode } from "@/lib/orgCode";
import { Spinner } from "@/components/Spinner";

const CODE_LENGTH = 6;
// The organization is remembered on the device so people only type it once.
const ORG_STORAGE_KEY = "ibirifas_org";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [orgCode, setOrgCode] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  const isComplete = code.length === CODE_LENGTH;

  // Prefill the organization from a shared link (?org=…) or from the last login,
  // then put the cursor where the person still has something to type.
  useEffect(() => {
    let initial = "";
    try {
      initial = normalizeOrgCode(new URLSearchParams(window.location.search).get("org") ?? "");
      if (!initial) initial = window.localStorage.getItem(ORG_STORAGE_KEY) ?? "";
    } catch {
      // Storage can be unavailable (private mode); the field just starts empty.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from browser-only sources
    setOrgCode(initial);
    const target = initial
      ? document.querySelector<HTMLInputElement>('input[aria-label="Dígito 1"]')
      : document.getElementById("orgCode");
    target?.focus();
  }, []);

  const handleCodeChange = useCallback((next: string) => {
    setCode(next);
    // Clearing the boxes after a failed attempt also reports "" — that must not
    // wipe the error message that was just shown. Only typing dismisses it.
    if (next !== "") setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!isComplete || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const normalizedOrg = normalizeOrgCode(orgCode);
        const user = await login(code, normalizedOrg);
        try {
          if (normalizedOrg) window.localStorage.setItem(ORG_STORAGE_KEY, normalizedOrg);
        } catch {
          // Not remembering is fine.
        }
        await refresh();
        router.push(user.role === "SUPERADMIN" ? "/usuarios" : "/rifas");
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 429
              ? "Demasiados intentos. Espera un momento e inténtalo de nuevo."
              : err.status === 401 || err.status === 400
                ? "Organización o código incorrectos. Verifica e inténtalo de nuevo."
                : err.message
            : "No se pudo conectar. Inténtalo de nuevo.";
        setError(message);
        setSubmitting(false);
        setResetSignal((n) => n + 1);
      }
    },
    [code, orgCode, isComplete, submitting, refresh, router],
  );

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col items-center justify-center overflow-hidden bg-bg px-6 pt-safe pb-safe">
      {/* Ambient gold glow, echoing the poster without literally copying it */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-10%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-gold-400/20 blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-15%] right-[-10%] h-[280px] w-[280px] rounded-full bg-gold-600/10 blur-[90px]"
      />

      <div className="relative flex w-full max-w-sm flex-col items-center">
        <CrownIcon className="mb-3 h-9 w-14 text-gold-400 drop-shadow-[0_0_18px_rgba(245,197,24,0.5)]" />
        <h1 className="font-[family-name:var(--font-heading)] text-4xl font-bold tracking-tight text-gold-400 drop-shadow-[0_2px_0_rgba(0,0,0,0.4)]">
          Ibirifas
        </h1>
        <p className="mt-1 text-sm font-medium text-text-muted">
          Panel del organizador
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-10 flex w-full flex-col items-center gap-6"
        >
          <div className="w-full space-y-1.5">
            <label htmlFor="orgCode" className="text-sm font-medium text-text-muted">
              Código de organización
            </label>
            <input
              id="orgCode"
              type="text"
              value={orgCode}
              onChange={(e) => {
                setOrgCode(e.target.value);
                setError(null);
              }}
              placeholder="ej. rifas-norte"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              enterKeyHint="next"
              disabled={submitting}
              className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none placeholder:text-text-muted focus:border-gold-400 disabled:opacity-60"
            />
          </div>

          <div className="w-full space-y-1.5">
            <span className="text-sm font-medium text-text-muted">Código de acceso</span>
            <CodeInput
              autoFocus={false}
              disabled={submitting}
              onChange={handleCodeChange}
              resetSignal={resetSignal}
              ariaLabel="Código de acceso de 6 dígitos"
            />
          </div>

          {error && (
            <p role="alert" className="animate-fade-in text-center text-sm font-medium text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!isComplete || submitting}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <>
                <Spinner size={20} />
                Ingresando…
              </>
            ) : (
              "Ingresar"
            )}
          </button>
        </form>

        <div className="mt-4 w-full">
          <InstallAppButton />
        </div>

        <p className="mt-6 max-w-xs text-center text-xs text-text-muted">
          Usa el código de organización y el de 6 dígitos que te compartió tu organizador. El celular
          recuerda la organización. ¿Eres el administrador de la plataforma? Déjalo vacío.
        </p>
        <a href="/terminos" className="mt-3 text-xs text-text-muted underline-offset-2 hover:underline">
          Términos de uso
        </a>
      </div>
    </div>
  );
}
