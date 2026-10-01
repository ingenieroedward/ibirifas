"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { ApiError, changeMyCode, changeMyName } from "@/lib/api-client";
import { AppHeader } from "@/components/AppHeader";
import { CodeInput } from "@/components/CodeInput";
import { Spinner } from "@/components/Spinner";

const ROLE_LABEL = { SUPERADMIN: "Administrador de la plataforma", ORGANIZER: "Organizador", SELLER: "Vendedor" } as const;

/** "Mi cuenta": who is signed in and changing one's own 6-digit code. */
export default function AccountPage() {
  const router = useRouter();
  const { user, loading, signOut, refresh } = useAuth();
  const { show } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center py-24">
        <Spinner size={32} className="text-gold-400" />
      </div>
    );
  }

  const submit = async () => {
    setError(null);
    if (current.length !== 6) return setError("Escribe tu código actual.");
    if (next.length !== 6) return setError("Escribe el código nuevo de 6 dígitos.");
    if (next !== repeat) return setError("El código nuevo y su confirmación no coinciden.");
    setSaving(true);
    try {
      await changeMyCode(current, next);
      show("Código cambiado. Úsalo la próxima vez que entres.", "success");
      setCurrent("");
      setNext("");
      setRepeat("");
      setReset((r) => r + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el código. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader userName={user.name} onLogout={handleLogout} title="Mi cuenta" backHref="/" backLabel="Volver" />
      <main className="mt-4 flex-1 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-md space-y-4">
          <section className="space-y-1 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
            <p className="font-[family-name:var(--font-heading)] text-lg font-bold text-text">{user.name}</p>
            <p className="text-sm text-text-muted">
              {ROLE_LABEL[user.role]}
              {user.orgCode ? ` · organización «${user.orgCode}»` : ""}
            </p>
          </section>

          <NameCard
            current={user.name}
            onSaved={async () => {
              await refresh();
              show("Nombre actualizado.", "success");
            }}
          />

          <section className="space-y-4 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
            <div>
              <h2 className="text-sm font-semibold text-text">Cambiar mi código</h2>
              <p className="mt-0.5 text-xs text-text-muted">
                El código de 6 dígitos con el que entras. Al cambiarlo se cierran tus sesiones en otros dispositivos; en este
                sigues adentro.
              </p>
            </div>
            <div className="space-y-1.5" data-field="current">
              <p className="text-sm font-medium text-text-muted">Código actual</p>
              <CodeInput ariaLabel="Código actual" autoFocus={false} disabled={saving} onChange={setCurrent} resetSignal={reset} />
            </div>
            <div className="space-y-1.5" data-field="new">
              <p className="text-sm font-medium text-text-muted">Código nuevo</p>
              <CodeInput ariaLabel="Código nuevo" autoFocus={false} disabled={saving} onChange={setNext} resetSignal={reset} />
            </div>
            <div className="space-y-1.5" data-field="repeat">
              <p className="text-sm font-medium text-text-muted">Repite el código nuevo</p>
              <CodeInput ariaLabel="Repite el código nuevo" autoFocus={false} disabled={saving} onChange={setRepeat} resetSignal={reset} />
            </div>
            <p className="text-xs text-text-muted">Evita códigos fáciles como 111111 o 123456.</p>
            {error && (
              <p role="alert" className="text-sm font-medium text-red-400">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:opacity-50"
            >
              {saving ? <Spinner size={18} /> : "Cambiar código"}
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}

/** Changing one's own name: what the team sees in the header, in "vendido por" and in notifications. */
function NameCard({ current, onSaved }: { current: string; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== current;

  const save = async () => {
    setError(null);
    if (name.trim().length < 2) return setError("Escribe tu nombre (mínimo 2 letras).");
    setSaving(true);
    try {
      await changeMyName(name.trim());
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
      <div>
        <h2 className="text-sm font-semibold text-text">Mi nombre</h2>
        <p className="mt-0.5 text-xs text-text-muted">Así te ve tu equipo: arriba en la app, en &quot;vendido por&quot; y en las notificaciones.</p>
      </div>
      <input
        id="myName"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={80}
        autoComplete="name"
        aria-label="Mi nombre"
        className="h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-text outline-none focus:border-gold-400"
      />
      {error && (
        <p role="alert" className="text-sm font-medium text-red-400">
          {error}
        </p>
      )}
      {changed && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] transition active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? <Spinner size={16} /> : "Guardar nombre"}
        </button>
      )}
    </section>
  );
}
