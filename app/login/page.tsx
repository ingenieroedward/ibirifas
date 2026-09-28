"use client";

import {
  useCallback,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ApiError, login } from "@/lib/api-client";
import { useAuth } from "@/contexts/AuthContext";
import { CrownIcon } from "@/components/icons/Crown";
import { Spinner } from "@/components/Spinner";

const CODE_LENGTH = 6;

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");
  const isComplete = code.length === CODE_LENGTH;

  const focusInput = (index: number) => {
    inputsRef.current[index]?.focus();
    inputsRef.current[index]?.select();
  };

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "");
    setError(null);

    if (value.length === 0) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }

    // Handles both a single keystroke and a fast multi-digit autofill.
    const chars = value.split("");
    setDigits((prev) => {
      const next = [...prev];
      let cursor = index;
      for (const char of chars) {
        if (cursor >= CODE_LENGTH) break;
        next[cursor] = char;
        cursor += 1;
      }
      const lastFilled = Math.min(cursor, CODE_LENGTH - 1);
      requestAnimationFrame(() => focusInput(lastFilled));
      return next;
    });
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index] === "" && index > 0) {
        e.preventDefault();
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
        focusInput(index - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusInput(index - 1);
    }
    if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      e.preventDefault();
      focusInput(index + 1);
    }
  };

  const handlePaste = (index: number, e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!text) return;
    e.preventDefault();
    handleChange(index, text);
  };

  const resetCode = () => {
    setDigits(Array(CODE_LENGTH).fill(""));
    focusInput(0);
  };

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!isComplete || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await login(code);
        await refresh();
        router.push("/");
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 429
              ? "Demasiados intentos. Espera un momento e inténtalo de nuevo."
              : err.status === 401 || err.status === 400
                ? "Código incorrecto. Verifica e inténtalo de nuevo."
                : err.message
            : "No se pudo conectar. Inténtalo de nuevo.";
        setError(message);
        setSubmitting(false);
        resetCode();
      }
    },
    [code, isComplete, submitting, refresh, router],
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
          <div>
            <div className="flex gap-2 sm:gap-3" role="group" aria-label="Código de acceso de 6 dígitos">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputsRef.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  maxLength={CODE_LENGTH}
                  value={digit}
                  autoFocus={index === 0}
                  disabled={submitting}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={(e) => handlePaste(index, e)}
                  onFocus={(e) => e.target.select()}
                  aria-label={`Dígito ${index + 1}`}
                  className="h-14 w-11 rounded-2xl border-2 border-line bg-surface text-center text-2xl font-bold text-text outline-none transition-colors focus:border-gold-400 focus:bg-surface-2 disabled:opacity-50 sm:h-16 sm:w-12"
                />
              ))}
            </div>
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

        <p className="mt-8 max-w-xs text-center text-xs text-text-muted">
          Ingresa el código de 6 dígitos que te compartió el administrador de la rifa.
        </p>
      </div>
    </div>
  );
}
