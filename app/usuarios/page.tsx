"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { ApiError, getUsers, updateUser } from "@/lib/api-client";
import type { ManagedUserDTO } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { CreateUserSheet } from "@/components/CreateUserSheet";
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

      <main className="mt-4 flex-1 px-4">
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
                  <p className="truncate text-xs text-text-muted">
                    Desde {formatDate(u.createdAt)} · Plan {u.plan}
                  </p>
                </div>
                <ActiveToggle active={u.active} onToggle={() => handleToggleActive(u)} />
              </li>
            ))}
          </ul>
        )}
      </main>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-6 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-b from-gold-300 to-gold-500 text-2xl font-bold text-[#241a02] shadow-gold-lg transition active:scale-90"
        aria-label={newButtonLabel}
      >
        +
      </button>

      <CreateUserSheet
        open={sheetOpen}
        targetRoleLabel={targetRoleLabel}
        onClose={() => setSheetOpen(false)}
        onCreated={handleCreated}
      />
    </div>
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
      className={`relative h-7 w-12 shrink-0 rounded-full transition active:scale-95 ${
        active ? "bg-gold-400" : "bg-surface-2 ring-1 ring-line"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
          active ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
