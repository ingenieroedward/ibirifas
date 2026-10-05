"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { acceptTerms } from "@/lib/api-client";
import { CrownIcon } from "@/components/icons/Crown";
import { Spinner } from "@/components/Spinner";
import { TermsContent } from "@/components/TermsContent";

/**
 * Covers the app until an organizer accepts the current terms of use: they, not Ibirifas, answer for their
 * raffles. Their sellers and the platform owner never see it; public pages and the login are left alone.
 */
export function TermsGate() {
  const { user, refresh, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user?.needsTerms || pathname.startsWith("/p/") || pathname === "/terminos" || pathname === "/login") return null;

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      await acceptTerms();
      await refresh();
    } catch {
      setError("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-title"
      className="fixed inset-0 z-[100] flex flex-col bg-bg/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 pt-safe">
        <div className="flex items-center justify-center gap-2 py-4">
          <CrownIcon className="h-5 w-8 text-gold-400" />
          <span className="font-[family-name:var(--font-heading)] text-lg font-bold text-gold-400">Ibirifas</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-line bg-bg-elevated p-5 shadow-card">
          <h1 id="terms-title" className="font-[family-name:var(--font-heading)] text-2xl font-bold text-text">
            Antes de seguir
          </h1>
          <p className="mb-4 mt-1 text-sm text-text-muted">
            Lee y acepta los términos y condiciones. En resumen: Ibirifas es tu herramienta y tú respondes por tus rifas.
          </p>
          <TermsContent />
        </div>
        <div className="space-y-3 py-4 pb-safe">
          <label className="flex items-start gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={saving}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-gold-400)]"
            />
            <span>Leí y acepto los términos y condiciones, y entiendo que soy responsable de mis rifas.</span>
          </label>
          {error && (
            <p role="alert" className="text-sm font-medium text-red-400">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void signOut().then(() => router.push("/login"))}
              disabled={saving}
              className="h-12 shrink-0 rounded-2xl border border-line px-5 text-sm font-semibold text-text-muted disabled:opacity-50"
            >
              Salir
            </button>
            <button
              type="button"
              onClick={() => void accept()}
              disabled={!agreed || saving}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-base font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <Spinner size={18} /> : "Aceptar y continuar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
