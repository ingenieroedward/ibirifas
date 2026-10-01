import type { PaymentMethod } from "@/lib/types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  nequi: "Nequi",
  breb: "Bre-B",
  transfer: "Transferencia",
  other: "Otro",
};

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "nequi", "breb", "transfer", "other"];
