import type { BrebKeyType, RaffleAccountDTO } from "@/lib/types";

/** How payment accounts read to people: safe to use in the browser (no server-only imports). */

export const BREB_KEY_LABEL: Record<BrebKeyType, string> = {
  phone: "celular",
  email: "correo",
  document: "documento",
  alias: "alfanumérica",
  other: "llave",
};

/** "llave celular" / "llave", for a Bre-B account. */
export function brebKeyText(keyType: BrebKeyType | null): string {
  return keyType && keyType !== "other" ? `llave ${BREB_KEY_LABEL[keyType]}` : "llave";
}

/** "Bre-B (llave celular): 3001234567 · Titular: Ana" / "Nequi: 300 123 4567 (Ana)", for texts and emails. */
export function accountLine(a: Pick<RaffleAccountDTO, "label" | "number" | "holderName" | "kind" | "keyType">): string {
  if (a.kind === "breb") {
    return `${a.label} (${brebKeyText(a.keyType)}): ${a.number}${a.holderName ? ` · Titular: ${a.holderName}` : ""}`;
  }
  return `${a.label}: ${a.number}${a.holderName ? ` (${a.holderName})` : ""}`;
}

/** Where the QR image of an account is served; `token` is the raffle's public link for visitors. */
export function accountQrPath(accountId: string, token?: string | null): string {
  return `/api/accounts/${accountId}/qr${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}
