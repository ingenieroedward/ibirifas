export type NumberStatus = "available" | "occupied" | "paid";
export type PaymentStatus = "pending" | "paid" | "refunded";
export type Role = "SUPERADMIN" | "ORGANIZER" | "SELLER";

export interface AdminUserDTO {
  id: string;
  name: string;
}

export interface MeDTO {
  id: string;
  name: string;
  role: Role;
  plan: string;
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

// Lightweight shape for the raffle picker list — no per-number data.
export interface RaffleSummaryDTO {
  id: string;
  name: string;
  prizeLabel: string | null;
  numberPrice: number;
  totalNumbers: number;
  drawDate: string | null;
  status: "active" | "closed";
  availableCount: number;
  occupiedCount: number;
  paidCount: number;
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

export interface CreateRaffleInput {
  name: string;
  prizeLabel?: string | null;
  numberPrice: number;
  totalNumbers?: number; // defaults to 100
  drawDate?: string | null;
}

export interface UpdateNumberInput {
  status: NumberStatus;
  buyerName?: string | null;
  buyerPhone?: string | null;
  photoDataUrl?: string | null;
  notes?: string | null;
}

// A user managed from the "Usuarios" screen: the target role is always the
// caller's direct report (SUPERADMIN -> ORGANIZER, ORGANIZER -> SELLER), so
// it's never client-supplied on create.
export interface ManagedUserDTO {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  plan: string;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  code: string; // 6 digits
}

export interface UpdateUserInput {
  active?: boolean;
  code?: string; // reset to a new 6-digit code
  plan?: string; // SUPERADMIN only, only meaningful when target role is ORGANIZER
}

export interface ApiErrorBody {
  error: string;
}
