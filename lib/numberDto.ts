import type { Prisma } from "@prisma/client";
import type { NumberStatus, PaymentMethod, PaymentStatus, RaffleNumberDTO } from "@/lib/types";

/** What has to be loaded with a number to turn it into a DTO (who last touched it, who sold it). */
export const numberInclude = {
  updatedBy: { select: { name: true } },
  soldBy: { select: { name: true } },
} satisfies Prisma.RaffleNumberInclude;

type NumberWithAuthors = Prisma.RaffleNumberGetPayload<{ include: typeof numberInclude }>;

export function toNumberDTO(n: NumberWithAuthors): RaffleNumberDTO {
  return {
    id: n.id,
    value: n.value,
    status: n.status as NumberStatus,
    buyerName: n.buyerName,
    buyerPhone: n.buyerPhone,
    photoDataUrl: n.photoDataUrl,
    paymentStatus: n.paymentStatus as PaymentStatus,
    paymentMethod: n.paymentMethod as PaymentMethod | null,
    notes: n.notes,
    groupId: n.groupId,
    updatedByName: n.updatedBy?.name ?? null,
    soldById: n.soldById,
    soldByName: n.soldBy?.name ?? null,
    soldAt: n.soldAt ? n.soldAt.toISOString() : null,
    online: n.online,
    updatedAt: n.updatedAt.toISOString(),
  };
}
