export type NumberStatus = "available" | "occupied" | "paid";
export type PaymentStatus = "pending" | "paid" | "refunded";
export type Role = "SUPERADMIN" | "ORGANIZER" | "SELLER";
// How a manual payment was collected in person — no gateway involved yet.
export type PaymentMethod = "cash" | "nequi" | "transfer" | "other";

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
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  /** Name of whoever last sold/registered this number — useful when a raffle has several sellers. */
  updatedByName: string | null;
  updatedAt: string;
}

// Lightweight shape for the raffle picker list — no per-number data.
export interface RaffleSummaryDTO {
  id: string;
  name: string;
  prizeLabel: string | null;
  lottery: string | null;
  numberPrice: number;
  totalNumbers: number;
  drawDate: string | null;
  status: "active" | "closed";
  availableCount: number;
  occupiedCount: number;
  paidCount: number;
  /** Grid theme overrides — null means "use the app's default gold/black look". */
  themeBackground?: string | null;
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
}

// A payment account the organizer publishes on the raffle (Nequi, Bancolombia,
// etc.), ordered as entered. `holderName` ("responsable") is shown only when set.
export interface RaffleAccountDTO {
  id: string;
  label: string;
  number: string;
  holderName: string | null;
}

export interface RaffleDTO {
  id: string;
  name: string;
  prizeLabel: string | null;
  lottery: string | null;
  numberPrice: number;
  totalNumbers: number;
  drawDate: string | null;
  status: "active" | "closed";
  numbers: RaffleNumberDTO[];
  accounts: RaffleAccountDTO[];
  /** Grid theme overrides — null means "use the app's default gold/black look". */
  themeBackground?: string | null;
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
}

// Full-replace semantics: when `accounts` is present in a create/update
// request, it's the complete desired list (the organizer adds/removes/reorders
// freely in the UI and the whole list is sent on save), not a partial patch.
export interface RaffleAccountInput {
  label: string;
  number: string;
  holderName?: string | null;
}

export interface CreateRaffleInput {
  name: string;
  prizeLabel?: string | null;
  lottery?: string | null;
  numberPrice: number;
  totalNumbers?: number; // defaults to 100
  drawDate?: string | null;
  themeBackground?: string | null;
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
  accounts?: RaffleAccountInput[];
}

// Editing an existing raffle. `totalNumbers` is intentionally absent — changing
// it after creation would desync the already-created RaffleNumber rows.
// `accounts`, when present, fully replaces the raffle's payment accounts —
// omit the field entirely to leave existing accounts untouched.
export interface UpdateRaffleInput {
  name?: string;
  prizeLabel?: string | null;
  lottery?: string | null;
  numberPrice?: number;
  drawDate?: string | null;
  themeBackground?: string | null;
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
  accounts?: RaffleAccountInput[];
}

export interface UpdateNumberInput {
  status: NumberStatus;
  buyerName?: string | null;
  buyerPhone?: string | null;
  photoDataUrl?: string | null;
  paymentMethod?: PaymentMethod | null; // only meaningful when status is "paid"
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
