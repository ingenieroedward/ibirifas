import { z } from "zod";
import type { RaffleAccount } from "@prisma/client";
import type { BrebKeyType, RaffleAccountDTO } from "@/lib/types";

export { BREB_KEY_LABEL, accountLine, accountQrPath } from "@/lib/accountText";

/**
 * Payment accounts of a raffle: a regular account (Nequi, Bancolombia…) or a Bre-B llave (phone, email,
 * document or alias) with, optionally, the QR image the bank gives for it. The QR is never sent inline
 * with the raffle (it would weigh down every refresh of the public page); it is served on its own at
 * /api/accounts/<id>/qr.
 */

export const BREB_KEY_TYPES = ["phone", "email", "document", "alias", "other"] as const;

/** QR images are small (a screenshot downscaled in the browser); this is only a ceiling. */
export const MAX_QR_DATA_URL_LENGTH = 600 * 1024;
const QR_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const accountInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  number: z.string().trim().min(1).max(80),
  holderName: z.string().trim().max(80).nullable().optional(),
  kind: z.enum(["bank", "breb"]).optional(),
  keyType: z.enum(BREB_KEY_TYPES).nullable().optional(),
  /** A new QR image, or null to remove it. */
  qrDataUrl: z.string().max(MAX_QR_DATA_URL_LENGTH).regex(QR_IMAGE_RE).nullable().optional(),
  /** Keep the QR of this existing account of the same raffle (accounts are replaced as a whole on edit). */
  qrFrom: z.string().max(40).optional(),
});

export type AccountInput = z.infer<typeof accountInputSchema>;

/** The rows to create for a raffle's accounts; `existing` are its current accounts, for `qrFrom`. */
export function accountRows(raffleId: string, inputs: AccountInput[], existing: Pick<RaffleAccount, "id" | "qrDataUrl">[] = []) {
  return inputs.map((a, position) => {
    const kind = a.kind ?? "bank";
    const kept = a.qrFrom ? (existing.find((e) => e.id === a.qrFrom)?.qrDataUrl ?? null) : null;
    return {
      raffleId,
      label: a.label,
      number: a.number,
      holderName: a.holderName || null,
      kind,
      keyType: kind === "breb" ? (a.keyType ?? "other") : null,
      qrDataUrl: a.qrDataUrl !== undefined ? a.qrDataUrl : kept,
      hasQr: Boolean(a.qrDataUrl !== undefined ? a.qrDataUrl : kept),
      position,
    };
  });
}

type AccountRow = Pick<RaffleAccount, "id" | "label" | "number" | "holderName" | "kind" | "keyType" | "hasQr">;

export function toAccountDTO(a: AccountRow): RaffleAccountDTO {
  const kind = a.kind === "breb" ? "breb" : "bank";
  return {
    id: a.id,
    label: a.label,
    number: a.number,
    holderName: a.holderName,
    kind,
    keyType: kind === "breb" ? ((BREB_KEY_TYPES as readonly string[]).includes(a.keyType ?? "") ? (a.keyType as BrebKeyType) : "other") : null,
    hasQr: a.hasQr,
  };
}

/** Prisma `select` for accounts without the (heavy) QR image, with a flag for whether there is one. */
export const accountSelect = {
  id: true,
  label: true,
  number: true,
  holderName: true,
  kind: true,
  keyType: true,
  hasQr: true,
} as const;
