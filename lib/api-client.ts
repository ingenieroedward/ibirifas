import type {
  PaymentsAccountDTO,
  PaymentCandidateDTO,
  ReceivedPaymentsDTO,
  BulkNumberInput,
  CreateRaffleInput,
  CreateUserInput,
  ManagedUserDTO,
  MeDTO,
  OrgSettingsDTO,
  PaymentMethod,
  PublicLinkAction,
  QuotaAction,
  RaffleDTO,
  RaffleNumberDTO,
  RaffleStageDTO,
  RaffleSummaryDTO,
  UpdateNumberInput,
  UpdateRaffleInput,
  UpdateUserInput,
  VisitStatsDTO,
} from "@/lib/types";

/**
 * Thin fetch wrapper for the Ibirifas API.
 *
 * Session model: a 15-minute access token cookie backed by a 30-day httpOnly
 * refresh cookie. Every request here is credentialed, and a 401 triggers a
 * single transparent `/api/auth/refresh` + retry before giving up.
 */

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

let refreshPromise: Promise<boolean> | null = null;

/** Dedupe concurrent refresh attempts so parallel 401s only refresh once. */
function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function redirectToLogin() {
  // A hard navigation, not a Next.js client transition: this module runs
  // outside the component tree (no useRouter available) and a full reload
  // guarantees every bit of in-memory client state is thrown away alongside
  // the now-invalid session.
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: string };
    if (body && typeof body.error === "string" && body.error.length > 0) {
      return body.error;
    }
  } catch {
    // Body wasn't JSON (or was empty) — fall through to a generic message.
  }
  return `Error ${res.status}`;
}

interface RequestOptions {
  /** Skip the refresh+retry dance entirely (used by the auth endpoints themselves). */
  skipRefresh?: boolean;
  /**
   * Don't hard-redirect to /login when a 401 survives the refresh+retry.
   * Used for session bootstrap (`getMe`) and the login/logout calls, where the
   * caller decides what "not authenticated" means rather than forcing a nav.
   */
  skipRedirectOn401?: boolean;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  { skipRefresh = false, skipRedirectOn401 = false }: RequestOptions = {},
): Promise<T> {
  const doFetch = () =>
    fetch(path, {
      ...init,
      credentials: "include",
      headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
    });

  let res = await doFetch();

  if (res.status === 401 && !skipRefresh) {
    const refreshed = await refreshSession();
    if (refreshed) {
      res = await doFetch();
    }
  }

  if (res.status === 401) {
    if (!skipRedirectOn401) redirectToLogin();
    throw new ApiError(401, await readErrorMessage(res));
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readErrorMessage(res));
  }

  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
}

export async function login(code: string, orgCode: string): Promise<MeDTO> {
  const { user } = await request<{ user: MeDTO }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ code, orgCode }) },
    { skipRefresh: true, skipRedirectOn401: true },
  );
  return user;
}

export async function logout(): Promise<void> {
  await request<{ ok: true }>(
    "/api/auth/logout",
    { method: "POST" },
    { skipRefresh: true, skipRedirectOn401: true },
  );
}

/**
 * Session bootstrap check. Transparently refreshes an expired access token,
 * but never force-navigates — resolves to `null` when there's no valid
 * session so callers (AuthContext) can decide what to render.
 */
export async function getMe(): Promise<MeDTO | null> {
  try {
    return await request<MeDTO>(
      "/api/auth/me",
      {},
      { skipRedirectOn401: true },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function getRaffles(): Promise<RaffleSummaryDTO[]> {
  return request<RaffleSummaryDTO[]>("/api/raffles");
}

export async function createRaffle(input: CreateRaffleInput): Promise<RaffleSummaryDTO> {
  return request<RaffleSummaryDTO>("/api/raffles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getRaffleById(id: string): Promise<RaffleDTO> {
  return request<RaffleDTO>(`/api/raffles/${id}`);
}

export async function updateRaffle(id: string, input: UpdateRaffleInput): Promise<RaffleDTO> {
  return request<RaffleDTO>(`/api/raffles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateNumber(
  id: string,
  input: UpdateNumberInput,
): Promise<RaffleNumberDTO> {
  return request<RaffleNumberDTO>(`/api/numbers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateNumbersBulk(input: BulkNumberInput): Promise<RaffleNumberDTO[]> {
  return request<RaffleNumberDTO[]>("/api/numbers/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** The key the browser needs to subscribe, or null when the server has push turned off. */
export async function getPushPublicKey(): Promise<string | null> {
  const { publicKey } = await request<{ publicKey: string | null }>("/api/push/key");
  return publicKey;
}

export async function savePushSubscription(subscription: PushSubscriptionJSON): Promise<void> {
  await request<{ ok: true }>("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify(subscription),
  });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  await request<{ ok: true }>("/api/push/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint }),
  });
}

export async function sendTestPush(): Promise<void> {
  await request<{ sent: number }>("/api/push/test", { method: "POST" });
}

/** Numbers changed after `since` (ISO timestamp) — how a board catches up without a full reload. */
export async function getNumbersSince(raffleId: string, since: string): Promise<NumbersSince> {
  return request<NumbersSince>(`/api/raffles/${raffleId}/numbers?since=${encodeURIComponent(since)}`);
}

export interface NumbersSince {
  numbers: RaffleNumberDTO[];
  /** Whether the raffle is still selling, and who won once it's closed. */
  raffle: { status: "active" | "closed"; winnerValue: number | null; stages: RaffleStageDTO[] };
}

/** Collect or undo installments of a raffle by stages; returns the numbers as they are now. */
export async function payQuotas(
  ids: string[],
  action: QuotaAction,
  paymentMethod: PaymentMethod = "cash",
): Promise<RaffleNumberDTO[]> {
  return request<RaffleNumberDTO[]>("/api/numbers/quotas", {
    method: "POST",
    body: JSON.stringify(action === "undo" ? { ids, action } : { ids, action, paymentMethod }),
  });
}

/** Record the number that came out in a stage's draw. `closed` once it was the last stage. */
export async function drawStage(
  raffleId: string,
  stageId: string,
  winnerValue: number,
): Promise<{ stage: RaffleStageDTO; closed: boolean }> {
  return request(`/api/raffles/${raffleId}/stages/${stageId}/draw`, {
    method: "POST",
    body: JSON.stringify({ winnerValue }),
  });
}

/** Undo the last recorded stage result. */
export async function undoStage(raffleId: string, stageId: string): Promise<{ stage: RaffleStageDTO }> {
  return request(`/api/raffles/${raffleId}/stages/${stageId}/draw`, { method: "DELETE" });
}

/** Close a raffle (optionally with the winning number) or reopen it. */
export async function setRaffleStatus(
  id: string,
  input: { status: "active" } | { status: "closed"; winnerValue: number | null },
): Promise<RaffleDTO> {
  return request<RaffleDTO>(`/api/raffles/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

/** Turn the raffle's public read-only link on, off, or replace it with a new one. */
export async function setPublicLink(id: string, action: PublicLinkAction): Promise<string | null> {
  const { publicToken } = await request<{ publicToken: string | null }>(`/api/raffles/${id}/public-link`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  return publicToken;
}

/** Permanently delete a closed raffle. */
export async function deleteRaffle(id: string): Promise<void> {
  await request<void>(`/api/raffles/${id}`, { method: "DELETE" });
}

/**
 * True while there is a valid session, refreshing an expired access token on
 * the way. Used to recover a dropped live connection without forcing a login
 * screen; rejects only on network trouble.
 */
export async function hasValidSession(): Promise<boolean> {
  return (await getMe()) !== null;
}

export async function getUsers(): Promise<ManagedUserDTO[]> {
  return request<ManagedUserDTO[]>("/api/users");
}

export async function createUser(input: CreateUserInput): Promise<ManagedUserDTO> {
  return request<ManagedUserDTO>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<ManagedUserDTO> {
  return request<ManagedUserDTO>(`/api/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** The organization's settings (organizer only). */
export async function getOrgSettings(): Promise<OrgSettingsDTO> {
  return request<OrgSettingsDTO>("/api/org/settings");
}

/** The raffle as an Excel file (organizer only), with the name the server gave it. */
export async function exportRaffleExcel(raffleId: string): Promise<{ blob: Blob; filename: string }> {
  const doFetch = () => fetch(`/api/raffles/${raffleId}/export`, { credentials: "include" });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession())) res = await doFetch();
  if (res.status === 401) redirectToLogin();
  if (!res.ok) throw new ApiError(res.status, await readErrorMessage(res));
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "rifa.xlsx";
  return { blob: await res.blob(), filename: name };
}

/** Visits to a raffle's public link. */
export async function getVisitStats(raffleId: string): Promise<VisitStatsDTO> {
  return request<VisitStatsDTO>(`/api/raffles/${raffleId}/visits`);
}

/** Changes the signed-in person's own 6-digit code (asks for the current one). */
export async function changeMyName(name: string): Promise<MeDTO> {
  return request<MeDTO>("/api/auth/me", { method: "PATCH", body: JSON.stringify({ name }) });
}

export async function changeMyCode(currentCode: string, newCode: string): Promise<void> {
  await request<{ ok: true }>("/api/auth/change-code", { method: "POST", body: JSON.stringify({ currentCode, newCode }) });
}

/** Sends a test email to the organizer's contact address. */
export async function sendTestEmail(): Promise<void> {
  await request<{ ok: true }>("/api/org/test-email", { method: "POST" });
}

export async function updateOrgSettings(input: Partial<OrgSettingsDTO>): Promise<OrgSettingsDTO> {
  return request<OrgSettingsDTO>("/api/org/settings", { method: "PATCH", body: JSON.stringify(input) });
}

// ---------- Payments reported by the bank (pagoradar)

export async function getReceivedPayments(filter: "pending" | "approved" | "ignored"): Promise<ReceivedPaymentsDTO> {
  return request<ReceivedPaymentsDTO>(`/api/payments?filter=${filter}`);
}

/** How many reported payments wait for the team (0 when the organization isn't connected). */
export async function getPendingPaymentsCount(): Promise<{ enabled: boolean; pending: number }> {
  return request<{ enabled: boolean; pending: number }>("/api/payments?count=1", {}, { skipRedirectOn401: true });
}

export type PaymentAction = { action: "approve"; numberIds: string[] } | { action: "undo" } | { action: "ignore" } | { action: "reopen" };

export async function actOnPayment(id: string, input: PaymentAction): Promise<void> {
  await request<{ ok: true }>(`/api/payments/${encodeURIComponent(id)}`, { method: "POST", body: JSON.stringify(input) });
}

export async function getOpenReservations(payer: string, amount: number): Promise<PaymentCandidateDTO[]> {
  const q = new URLSearchParams({ payer, amount: String(amount) });
  return (await request<{ reservations: PaymentCandidateDTO[] }>(`/api/payments/reservations?${q}`)).reservations;
}

export async function getPaymentsAccount(): Promise<PaymentsAccountDTO> {
  return request<PaymentsAccountDTO>("/api/org/payments-account");
}

export async function connectPaymentsAccount(ownerEmail: string, banks: string[]): Promise<PaymentsAccountDTO> {
  return request<PaymentsAccountDTO>("/api/org/payments-account", { method: "POST", body: JSON.stringify({ ownerEmail, banks }) });
}

export async function updatePaymentsAccount(ownerEmail: string, banks: string[]): Promise<PaymentsAccountDTO> {
  return request<PaymentsAccountDTO>("/api/org/payments-account", { method: "PATCH", body: JSON.stringify({ ownerEmail, banks }) });
}

export async function disconnectPaymentsAccount(): Promise<PaymentsAccountDTO> {
  return request<PaymentsAccountDTO>("/api/org/payments-account", { method: "DELETE" });
}

/** The organizer accepts the current terms of use (/terminos). */
export async function acceptTerms(): Promise<MeDTO> {
  return request<MeDTO>("/api/auth/terms", { method: "POST" });
}
