import type { PaymentMethod } from "@/lib/types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  nequi: "Nequi",
  transfer: "Transferencia",
  other: "Otro",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "nequi", "transfer", "other"];
