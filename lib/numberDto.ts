import type { Prisma } from "@prisma/client";
import type { NumberStatus, PaymentMethod, PaymentStatus, RaffleNumberDTO } from "@/lib/types";

type NumberWithAuthor = Prisma.RaffleNumberGetPayload<{ include: { updatedBy: { select: { name: true } } } }>;

export function toNumberDTO(n: NumberWithAuthor): RaffleNumberDTO {
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
    updatedByName: n.updatedBy?.name ?? null,
    updatedAt: n.updatedAt.toISOString(),
  };
}
