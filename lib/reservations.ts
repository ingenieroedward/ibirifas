import type { ReservationSetting } from "@/lib/types";

/** What one visitor can take in a single reservation (and, for phones, hold unpaid at once). */
export const MAX_LOOSE_PER_RESERVATION = 10;
export const MAX_SETS_PER_RESERVATION = 3;
export const MAX_UNPAID_ONLINE_PER_PHONE = 20;

export function settingFromDb(value: string | null): ReservationSetting {
  return value === "on" || value === "off" ? value : "inherit";
}

export function settingToDb(value: ReservationSetting): "on" | "off" | null {
  return value === "inherit" ? null : value;
}

/**
 * Can visitors of the public link reserve numbers? The raffle's own choice wins
 * over the organization's default, and a reservation only makes sense when
 * unpaid holds expire (`holdDays`), otherwise anyone could park numbers forever.
 */
export function reservationsOpen(input: {
  raffleSetting: string | null;
  organizationDefault: boolean;
  holdDays: number | null;
  status: string;
}): boolean {
  if (input.status !== "active" || !input.holdDays) return false;
  const setting = settingFromDb(input.raffleSetting);
  return setting === "inherit" ? input.organizationDefault : setting === "on";
}

/** Digits only, so "300 123 4567" and "3001234567" are the same phone. */
export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}
