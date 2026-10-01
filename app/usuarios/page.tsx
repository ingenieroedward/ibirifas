"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { ApiError, getOrgSettings, getUsers, sendTestEmail, updateOrgSettings, updateUser } from "@/lib/api-client";
import type { ManagedUserDTO, OrgSettingsDTO } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { CreateUserSheet } from "@/components/CreateUserSheet";
import { EditUserSheet } from "@/components/EditUserSheet";
import { Spinner } from "@/components/Spinner";
import { formatDate } from "@/lib/format";

export default function UsersPage() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();
  const { show } = useToast();

  const [users, setUsers] = useState<ManagedUserDTO[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUserDTO | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // SELLER has no user-management screen (the API also 403s them).
  useEffect(() => {
    if (!authLoading && user?.role === "SELLER") {
      router.replace("/");
    }
  }, [authLoading, user, router]);

  // Local to this effect on purpose (not the shared useCallback below): the
  // initial load runs from an effect, and the retry button fetches separately.
  useEffect(() => {
    if (!user || user.role === "SELLER") return;
    let cancelled = false;

    async function bootstrapUsers() {
      try {
        const data = await getUsers();
        if (!cancelled) {
          setUsers(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "No se pudo cargar la lista. Verifica tu conexión.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    bootstrapUsers();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo cargar la lista. Verifica tu conexión.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  const handleCreated = useCallback((created: ManagedUserDTO) => {
    setUsers((current) => (current ? [created, ...current] : [created]));
    setSheetOpen(false);
  }, []);

  const handleSaved = useCallback(
    (updated: ManagedUserDTO) => {
      setUsers((current) => current?.map((u) => (u.id === updated.id ? updated : u)) ?? current);
      setEditing(null);
      show("Cambios guardados", "success");
    },
    [show],
  );

  const handleToggleActive = useCallback(
    async (target: ManagedUserDTO) => {
      const nextActive = !target.active;
      setUsers((current) =>
        current?.map((u) => (u.id === target.id ? { ...u, active: nextActive } : u)) ?? current,
      );
      try {
        const updated = await updateUser(target.id, { active: nextActive });
        setUsers((current) => current?.map((u) => (u.id === updated.id ? updated : u)) ?? current);
      } catch (err) {
        setUsers((current) =>
          current?.map((u) => (u.id === target.id ? target : u)) ?? current,
        );
        show(
          err instanceof ApiError ? err.message : "No se pudo actualizar. Inténtalo de nuevo.",
          "error",
        );
      }
    },
    [show],
  );

  if (authLoading || !user || user.role === "SELLER") {
    return (
      <div className="flex min-h-dvh flex-1 items-center justify-center py-24">
        <Spinner size={32} className="text-gold-400" />
      </div>
    );
  }

  const isSuperadmin = user.role === "SUPERADMIN";
  const title = isSuperadmin ? "Organizadores" : "Mi equipo";
  const subtitle = isSuperadmin
    ? "Cuentas de organizadores con acceso a la plataforma."
    : "Vendedores que pueden gestionar tus rifas.";
  const newButtonLabel = isSuperadmin ? "Nuevo organizador" : "Nuevo vendedor";
  const targetRoleLabel = isSuperadmin ? "organizador" : "vendedor";

  return (
    <div className="flex min-h-dvh flex-1 flex-col pb-10">
      <AppHeader
        userName={user.name}
        onLogout={handleLogout}
        title={title}
        subtitle={subtitle}
        backHref={isSuperadmin ? undefined : "/"}
        backLabel="Volver a tus rifas"
      />

      <main className="mt-4 flex-1 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-2xl">
          {!isSuperadmin && user.orgCode && <OrgCodeCard orgCode={user.orgCode} onCopied={show} />}
          {!isSuperadmin && <ReservationsCard onError={show} />}
          {!isSuperadmin && <EmailCard onError={show} />}

          {loading && (
            <div className="flex flex-1 items-center justify-center py-24">
              <Spinner size={32} className="text-gold-400" />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <p className="max-w-xs text-text-muted">{error}</p>
              <button
                type="button"
                onClick={loadUsers}
                className="rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 py-2.5 text-sm font-semibold text-[#241a02] shadow-gold active:scale-95"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && users && users.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <p className="max-w-xs text-text-muted">
                Aún no has creado ningún {targetRoleLabel}.
              </p>
            </div>
          )}

          {!loading && !error && users && users.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-bg-elevated px-4 py-3.5 shadow-card"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-text">{u.name}</p>
                    <p className="text-xs text-text-muted">
                      {isSuperadmin && u.orgCode ? `Organización: ${u.orgCode} · ` : ""}
                      Desde {formatDate(u.createdAt)} · Plan {u.plan}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing(u)}
                      aria-label={`Editar ${u.name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-line text-text-muted transition active:scale-90"
                    >
                      <EditIcon className="h-4 w-4" />
                    </button>
                    <ActiveToggle active={u.active} onToggle={() => handleToggleActive(u)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-6 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 text-2xl font-bold text-[#241a02] shadow-gold-lg transition active:scale-90 sm:right-6 lg:right-8"
        aria-label={newButtonLabel}
      >
        +
      </button>

      {editing && (
        <EditUserSheet
          key={editing.id}
          user={editing}
          targetRoleLabel={targetRoleLabel}
          canEditOrgCode={isSuperadmin}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}

      <CreateUserSheet
        open={sheetOpen}
        targetRoleLabel={targetRoleLabel}
        askOrgCode={isSuperadmin}
        onClose={() => setSheetOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

function OrgCodeCard({ orgCode, onCopied }: { orgCode: string; onCopied: (message: string, variant?: "success" | "error" | "info") => void }) {
  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onCopied(message, "success");
    } catch {
      onCopied("No se pudo copiar. Cópialo a mano.", "error");
    }
  };

  return (
    <section className="mb-4 rounded-2xl border border-gold-600/30 bg-bg-elevated p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Código de organización</p>
      <p className="mt-0.5 break-all font-[family-name:var(--font-heading)] text-2xl font-extrabold text-gold-400">
        {orgCode}
      </p>
      <p className="mt-1 text-xs text-text-muted">
        Tus vendedores lo escriben una sola vez al ingresar (el celular lo recuerda), junto con su código de 6 dígitos.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => copy(orgCode, "Código copiado")}
          className="h-10 flex-1 rounded-xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98]"
        >
          Copiar código
        </button>
        <button
          type="button"
          onClick={() => copy(`${window.location.origin}/login?org=${encodeURIComponent(orgCode)}`, "Enlace copiado")}
          className="h-10 flex-1 rounded-xl border border-line text-sm font-semibold text-text-muted transition active:scale-[0.98]"
        >
          Copiar enlace
        </button>
      </div>
    </section>
  );
}

/** The organization-wide default for reservations from public links; each raffle can still override it. */
function ReservationsCard({ onError }: { onError: (message: string, variant?: "success" | "error" | "info") => void }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrgSettings()
      .then((s) => {
        if (!cancelled) setAllowed(s.publicReservations);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (next: boolean) => {
    // Shown at once; put back if the server doesn't accept it.
    const previous = allowed;
    setAllowed(next);
    setSaving(true);
    try {
      const saved = await updateOrgSettings({ publicReservations: next });
      setAllowed(saved.publicReservations);
    } catch {
      setAllowed(previous);
      onError("No se pudo guardar el cambio. Inténtalo de nuevo.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (allowed === null) return null;

  return (
    <section className="mb-4 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          id="orgReservations"
          type="checkbox"
          checked={allowed}
          disabled={saving}
          onChange={(e) => void toggle(e.target.checked)}
          className="mt-1 h-5 w-5 accent-[#f5c542]"
        />
        <span>
          <span className="block text-sm font-semibold text-text">Reservas desde el enlace público</span>
          <span className="mt-0.5 block text-xs text-text-muted">
            Por defecto en todas tus rifas: quien abre el enlace puede apartar números o letras por su cuenta y tiene el plazo
            de pago de la rifa para pagar. Cada rifa puede cambiarlo en &quot;Editar rifa&quot; y necesita tener un plazo de pago.
          </span>
        </span>
      </label>
    </section>
  );
}

/** The organization's contact email (Reply-To of the emails buyers get) and a test email to check the setup. */
function EmailCard({ onError }: { onError: (message: string, variant?: "success" | "error" | "info") => void }) {
  const [settings, setSettings] = useState<OrgSettingsDTO | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getOrgSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setEmail(s.contactEmail ?? "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!settings) return null;
  const changed = email.trim() !== (settings.contactEmail ?? "");

  const save = async () => {
    setSaving(true);
    try {
      const saved = await updateOrgSettings({ contactEmail: email.trim() || null });
      setSettings(saved);
      setEmail(saved.contactEmail ?? "");
      onError("Correo guardado", "success");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "No se pudo guardar el correo.", "error");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await sendTestEmail();
      onError(`Correo de prueba enviado a ${settings.contactEmail}`, "success");
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "No se pudo enviar la prueba.", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="mb-4 space-y-3 rounded-2xl border border-line bg-bg-elevated p-4 shadow-card">
      <div>
        <p className="text-sm font-semibold text-text">Correos a compradores</p>
        <p className="mt-0.5 text-xs text-text-muted">
          {settings.mailEnabled
            ? "Quien reserva desde el enlace y deja su correo recibe avisos: reserva hecha, comprobante recibido, pago confirmado o rechazado y reserva liberada. Si responde, la respuesta llega a tu correo de contacto."
            : "El servidor todavía no tiene el correo configurado (SMTP), así que no se envían correos. Pídele a quien administra la app que lo active."}
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="contactEmail" className="text-sm font-medium text-text-muted">
          Tu correo de contacto
        </label>
        <input
          id="contactEmail"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Ej. rifas@tu-negocio.com"
          maxLength={120}
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-text outline-none focus:border-gold-400"
        />
      </div>
      <div className="flex gap-2">
        {changed && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex h-10 flex-1 items-center justify-center rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 text-sm font-bold text-[#241a02] transition active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? <Spinner size={16} /> : "Guardar"}
          </button>
        )}
        {settings.mailEnabled && settings.contactEmail && !changed && (
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="flex h-10 flex-1 items-center justify-center rounded-xl border border-gold-600/50 text-sm font-semibold text-gold-400 transition active:scale-[0.98] disabled:opacity-50"
          >
            {testing ? <Spinner size={16} /> : "Enviar correo de prueba"}
          </button>
        )}
      </div>
    </section>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ActiveToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={active}
      aria-label={active ? "Desactivar" : "Activar"}
      className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition active:scale-95 ${
        active ? "justify-end bg-gold-400" : "justify-start bg-surface-2 ring-1 ring-line"
      }`}
    >
      <span className="h-6 w-6 shrink-0 rounded-full bg-white shadow transition-transform" />
    </button>
  );
}
