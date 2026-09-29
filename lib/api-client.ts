import type {
  BulkNumberInput,
  CreateRaffleInput,
  CreateUserInput,
  ManagedUserDTO,
  MeDTO,
  RaffleDTO,
  RaffleNumberDTO,
  RaffleSummaryDTO,
  UpdateNumberInput,
  UpdateRaffleInput,
  UpdateUserInput,
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

export async function login(code: string): Promise<MeDTO> {
  const { user } = await request<{ user: MeDTO }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ code }) },
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
export async function getNumbersSince(raffleId: string, since: string): Promise<RaffleNumberDTO[]> {
  const { numbers } = await request<{ numbers: RaffleNumberDTO[] }>(
    `/api/raffles/${raffleId}/numbers?since=${encodeURIComponent(since)}`,
  );
  return numbers;
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
