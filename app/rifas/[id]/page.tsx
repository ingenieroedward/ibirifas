"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import {
  ApiError,
  deleteRaffle,
  drawStage,
  exportRaffleExcel,
  getRaffleById,
  getRaffles,
  payQuotas,
  setPublicLink,
  setRaffleStatus,
  updateRaffle,
  updateNumber,
  updateNumbersBulk,
  undoStage,
  type NumbersSince,
} from "@/lib/api-client";
import {
  canShareImageFiles,
  downloadBlob,
  generateRaffleShareImage,
  isTouchDevice,
  shareImageFile,
} from "@/lib/shareImage";
import { formatCurrency, formatNumberValue } from "@/lib/format";
import { groupLabelOf, makePricer, numbersOfGroup } from "@/lib/groups";
import { buildAvailabilityText } from "@/lib/shareText";
import { drawCutoff, isOverdue } from "@/lib/holds";
import { useRaffleLive } from "@/lib/useRaffleLive";
import { amountRemaining, discountNow, installmentPrices, stageSettingsOf, standingOf, type StageSettings } from "@/lib/stages";
import type {
  BulkActionBody,
  BulkNumberInput,
  PaymentMethod,
  PublicLinkAction,
  QuotaAction,
  RaffleDTO,
  RaffleGroupDTO,
  RaffleNumberDTO,
  RaffleStageDTO,
  UpdateNumberInput,
} from "@/lib/types";
import { CloseRaffleSheet } from "@/components/CloseRaffleSheet";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DeleteRaffleSheet } from "@/components/DeleteRaffleSheet";
import { DrawDateSheet } from "@/components/DrawDateSheet";
import { ImagePreviewSheet } from "@/components/ImagePreviewSheet";
import { PublicLinkSheet, publicLinkUrl } from "@/components/PublicLinkSheet";
import { GroupedBoard } from "@/components/GroupedBoard";
import { GroupSheet } from "@/components/GroupSheet";
import { NumberGrid } from "@/components/NumberGrid";
import { NumberSheet } from "@/components/NumberSheet";
import { ParticipantsList } from "@/components/ParticipantsList";
import { PayManySheet } from "@/components/PayManySheet";
import { SellersReport } from "@/components/SellersReport";
import { SellManySheet } from "@/components/SellManySheet";
import { Spinner } from "@/components/Spinner";
import { StagesPanel } from "@/components/StagesPanel";
import { ActivationSheet } from "@/components/ActivationSheet";

/** For useSyncExternalStore values that never change while the page is open (browser capabilities). */
const subscribeNever = () => () => {};

/** The newest `updatedAt` among the numbers — where a full load leaves the board in sync with the server. */
function newestUpdate(numbers: RaffleNumberDTO[]): string | null {
  let newest: string | null = null;
  for (const n of numbers) if (!newest || n.updatedAt > newest) newest = n.updatedAt;
  return newest;
}

/** What collecting a buyer's installments would cost: what's due now, the next installment of each, everything. */
function stagePayAmounts(numbers: RaffleNumberDTO[], settings: StageSettings) {
  const prices = installmentPrices(settings.stages);
  let due = 0;
  let next = 0;
  let all = 0;
  for (const n of numbers) {
    due += standingOf(n.quotas, settings).due;
    next += prices[n.quotas.length] ?? 0;
    all += amountRemaining(n.quotas, settings.stages) - discountNow(n.quotas, settings);
  }
  return { due, next, all };
}

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
  // The lettered set whose sheet is open (raffles sold in sets).
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [publicLinkOpen, setPublicLinkOpen] = useState(false);
  // Billing: a raffle sells only once activated (lib/billing.ts).
  const [activationOpen, setActivationOpen] = useState(false);
  const [settingDrawDate, setSettingDrawDate] = useState(false);
  const [closingRaffle, setClosingRaffle] = useState(false);
  const [deletingRaffle, setDeletingRaffle] = useState(false);
  // Only used to decide whether the "back to picker" link is worth showing.
  const [raffleCount, setRaffleCount] = useState(1);
  const [downloadingImage, setDownloadingImage] = useState(false);
  // The finished poster, shown for saving when the share sheet couldn't open straight away.
  const [imagePreview, setImagePreview] = useState<{ blob: Blob; url: string; filename: string; title: string } | null>(null);
  // Decided after mount: the server render can't know what this browser supports.
  const canShareImage = useSyncExternalStore(subscribeNever, canShareImageFiles, () => false);
  const closeImagePreview = useCallback(() => {
    setImagePreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);
  const [view, setView] = useState<"board" | "participants">("board");
  // Inside "Participantes": who bought, or who sold.
  const [people, setPeople] = useState<"buyers" | "sellers">("buyers");
  // Read once when the board opens; overdue holds are counted against this moment.
  const [openedAt] = useState(() => Date.now());
  // "Pick several" mode: the numbers one buyer wants, sold in a single step.
  const [selecting, setSelecting] = useState(false);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [sellingMany, setSellingMany] = useState(false);
  const [payTarget, setPayTarget] = useState<{ buyerName: string; numbers: RaffleNumberDTO[] } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // How far this board is known to be in sync with the server (see useRaffleLive).
  const syncCursor = useRef<string | null>(null);
  // Mirrors `raffle` for handlers that need "what did the board look like just before".
  const raffleRef = useRef<RaffleDTO | null>(null);
  useEffect(() => {
    raffleRef.current = raffle;
  }, [raffle]);

  /** Replace the whole board from a full load and mark it in sync. */
  const applyFullLoad = useCallback((data: RaffleDTO) => {
    syncCursor.current = newestUpdate(data.numbers);
    setRaffle(data);
  }, []);

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
          applyFullLoad(data);
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
  }, [user, raffleId, applyFullLoad]);

  // Back from paying the activation (pagoradar's page sends people here with ?activacion=1).
  const returnHandled = useRef(false);
  useEffect(() => {
    if (!raffle || returnHandled.current) return;
    returnHandled.current = true;
    if (!raffle.active && new URLSearchParams(window.location.search).get("activacion") === "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time reaction to the return URL
      setActivationOpen(true);
    }
  }, [raffle]);

  const loadRaffle = useCallback(async () => {
    setRaffleLoading(true);
    setRaffleError(null);
    try {
      const data = await getRaffleById(raffleId);
      applyFullLoad(data);
    } catch (err) {
      setRaffleError(raffleErrorMessage(err));
    } finally {
      setRaffleLoading(false);
    }
  }, [raffleId, applyFullLoad]);

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  // The raffle and what is still free, as a message to paste into a chat.
  const handleCopyText = useCallback(async () => {
    if (!raffle) return;
    const link = raffle.publicToken ? publicLinkUrl(raffle.publicToken) : null;
    const text = buildAvailabilityText(raffle, link);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard blocked (some in-app browsers): the old textarea trick still works from a tap.
      const box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      if (!ok) {
        show("No se pudo copiar el texto. Inténtalo de nuevo.", "error");
        return;
      }
    }
    show("Texto copiado: pégalo en tu chat", "success");
  }, [raffle, show]);

  const handleDownloadImage = useCallback(async () => {
    if (!raffle || downloadingImage) return;
    setDownloadingImage(true);
    try {
      const blob = await generateRaffleShareImage(raffle);
      const safeName = raffle.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const filename = `rifa-${safeName || raffle.id}.png`;

      const openPreview = () =>
        setImagePreview((previous) => {
          if (previous) URL.revokeObjectURL(previous.url);
          return { blob, url: URL.createObjectURL(blob), filename, title: raffle.name };
        });

      if (canShareImageFiles()) {
        // Phones: straight to the system share sheet (Fotos, WhatsApp…).
        const outcome = await shareImageFile(blob, filename, raffle.name);
        if (outcome === "failed") openPreview();
      } else if (isTouchDevice()) {
        // A phone without file sharing: a preview to save from beats a bare download.
        openPreview();
      } else {
        downloadBlob(blob, filename);
        show("Imagen descargada", "success");
      }
    } catch {
      show("No se pudo generar la imagen. Inténtalo de nuevo.", "error");
    } finally {
      setDownloadingImage(false);
    }
  }, [raffle, downloadingImage, show]);

  const selected = raffle?.numbers.find((n) => n.id === selectedId) ?? null;
  const hasGroups = (raffle?.groups.length ?? 0) > 0;
  const raffleClosed = raffle?.status === "closed";
  const isOrganizer = user?.role === "ORGANIZER";
  // Numbers outside every set: sold one by one, at the raffle's number price.
  const looseNumbers = useMemo(
    () => (raffle?.numbers ?? []).filter((n) => n.groupId === null),
    [raffle],
  );
  // Sold-but-unpaid numbers past the raffle's deadline (a closed raffle has no deadline to keep).
  const overdueHolds = useMemo(
    () =>
      raffle && raffle.status === "active" && raffle.holdDays
        ? raffle.numbers.filter((n) => isOverdue(n, raffle.holdDays, openedAt, raffle.stages.length === 0 ? raffle.drawDate : null))
        : [],
    [raffle, openedAt],
  );
  const overdueBuyers = useMemo(
    () => new Set(overdueHolds.map((n) => (n.buyerName ?? "").trim().toLowerCase())).size,
    [overdueHolds],
  );

  const pricer = useMemo(() => (raffle ? makePricer(raffle) : () => 0), [raffle]);
  // A raffle by stages: paid in installments, one draw per stage.
  const stageSettings = useMemo(() => (raffle ? stageSettingsOf(raffle) : null), [raffle]);
  const stageWinners = useMemo(
    () => new Set((raffle?.stages ?? []).filter((s) => s.outcome === "won").map((s) => s.winnerValue!)),
    [raffle],
  );
  const openGroup = raffle?.groups.find((g) => g.id === openGroupId) ?? null;
  const openGroupMembers = useMemo(
    () => (raffle && openGroupId ? numbersOfGroup(raffle.numbers, openGroupId) : []),
    [raffle, openGroupId],
  );

  /** A number opened from anywhere (board, participants): sets open as a whole. */
  const openNumber = useCallback(
    (n: RaffleNumberDTO) => {
      // Once closed nothing new is sold; sold numbers still open (to record a payment).
      if (raffleRef.current?.status === "closed" && n.status === "available") {
        show("La rifa está cerrada: ya no se venden números.", "info");
        return;
      }
      if (n.groupId) setOpenGroupId(n.groupId);
      else setSelectedId(n.id);
    },
    [show],
  );

  const openGroupCard = useCallback(
    (g: RaffleGroupDTO) => {
      const members = numbersOfGroup(raffleRef.current?.numbers ?? [], g.id);
      if (raffleRef.current?.status === "closed" && members.every((n) => n.status === "available")) {
        show("La rifa está cerrada: ya no se venden conjuntos.", "info");
        return;
      }
      setOpenGroupId(g.id);
    },
    [show],
  );

  const handleCloseRaffle = useCallback(
    async (winnerValue: number | null) => {
      try {
        const updated = await setRaffleStatus(raffleId, { status: "closed", winnerValue });
        setRaffle((current) =>
          current ? { ...current, status: updated.status, winnerValue: updated.winnerValue, closedAt: updated.closedAt } : current,
        );
        // Nothing new can be sold any more: drop a half-made selection.
        setSelecting(false);
        setPickedIds(new Set());
        setSellingMany(false);
        setClosingRaffle(false);
        show("Rifa cerrada", "success");
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo cerrar la rifa. Inténtalo de nuevo.", "error");
        throw err;
      }
    },
    [raffleId, show],
  );

  const handlePublicLinkChange = useCallback(
    async (action: PublicLinkAction) => {
      const publicToken = await setPublicLink(raffleId, action);
      setRaffle((current) => (current ? { ...current, publicToken } : current));
    },
    [raffleId],
  );

  const handleReopenRaffle = useCallback(async () => {
    try {
      const updated = await setRaffleStatus(raffleId, { status: "active" });
      setRaffle((current) =>
        current ? { ...current, status: updated.status, winnerValue: null, closedAt: null } : current,
      );
      show("Rifa reabierta", "success");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "No se pudo reabrir la rifa.", "error");
    }
  }, [raffleId, show]);

  const [exporting, setExporting] = useState(false);
  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    try {
      const { blob, filename } = await exportRaffleExcel(raffleId);
      downloadBlob(blob, filename);
      show("Excel descargado", "success");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "No se pudo generar el Excel. Inténtalo de nuevo.", "error");
    } finally {
      setExporting(false);
    }
  }, [raffleId, show]);

  const handleDeleteRaffle = useCallback(async () => {
    try {
      await deleteRaffle(raffleId);
      router.replace("/");
    } catch (err) {
      show(err instanceof ApiError ? err.message : "No se pudo eliminar la rifa.", "error");
      throw err;
    }
  }, [raffleId, router, show]);

  // The raffle was closed or reopened by someone else (or in another tab).
  const handleRaffleState = useCallback(
    (state: NumbersSince["raffle"]) => {
      const current = raffleRef.current;
      const stagesChanged = JSON.stringify(current?.stages ?? []) !== JSON.stringify(state.stages ?? []);
      if (!current || (current.status === state.status && current.winnerValue === state.winnerValue && !stagesChanged)) return;
      setRaffle({ ...current, status: state.status, winnerValue: state.winnerValue, stages: state.stages ?? current.stages });
      if (current.status !== state.status) {
        show(state.status === "closed" ? "La rifa se cerró" : "La rifa se reabrió", "info");
        if (state.status === "closed") {
          setPickedIds(new Set());
          setSelecting(false);
          setSellingMany(false);
        }
      }
    },
    [show],
  );

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
      if (raffleRef.current && !raffleRef.current.active) {
        setActivationOpen(true);
        return;
      }
      if (!selecting) {
        openNumber(n);
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
    [selecting, openNumber],
  );

  const handleLongPress = useCallback((n: RaffleNumberDTO) => {
    if (n.status !== "available" || raffleRef.current?.status === "closed") return;
    if (raffleRef.current && !raffleRef.current.active) {
      setActivationOpen(true);
      return;
    }
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
      applyFullLoad(fresh);
      const stillFree = new Set(fresh.numbers.filter((n) => n.status === "available").map((n) => n.id));
      setPickedIds((current) => new Set([...current].filter((id) => stillFree.has(id))));
    } catch {
      // The toast already explains the conflict; a failed refresh just leaves stale data.
    }
  }, [raffleId, applyFullLoad]);

  // The reload button: a full, silent refresh (board stays on screen).
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const fresh = await getRaffleById(raffleId);
      applyFullLoad(fresh);
      const stillFree = new Set(fresh.numbers.filter((n) => n.status === "available").map((n) => n.id));
      const kept = [...pickedIds].filter((id) => stillFree.has(id));
      setPickedIds(new Set(kept));
      if (kept.length === 0) setSellingMany(false);
      show("Tablero actualizado", "success");
    } catch {
      show("No se pudo actualizar. Revisa tu conexión.", "error");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, raffleId, applyFullLoad, pickedIds, show]);

  // Changes made by other people, arriving live.
  const handleLiveChanges = useCallback(
    (changed: RaffleNumberDTO[]) => {
      const before = new Map((raffleRef.current?.numbers ?? []).map((n) => [n.id, n]));
      mergeNumbers(changed);

      // Only announce what someone else did (our own saves come back through
      // here too, already applied locally, so their status doesn't differ).
      const byOthers = changed.filter((n) => {
        const was = before.get(n.id);
        return was !== undefined && was.status !== n.status && n.updatedByName !== user?.name;
      });

      // Numbers we had picked that just got taken can't be sold any more.
      const taken = changed.filter((n) => pickedIds.has(n.id) && n.status !== "available");
      if (taken.length > 0) {
        const remaining = [...pickedIds].filter((id) => !taken.some((n) => n.id === id));
        setPickedIds(new Set(remaining));
        if (remaining.length === 0) setSellingMany(false);
      }

      const messages: string[] = [];
      // A set changes hands as one: say "el conjunto A", not ten numbers.
      const sets = new Map<string, RaffleNumberDTO>();
      const loose: RaffleNumberDTO[] = [];
      for (const n of byOthers) {
        if (n.groupId) sets.set(n.groupId, n);
        else loose.push(n);
      }
      const verbOf = (n: RaffleNumberDTO) =>
        n.status === "paid" ? "cobró" : n.status === "occupied" ? (n.online ? "reservó" : "vendió") : "liberó";
      const who = (n: RaffleNumberDTO) => n.updatedByName ?? (n.online ? `${n.buyerName ?? "Alguien"} (en línea)` : "Alguien");
      for (const [groupId, n] of sets) {
        const label = groupLabelOf(raffleRef.current?.groups ?? [], groupId) ?? "";
        messages.push(`${who(n)} ${verbOf(n)} el conjunto ${label}`.trim());
      }
      if (loose.length === 1) {
        const n = loose[0]!;
        messages.push(`${who(n)} ${verbOf(n)} el ${formatNumberValue(n.value)}`);
      } else if (loose.length > 1) {
        messages.push(`${loose.length} números actualizados por el equipo`);
      }
      if (taken.length > 0) {
        const list = taken.map((n) => formatNumberValue(n.value)).join(", ");
        messages.push(`${taken.length === 1 ? "El" : "Los"} ${list} ya no ${taken.length === 1 ? "está disponible" : "están disponibles"}`);
      }
      if (messages.length > 0) show(messages.join(" · "), "info");
    },
    [mergeNumbers, pickedIds, show, user?.name],
  );

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

  /** Installments of a raffle by stages, for one number or all of a buyer's. */
  const handleQuotas = useCallback(
    async (ids: string[], action: QuotaAction, method: PaymentMethod) => {
      try {
        const updated = await payQuotas(ids, action, method);
        mergeNumbers(updated);
        show(
          action === "undo"
            ? "Cuota deshecha"
            : updated.every((n) => n.status === "paid")
              ? updated.length === 1
                ? `${formatNumberValue(updated[0]!.value)} pagado completo`
                : "Números pagados completos"
              : "Cuota cobrada",
          "success",
        );
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.", "error");
        if (err instanceof ApiError && err.status === 409) await refreshAfterConflict();
        throw err;
      }
    },
    [mergeNumbers, show, refreshAfterConflict],
  );

  const handlePayMany = useCallback(
    async (method: PaymentMethod, action?: Exclude<QuotaAction, "undo">) => {
      if (!payTarget) return;
      if (action) {
        // A raffle by stages: installments instead of "paid".
        await handleQuotas(payTarget.numbers.map((n) => n.id), action, method);
        setPayTarget(null);
        return;
      }
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
    [payTarget, mergeNumbers, show, refreshAfterConflict, handleQuotas],
  );

  const handleRejectReceipt = useCallback(
    async (id: string, reason: string | null) => {
      try {
        const updated = await updateNumbersBulk({ action: "rejectReceipt", ids: [id], reason });
        mergeNumbers(updated);
        show(updated[0]?.buyerEmail ? "Comprobante rechazado: le avisamos por correo" : "Comprobante rechazado", "success");
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo rechazar el comprobante.", "error");
        if (err instanceof ApiError && err.status === 409) await refreshAfterConflict();
        throw err;
      }
    },
    [mergeNumbers, show, refreshAfterConflict],
  );

  const replaceStage = useCallback((stage: RaffleStageDTO) => {
    setRaffle((current) =>
      current ? { ...current, stages: current.stages.map((s) => (s.id === stage.id ? stage : s)) } : current,
    );
  }, []);

  const handleDrawStage = useCallback(
    async (stage: RaffleStageDTO, winnerValue: number) => {
      try {
        const result = await drawStage(raffleId, stage.id, winnerValue);
        replaceStage(result.stage);
        if (result.closed) {
          // The last draw closes the raffle: reload to pick up its final state.
          const fresh = await getRaffleById(raffleId);
          applyFullLoad(fresh);
        }
        show(
          result.stage.outcome === "won"
            ? `${stage.label}: ganó ${result.stage.winnerName ?? "su comprador"}`
            : `${stage.label}: el premio queda en la casa`,
          "success",
        );
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo registrar el resultado.", "error");
        throw err;
      }
    },
    [raffleId, replaceStage, applyFullLoad, show],
  );

  const handleUndoStage = useCallback(
    async (stage: RaffleStageDTO) => {
      try {
        const result = await undoStage(raffleId, stage.id);
        replaceStage(result.stage);
        if (raffleRef.current?.status === "closed") applyFullLoad(await getRaffleById(raffleId));
        show(`Resultado de ${stage.label} deshecho`, "success");
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo deshacer el resultado.", "error");
        throw err;
      }
    },
    [raffleId, replaceStage, applyFullLoad, show],
  );

  /** One action on a whole set (sell, collect, undo, edit, free): all its numbers in a single atomic request. */
  const runGroupAction = useCallback(
    async (group: RaffleGroupDTO, body: BulkActionBody, message: string) => {
      const ids = numbersOfGroup(raffleRef.current?.numbers ?? [], group.id).map((n) => n.id);
      try {
        const updated = await updateNumbersBulk({ ...body, ids } as BulkNumberInput);
        mergeNumbers(updated);
        show(message, "success");
        setOpenGroupId(null);
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.", "error");
        if (err instanceof ApiError && err.status === 409) {
          setOpenGroupId(null);
          await refreshAfterConflict();
        }
        throw err;
      }
    },
    [mergeNumbers, show, refreshAfterConflict],
  );

  /**
   * Saves a buyer's phone on the given numbers (one request per spelling of the name, since the request also
   * carries the name and each number keeps its own).
   */
  const handleEditPhone = useCallback(
    async (numbers: RaffleNumberDTO[], phone: string | null) => {
      const byName = new Map<string, string[]>();
      for (const n of numbers) {
        if (!n.buyerName) continue;
        byName.set(n.buyerName, [...(byName.get(n.buyerName) ?? []), n.id]);
      }
      try {
        for (const [buyerName, ids] of byName) {
          mergeNumbers(await updateNumbersBulk({ action: "edit", ids, buyerName, buyerPhone: phone }));
        }
        show(phone ? "Teléfono guardado" : "Teléfono quitado", "success");
      } catch (err) {
        show(err instanceof ApiError ? err.message : "No se pudo guardar el teléfono. Inténtalo de nuevo.", "error");
        if (err instanceof ApiError && err.status === 409) await refreshAfterConflict();
        throw err;
      }
    },
    [mergeNumbers, show, refreshAfterConflict],
  );

  const handleSave = useCallback(
    async (id: string, input: UpdateNumberInput) => {
      const original = raffle?.numbers.find((n) => n.id === id);
      if (!original) return;

      const applyInput = (n: RaffleNumberDTO): RaffleNumberDTO => ({
        ...n,
        status: input.status,
        buyerName: resolveField(input.buyerName, n.buyerName),
        buyerPhone: resolveField(input.buyerPhone, n.buyerPhone),
        photoDataUrl: resolveField(input.photoDataUrl, n.photoDataUrl),
        notes: resolveField(input.notes, n.notes),
      });
      // Functional updates touch only this number, so changes other people made
      // while the request is in flight aren't overwritten by a stale snapshot.
      const replace = (next: (n: RaffleNumberDTO) => RaffleNumberDTO) =>
        setRaffle((current) =>
          current ? { ...current, numbers: current.numbers.map((n) => (n.id === id ? next(n) : n)) } : current,
        );

      // Optimistic update so the tap feels instant.
      replace(applyInput);

      try {
        const updated = await updateNumber(id, input);
        replace(() => updated);
        show(successMessage(updated), "success");
      } catch (err) {
        replace(() => original);
        show(
          err instanceof ApiError ? err.message : "No se pudo guardar. Inténtalo de nuevo.",
          "error",
        );
        throw err;
      }
    },
    [raffle, show],
  );

  const live = useRaffleLive({
    raffleId,
    enabled: Boolean(raffle) && Boolean(user) && user?.role !== "SUPERADMIN",
    cursorRef: syncCursor,
    onChanges: handleLiveChanges,
    onRaffleState: handleRaffleState,
  });

  if (authLoading || !user || user.role === "SUPERADMIN") {
    return <FullScreenSpinner />;
  }

  return (
    <div className={`flex min-h-dvh flex-1 flex-col ${selecting ? "pb-32" : "pb-10"}`}>
      {raffle && (
        <DashboardHeader
          raffle={raffle}
          userName={user.name}
          role={user.role}
          showBackToPicker={raffleCount > 1}
          onLogout={handleLogout}
          onDownloadImage={handleDownloadImage}
          onCopyText={handleCopyText}
          onSetDrawDate={() => setSettingDrawDate(true)}
          downloadingImage={downloadingImage}
          canShareImage={canShareImage}
          onOpenPublicLink={() => (raffle.active ? setPublicLinkOpen(true) : setActivationOpen(true))}
          onCloseRaffle={() => setClosingRaffle(true)}
          onReopenRaffle={handleReopenRaffle}
          onDeleteRaffle={() => setDeletingRaffle(true)}
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
              <div className="mb-4 flex items-stretch gap-2">
                <div
                  role="tablist"
                  aria-label="Vista de la rifa"
                  className="grid flex-1 grid-cols-2 gap-1 rounded-2xl border border-line bg-bg-elevated p-1"
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
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  aria-label="Recargar tablero"
                  title={live.status === "live" ? "En vivo · toca para recargar" : "Recargar tablero"}
                  className="relative flex w-14 shrink-0 items-center justify-center rounded-2xl border border-line bg-bg-elevated text-text-muted transition active:scale-95 disabled:opacity-70"
                >
                  <RefreshIcon className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
                  <span
                    aria-hidden="true"
                    className={`absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-bg-elevated ${
                      live.status === "live"
                        ? "bg-green-400"
                        : live.status === "reconnecting"
                          ? "animate-pulse bg-gold-400"
                          : "bg-line"
                    }`}
                  />
                </button>
              </div>

              {!raffle.active && (
                <button
                  type="button"
                  onClick={() => setActivationOpen(true)}
                  className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-gold-600/50 bg-gold-400/10 px-4 py-3 text-left transition active:scale-[0.99]"
                >
                  <span className="min-w-0 text-sm font-semibold text-gold-400">
                    Esta rifa aún no está activa
                    <span className="block text-xs font-normal text-text-muted">
                      {isOrganizer
                        ? "Actívala para empezar a vender y compartir el enlace."
                        : "El organizador debe activarla para empezar a vender."}
                    </span>
                  </span>
                  {isOrganizer && (
                    <span className="shrink-0 rounded-xl bg-gradient-to-b from-gold-300 to-gold-500 px-3 py-2 text-xs font-bold text-[#241a02]">
                      Activar
                    </span>
                  )}
                </button>
              )}

              {overdueHolds.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    exitSelection();
                    setPeople("buyers");
                    setView("participants");
                  }}
                  aria-label="Ver apartados vencidos"
                  className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-left transition active:scale-[0.99]"
                >
                  <span className="min-w-0 text-sm font-semibold text-red-300">
                    {overdueBuyers === 1 ? "1 comprador tiene" : `${overdueBuyers} compradores tienen`} apartados vencidos
                    <span className="block text-xs font-normal text-red-300/80">
                      {raffle.stages.length === 0 && (drawCutoff(raffle.drawDate) ?? Infinity) <= openedAt
                        ? "Llegó el día del sorteo y siguen sin pagar"
                        : `Más de ${raffle.holdDays} ${raffle.holdDays === 1 ? "día" : "días"} sin pagar`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-red-300">Ver</span>
                </button>
              )}

              {live.status === "reconnecting" && (
                <p role="status" className="-mt-2 mb-3 text-xs font-medium text-gold-400">
                  Sin conexión en vivo. Reconectando… puedes seguir usando el tablero.
                </p>
              )}

              {view === "board" ? (
                <>
                  {stageSettings && (
                    <StagesPanel
                      raffle={raffle}
                      settings={stageSettings}
                      isOrganizer={isOrganizer}
                      onDraw={handleDrawStage}
                      onUndo={handleUndoStage}
                    />
                  )}
                  {hasGroups && (
                    <section aria-label="Conjuntos" className="mb-6">
                      <p className="mb-3 text-sm text-text-muted">
                        {raffleClosed
                          ? "Rifa cerrada: toca una letra vendida para registrar su pago."
                          : "Cada letra se vende completa a un solo comprador. Toca una para venderla o gestionarla."}
                      </p>
                      <GroupedBoard
                        groups={raffle.groups}
                        numbers={raffle.numbers}
                        onOpenGroup={openGroupCard}
                        winnerValue={raffle.winnerValue}
                      />
                    </section>
                  )}

                  {looseNumbers.length > 0 && (
                    <section aria-label="Números sueltos">
                      {hasGroups && (
                        <h2 className="mb-1 font-[family-name:var(--font-heading)] text-lg font-bold text-text">
                          Números sueltos · {formatCurrency(raffle.numberPrice)} c/u
                        </h2>
                      )}
                      {!raffleClosed && (
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-text-muted">
                            {selecting ? "Toca los números" : "Mantén presionado un número"}
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
                      )}
                      <NumberGrid
                        numbers={looseNumbers}
                        onSelect={handleGridSelect}
                        onLongPress={selecting || raffleClosed ? undefined : handleLongPress}
                        selectedIds={selecting ? pickedIds : undefined}
                        winnerValue={raffle.winnerValue}
                        stageWinners={stageWinners}
                        installments={stageSettings ? installmentPrices(stageSettings.stages).length : undefined}
                      />
                    </section>
                  )}
                </>
              ) : (
                <>
                  <div role="tablist" aria-label="Ver por" className="mb-4 flex gap-2">
                    <PeopleChip active={people === "buyers"} onClick={() => setPeople("buyers")}>
                      Compradores
                    </PeopleChip>
                    <PeopleChip active={people === "sellers"} onClick={() => setPeople("sellers")}>
                      {isOrganizer ? "Vendedores" : "Mis ventas"}
                    </PeopleChip>
                    {isOrganizer && (
                      <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={exporting}
                        aria-label="Exportar a Excel"
                        className="ml-auto flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-green-500/40 px-3.5 text-xs font-semibold text-green-400 transition active:scale-95 disabled:opacity-60"
                      >
                        {exporting ? <Spinner size={14} /> : <SheetIcon className="h-4 w-4" />}
                        Excel
                      </button>
                    )}
                  </div>
                  {people === "buyers" ? (
                    <ParticipantsList
                      numbers={raffle.numbers}
                      groups={raffle.groups}
                      priceOf={pricer}
                      raffle={raffle}
                      winnerValue={raffle.winnerValue}
                      holdDays={raffleClosed ? null : raffle.holdDays}
                      drawDate={raffle.stages.length === 0 ? raffle.drawDate : null}
                      autoRelease={raffle.autoRelease}
                      onSelect={openNumber}
                      onPayAll={(buyerName, numbers) => setPayTarget({ buyerName, numbers })}
                      onEditPhone={handleEditPhone}
                      stageSettings={stageSettings}
                    />
                  ) : (
                    <SellersReport
                      raffleId={raffle.id}
                      raffleName={raffle.name}
                      numbers={raffle.numbers}
                      priceOf={pricer}
                      viewerId={user?.id ?? ""}
                      canSeeAll={isOrganizer}
                      stageSettings={stageSettings}
                    />
                  )}
                </>
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
        canRelease={!raffleClosed}
        onClose={() => setSelectedId(null)}
        onSave={handleSave}
        stageSettings={stageSettings}
        onQuotas={(id, action, method) => handleQuotas([id], action, method)}
        onRejectReceipt={handleRejectReceipt}
        onEditPhone={(id, phone) => {
          const n = raffle?.numbers.find((x) => x.id === id);
          return n ? handleEditPhone([n], phone) : Promise.resolve();
        }}
      />

      {activationOpen && raffle && (
        <ActivationSheet
          raffleId={raffle.id}
          raffleName={raffle.name}
          totalNumbers={raffle.totalNumbers}
          orgCode={user.orgCode}
          isOrganizer={isOrganizer}
          onClose={() => setActivationOpen(false)}
          onActivated={() => setRaffle((current) => (current && !current.active ? { ...current, active: true } : current))}
        />
      )}

      {publicLinkOpen && raffle && (
        <PublicLinkSheet
          raffleName={raffle.name}
          token={raffle.publicToken}
          canManage={isOrganizer}
          reservationsOpen={raffle.reservationsOpen}
          onClose={() => setPublicLinkOpen(false)}
          onChange={handlePublicLinkChange}
          raffleId={raffle.id}
          onlineCount={raffle.numbers.filter((n) => n.online && n.status !== "available").length}
        />
      )}

      {imagePreview && (
        <ImagePreviewSheet
          blob={imagePreview.blob}
          url={imagePreview.url}
          filename={imagePreview.filename}
          title={imagePreview.title}
          onClose={closeImagePreview}
        />
      )}

      {settingDrawDate && raffle && isOrganizer && (
        <DrawDateSheet
          raffleName={raffle.name}
          current={raffle.drawDate}
          onClose={() => setSettingDrawDate(false)}
          onSave={async (isoDate) => {
            const updated = await updateRaffle(raffle.id, { drawDate: isoDate });
            setRaffle((current) => (current ? { ...current, drawDate: updated.drawDate } : current));
            setSettingDrawDate(false);
            show("Fecha del sorteo guardada", "success");
          }}
        />
      )}

      {closingRaffle && raffle && isOrganizer && (
        <CloseRaffleSheet raffle={raffle} onClose={() => setClosingRaffle(false)} onConfirm={handleCloseRaffle} />
      )}

      {deletingRaffle && raffle && isOrganizer && (
        <DeleteRaffleSheet
          raffleName={raffle.name}
          onClose={() => setDeletingRaffle(false)}
          onConfirm={handleDeleteRaffle}
          onExport={handleExportExcel}
          exporting={exporting}
        />
      )}

      {openGroup && (
        <GroupSheet
          key={`${openGroup.id}-${openGroupMembers[0]?.status ?? ""}`}
          canRelease={!raffleClosed}
          group={openGroup}
          members={openGroupMembers}
          knownBuyers={knownBuyers}
          onClose={() => setOpenGroupId(null)}
          onSell={(input) =>
            runGroupAction(openGroup, { action: "sell", ...input }, `Conjunto ${openGroup.label} vendido a ${input.buyerName}`)
          }
          onPay={(method) =>
            runGroupAction(openGroup, { action: "pay", paymentMethod: method }, `Conjunto ${openGroup.label} cobrado`)
          }
          onUnpay={() => runGroupAction(openGroup, { action: "unpay" }, `Pago del conjunto ${openGroup.label} deshecho`)}
          onEdit={(input) => runGroupAction(openGroup, { action: "edit", ...input }, "Datos del comprador actualizados")}
          onRelease={() => runGroupAction(openGroup, { action: "release" }, `Conjunto ${openGroup.label} liberado`)}
          onRejectReceipt={(reason) =>
            runGroupAction(openGroup, { action: "rejectReceipt", reason }, `Comprobante del conjunto ${openGroup.label} rechazado`)
          }
        />
      )}

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
          groups={raffle.groups}
          total={pricer(payTarget.numbers)}
          onClose={() => setPayTarget(null)}
          onConfirm={handlePayMany}
          stageAmounts={stageSettings ? stagePayAmounts(payTarget.numbers, stageSettings) : null}
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

function PeopleChip({
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
      className={`h-10 flex-1 rounded-full text-xs font-semibold transition active:scale-95 ${
        active ? "bg-gold-300 text-[#241a02]" : "border border-line bg-surface-2 text-text-muted"
      }`}
    >
      {children}
    </button>
  );
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

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Spinner size={32} className="text-gold-400" />
    </div>
  );
}

function SheetIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4 9h16M4 15h16M10 3v18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
