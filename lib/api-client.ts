import type {
  AdminUserDTO,
  RaffleDTO,
  RaffleNumberDTO,
  UpdateNumberInput,
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
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
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

export async function login(code: string): Promise<AdminUserDTO> {
  const { user } = await request<{ user: AdminUserDTO }>(
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
export async function getMe(): Promise<AdminUserDTO | null> {
  try {
    return await request<AdminUserDTO>(
      "/api/auth/me",
      {},
      { skipRedirectOn401: true },
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function getRaffle(): Promise<RaffleDTO> {
  return request<RaffleDTO>("/api/raffle");
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
