"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import {
  ApiError,
  getRaffleById,
  getRaffles,
  updateNumber,
  updateNumbersBulk,
} from "@/lib/api-client";
import { downloadBlob, generateRaffleShareImage } from "@/lib/shareImage";
import { formatCurrency } from "@/lib/format";
import type { PaymentMethod, RaffleDTO, RaffleNumberDTO, UpdateNumberInput } from "@/lib/types";
import { DashboardHeader } from "@/components/DashboardHeader";
import { NumberGrid } from "@/components/NumberGrid";
import { NumberSheet } from "@/components/NumberSheet";
import { ParticipantsList } from "@/components/ParticipantsList";
import { PayManySheet } from "@/components/PayManySheet";
import { SellManySheet } from "@/components/SellManySheet";
import { Spinner } from "@/components/Spinner";

/** `undefined` in a PATCH input means "leave unchanged"; `null` means "clear". */
function resolveField<T>(input: T | null | undefined, current: T | null): T | null {
  return input === undefined ? current : input;
}

export default function RaffleDashboardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const raffleId = params.id;
  const { user, loading: authLoading, signOut } = useAuth();
  const { show } = useToast();

  const [raffle, setRaffle] = useState<RaffleDTO | null>(null);
  const [raffleLoading, setRaffleLoading] = useState(true);
  const [raffleError, setRaffleError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Only used to decide whether the "back to picker" link is worth showing.
  const [raffleCount, setRaffleCount] = useState(1);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [view, setView] = useState<"board" | "participants">("board");
  // "Pick several" mode: the numbers one buyer wants, sold in a single step.
  const [selecting, setSelecting] = useState(false);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [sellingMany, setSellingMany] = useState(false);
  const [payTarget, setPayTarget] = useState<{ buyerName: string; numbers: RaffleNumberDTO[] } | null>(null);

  // Middleware already redirects unauthenticated requests server-side; this
  // is the client-side fallback for when the session expires in-app.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // SUPERADMIN never has raffles of their own.
  useEffect(() => {
    if (!authLoading && user?.role === "SUPERADMIN") {
      router.replace("/usuarios");
    }
  }, [authLoading, user, router]);

  // Local to this effect on purpose (not a shared useCallback): the initial
  // load runs from an effect, and the retry button below fetches separately.
  useEffect(() => {
    if (!user || user.role === "SUPERADMIN") return;
    let cancelled = false;

    async function bootstrapRaffle() {
      try {
        const [data, summaries] = await Promise.all([
          getRaffleById(raffleId),
          getRaffles().catch(() => []),
        ]);
        if (!cancelled) {
          setRaffle(data);
          setRaffleCount(summaries.length || 1);
          setRaffleError(null);
        }
      } catch (err) {
        if (!cancelled) setRaffleError(raffleErrorMessage(err));
      } finally {
        if (!cancelled) setRaffleLoading(false);
      }
    }

    bootstrapRaffle();
    return () => {
      cancelled = true;
    };
  }, [user, raffleId]);

  const loadRaffle = useCallback(async () => {
    setRaffleLoading(true);
    setRaffleError(null);
    try {
      const data = await getRaffleById(raffleId);
      setRaffle(data);
    } catch (err) {
      setRaffleError(raffleErrorMessage(err));
    } finally {
      setRaffleLoading(false);
    }
  }, [raffleId]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  const handleDownloadImage = useCallback(async () => {
    if (!raffle || downloadingImage) return;
    setDownloadingImage(true);
    try {
      const blob = await generateRaffleShareImage(raffle);
      const safeName = raffle.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      downloadBlob(blob, `rifa-${safeName || raffle.id}.png`);
      show("Imagen descargada", "success");
    } catch {
      show("No se pudo generar la imagen. Inténtalo de nuevo.", "error");
    } finally {
      setDownloadingImage(false);
    }
  }, [raffle, downloadingImage, show]);

  const selected = raffle?.numbers.find((n) => n.id === selectedId) ?? null;

  const knownBuyers = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const n of raffle?.numbers ?? []) {
      const name = n.buyerName?.trim();
      if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [raffle]);

  const pickedNumbers = useMemo(
    () =>
      (raffle?.numbers ?? [])
        .filter((n) => pickedIds.has(n.id))
        .sort((a, b) => a.value - b.value),
    [raffle, pickedIds],
  );

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setPickedIds(new Set());
    setSellingMany(false);
  }, []);

  const handleGridSelect = useCallback(
    (n: RaffleNumberDTO) => {
      if (!selecting) {
        setSelectedId(n.id);
        return;
      }
      if (n.status !== "available") return;
      setPickedIds((current) => {
        const next = new Set(current);
        if (next.has(n.id)) next.delete(n.id);
        else next.add(n.id);
        return next;
      });
    },
    [selecting],
  );

  const handleLongPress = useCallback((n: RaffleNumberDTO) => {
    if (n.status !== "available") return;
    setSelecting(true);
    setPickedIds(new Set([n.id]));
  }, []);

  const mergeNumbers = useCallback((updated: RaffleNumberDTO[]) => {
    const byId = new Map(updated.map((n) => [n.id, n]));
    setRaffle((current) =>
      current ? { ...current, numbers: current.numbers.map((n) => byId.get(n.id) ?? n) } : current,
    );
  }, []);

  // After a 409 (someone else got there first): pull fresh data without the
  // full-page spinner, and drop picks that are no longer available.
  const refreshAfterConflict = useCallback(async () => {
    try {
      const fresh = await getRaffleById(raffleId);
      setRaffle(fresh);
      const stillFree = new Set(fresh.numbers.filter((n) => n.status === "available").map((n) => n.id));
      setPickedIds((current) => new Set([...current].filter((id) => stillFree.has(id))));
    } catch {
      // The toast already explains the conflict; a failed refresh just leaves stale data.
    }
  }, [raffleId]);

  const handleSellMany = useCallback(
    async (input: { buyerName: string; buyerPhone: string | null; photoDataUrl: string | null }) => {
      const ids = [...pickedIds];
      try {
        const updated = await updateNumbersBulk({ action: "sell", ids, ...input });
        mergeNumbers(updated);
        show(
          `${updated.length} ${updated.length === 1 ? "número vendido" : "números vendidos"} a ${input.buyerName}`,
          "success",
        );
        exitSelection();
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.", "error");
        if (err instanceof ApiError && err.status === 409) {
          setSellingMany(false);
          await refreshAfterConflict();
        }
        throw err;
      }
    },
    [pickedIds, mergeNumbers, show, exitSelection, refreshAfterConflict],
  );

  const handlePayMany = useCallback(
    async (method: PaymentMethod) => {
      if (!payTarget) return;
      try {
        const updated = await updateNumbersBulk({
          action: "pay",
          ids: payTarget.numbers.map((n) => n.id),
          paymentMethod: method,
        });
        mergeNumbers(updated);
        show(`${payTarget.buyerName} quedó al día`, "success");
        setPayTarget(null);
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.", "error");
        if (err instanceof ApiError && err.status === 409) {
          setPayTarget(null);
          await refreshAfterConflict();
        }
        throw err;
      }
    },
    [payTarget, mergeNumbers, show, refreshAfterConflict],
  );

  const handleSave = useCallback(
    async (id: string, input: UpdateNumberInput) => {
      const previous = raffle;
      if (!previous) return;

      const applyInput = (n: RaffleNumberDTO): RaffleNumberDTO => ({
        ...n,
        status: input.status,
        buyerName: resolveField(input.buyerName, n.buyerName),
        buyerPhone: resolveField(input.buyerPhone, n.buyerPhone),
        photoDataUrl: resolveField(input.photoDataUrl, n.photoDataUrl),
        notes: resolveField(input.notes, n.notes),
      });

      // Optimistic update so the tap feels instant.
      setRaffle({
        ...previous,
        numbers: previous.numbers.map((n) => (n.id === id ? applyInput(n) : n)),
      });

      try {
        const updated = await updateNumber(id, input);
        setRaffle((current) =>
          current
            ? { ...current, numbers: current.numbers.map((n) => (n.id === id ? updated : n)) }
            : current,
        );
        show(successMessage(updated), "success");
      } catch (err) {
        setRaffle(previous);
        show(
          err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.",
          "error",
        );
        throw err;
      }
    },
    [raffle, show],
  );

  if (authLoading || !user || user.role === "SUPERADMIN") {
    return <FullScreenSpinner />;
  }

  return (
    <div
      className={`flex min-h-dvh flex-1 flex-col ${selecting ? "pb-32" : "pb-10"}`}
      style={raffle?.themeBackground ? { backgroundColor: raffle.themeBackground } : undefined}
    >
      {raffle && (
        <DashboardHeader
          raffle={raffle}
          userName={user.name}
          role={user.role}
          showBackToPicker={raffleCount > 1}
          onLogout={handleLogout}
          onDownloadImage={handleDownloadImage}
          downloadingImage={downloadingImage}
        />
      )}

      <main className="mt-2 flex-1 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          {raffleLoading && <FullScreenSpinner />}

          {!raffleLoading && raffleError && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
              <p className="max-w-xs text-text-muted">{raffleError}</p>
              <button
                type="button"
                onClick={loadRaffle}
                className="rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-5 py-2.5 text-sm font-semibold text-[#241a02] shadow-gold active:scale-95"
              >
                Reintentar
              </button>
            </div>
          )}

          {!raffleLoading && !raffleError && raffle && (
            <>
              <div
                role="tablist"
                aria-label="Vista de la rifa"
                className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-line bg-bg-elevated p-1"
              >
                <ViewTab active={view === "board"} onClick={() => setView("board")}>
                  Tablero
                </ViewTab>
                <ViewTab
                  active={view === "participants"}
                  onClick={() => {
                    exitSelection();
                    setView("participants");
                  }}
                >
                  Participantes
                </ViewTab>
              </div>

              {view === "board" ? (
                <>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm text-text-muted">
                      {selecting
                        ? "Toca los números que se lleva el comprador."
                        : "¿Alguien se lleva varios? Mantén presionado un número."}
                    </p>
                    <button
                      type="button"
                      onClick={() => (selecting ? exitSelection() : setSelecting(true))}
                      className={`h-10 shrink-0 rounded-full px-4 text-xs font-semibold transition active:scale-95 ${
                        selecting
                          ? "border border-line text-text-muted"
                          : "border border-gold-600/50 text-gold-400"
                      }`}
                    >
                      {selecting ? "Cancelar" : "Seleccionar varios"}
                    </button>
                  </div>
                  <NumberGrid
                    numbers={raffle.numbers}
                    onSelect={handleGridSelect}
                    onLongPress={selecting ? undefined : handleLongPress}
                    themeNumberColor={raffle.themeNumberColor}
                    themeTextColor={raffle.themeTextColor}
                    selectedIds={selecting ? pickedIds : undefined}
                  />
                </>
              ) : (
                <ParticipantsList
                  numbers={raffle.numbers}
                  numberPrice={raffle.numberPrice}
                  onSelect={(n) => setSelectedId(n.id)}
                  onPayAll={(buyerName, numbers) => setPayTarget({ buyerName, numbers })}
                />
              )}
            </>
          )}
        </div>
      </main>

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-safe backdrop-blur">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-[family-name:var(--font-heading)] text-base font-bold text-text">
                {pickedIds.size} {pickedIds.size === 1 ? "seleccionado" : "seleccionados"}
              </p>
              <p className="text-xs text-text-muted">
                {formatCurrency(pickedIds.size * (raffle?.numberPrice ?? 0))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSellingMany(true)}
              disabled={pickedIds.size === 0}
              className="h-12 shrink-0 rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 px-6 text-sm font-bold text-[#241a02] shadow-gold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      <NumberSheet
        number={selected}
        numberPrice={raffle?.numberPrice ?? 0}
        knownBuyers={knownBuyers}
        onClose={() => setSelectedId(null)}
        onSave={handleSave}
      />

      {sellingMany && raffle && (
        <SellManySheet
          numbers={pickedNumbers}
          numberPrice={raffle.numberPrice}
          knownBuyers={knownBuyers}
          onClose={() => setSellingMany(false)}
          onConfirm={handleSellMany}
        />
      )}

      {payTarget && raffle && (
        <PayManySheet
          buyerName={payTarget.buyerName}
          numbers={payTarget.numbers}
          numberPrice={raffle.numberPrice}
          onClose={() => setPayTarget(null)}
          onConfirm={handlePayMany}
        />
      )}
    </div>
  );
}

function raffleErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return "Esta rifa no existe o ya no está disponible.";
    return err.message;
  }
  return "No se pudo cargar la rifa. Verifica tu conexión.";
}

function successMessage(number: RaffleNumberDTO): string {
  const value = number.value.toString().padStart(2, "0");
  if (number.status === "available") return `Número ${value} liberado`;
  if (number.status === "paid") return `Número ${value} marcado como pagado`;
  return `Número ${value} vendido`;
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`h-11 rounded-xl text-sm font-semibold transition active:scale-[0.98] ${
        active
          ? "bg-gradient-to-b from-gold-300 to-gold-500 text-[#241a02] shadow-gold"
          : "text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner size={32} className="text-gold-400" />
    </div>
  );
}
