"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

interface CodeInputProps {
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  onChange: (code: string) => void;
  /** Bump this value to clear the boxes and refocus the first one (e.g. after a submit error). */
  resetSignal?: number;
}

/** Six-box numeric code entry, shared by the login screen and the "create user" form. */
export function CodeInput({
  length = 6,
  disabled = false,
  autoFocus = true,
  ariaLabel = "Código de 6 dígitos",
  onChange,
  resetSignal,
}: CodeInputProps) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const focusInput = useCallback((index: number) => {
    inputsRef.current[index]?.focus();
    inputsRef.current[index]?.select();
  }, []);

  // Skips the initial mount (nothing to reset yet) and only reacts when the
  // parent actually bumps the signal.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setDigits(Array(length).fill(""));
    requestAnimationFrame(() => focusInput(0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  // Intentionally omits `onChange` from deps: it's typically a fresh closure
  // on every parent render, and we only want to notify on an actual edit.
  useEffect(() => {
    onChange(digits.join(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "");

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
        if (cursor >= length) break;
        next[cursor] = char;
        cursor += 1;
      }
      const lastFilled = Math.min(cursor, length - 1);
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
    if (e.key === "ArrowRight" && index < length - 1) {
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

  return (
    <div className="flex gap-2 sm:gap-3" role="group" aria-label={ariaLabel}>
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
          maxLength={length}
          value={digit}
          autoFocus={autoFocus && index === 0}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={(e) => handlePaste(index, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Dígito ${index + 1}`}
          className="h-14 w-11 rounded-2xl border-2 border-line bg-surface text-center text-2xl font-bold text-text outline-none transition-colors focus:border-gold-400 focus:bg-surface-2 disabled:opacity-50 sm:h-16 sm:w-12"
        />
      ))}
    </div>
  );
}
