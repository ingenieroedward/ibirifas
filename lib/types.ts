export type NumberStatus = "available" | "occupied" | "paid";
export type PaymentStatus = "pending" | "paid" | "refunded";

export interface AdminUserDTO {
  id: string;
  name: string;
}

export interface RaffleNumberDTO {
  id: string;
  value: number;
  status: NumberStatus;
  buyerName: string | null;
  buyerPhone: string | null;
  photoDataUrl: string | null;
  paymentStatus: PaymentStatus;
  notes: string | null;
  updatedAt: string;
}

export interface RaffleDTO {
  id: string;
  name: string;
  prizeLabel: string | null;
  numberPrice: number;
  totalNumbers: number;
  drawDate: string | null;
  status: "active" | "closed";
  numbers: RaffleNumberDTO[];
}

export interface UpdateNumberInput {
  status: NumberStatus;
  buyerName?: string | null;
  buyerPhone?: string | null;
  photoDataUrl?: string | null;
  notes?: string | null;
}

export interface ApiErrorBody {
  error: string;
}
