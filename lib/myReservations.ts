/** The reservations made from this device, so the public page can link back to "Mi reserva". */

const KEY = "ibirifas_my_reservations";
const MAX = 20;

export function reservationPath(token: string, key: string): string {
  return `/p/${token}/reserva/${key}`;
}

type Saved = Record<string, { key: string; at: number }[]>;

function read(): Saved {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Saved;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberReservation(token: string, key: string): void {
  try {
    const all = read();
    const list = [{ key, at: Date.now() }, ...(all[token] ?? []).filter((r) => r.key !== key)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify({ ...all, [token]: list }));
  } catch {
    // Not remembering is fine: the link is also in the confirmation and the email.
  }
}

/** Newest first. */
export function myReservations(token: string): string[] {
  return (read()[token] ?? []).map((r) => r.key);
}

export function forgetReservation(token: string, key: string): void {
  try {
    const all = read();
    window.localStorage.setItem(KEY, JSON.stringify({ ...all, [token]: (all[token] ?? []).filter((r) => r.key !== key) }));
  } catch {
    // Nothing to do.
  }
}
