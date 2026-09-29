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
  /** The organization this person belongs to (an organizer's own, a seller's organizer's). Null for the superadmin. */
  orgCode: string | null;
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
  /** The lettered set this number belongs to (sold only together with the rest of it); null for a loose number. */
  groupId: string | null;
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
  /** The winning number of a closed raffle (null: still open, or closed without a draw). */
  winnerValue: number | null;
  availableCount: number;
  occupiedCount: number;
  paidCount: number;
  /** How many lettered sets the raffle is sold in (0 = plain numbers only). */
  groupCount: number;
  /** Money collected so far, counting sets at their set price. */
  collected: number;
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

/** A lettered set of numbers sold as one unit at `price`. */
export interface RaffleGroupDTO {
  id: string;
  label: string;
  price: number;
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
  /** The winning number once the raffle is closed; null while open or when closed without a draw. */
  winnerValue: number | null;
  closedAt: string | null;
  numbers: RaffleNumberDTO[];
  accounts: RaffleAccountDTO[];
  /** Lettered sets in order (A, B, C…); empty for a raffle sold number by number. */
  groups: RaffleGroupDTO[];
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

/**
 * One lettered set, as sent when creating a raffle. `values` are the numbers it
 * holds — drawn at random or picked by hand, the client decides — and they can't
 * overlap with another set's. Numbers left out stay loose (sold one by one).
 */
export interface RaffleGroupInput {
  label: string;
  price: number;
  values: number[];
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
  /** Sell in lettered sets; numbers not listed here remain loose and use `numberPrice`. */
  groups?: RaffleGroupInput[];
}

// Editing an existing raffle. `totalNumbers` is intentionally absent — changing
// it after creation would desync the already-created RaffleNumber rows.
// `accounts`, when present, fully replaces the raffle's payment accounts —
// omit the field entirely to leave existing accounts untouched.
export interface UpdateRaffleInput {
  /** "closed" ends the sales; "active" reopens the raffle (and forgets the winner). */
  status?: "active" | "closed";
  /** Only with status "closed": the number that won, or null for a raffle closed without a draw. */
  winnerValue?: number | null;
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

// Several numbers for one buyer in one request (all-or-nothing on the server).
export type BulkNumberInput =
  | {
      action: "sell";
      ids: string[];
      buyerName: string;
      buyerPhone?: string | null;
      photoDataUrl?: string | null;
    }
  | { action: "pay"; ids: string[]; paymentMethod: PaymentMethod }
  // Undo a payment (paid -> pending), free the numbers, or fix the buyer's details.
  | { action: "unpay"; ids: string[] }
  | { action: "release"; ids: string[] }
  | { action: "edit"; ids: string[]; buyerName: string; buyerPhone?: string | null };

type WithoutIds<T> = T extends { ids: string[] } ? Omit<T, "ids"> : never;
/** A bulk action minus the ids — for callers that fill them in from a set's numbers. */
export type BulkActionBody = WithoutIds<BulkNumberInput>;

// A user managed from the "Usuarios" screen: the target role is always the
// caller's direct report (SUPERADMIN -> ORGANIZER, ORGANIZER -> SELLER), so
// it's never client-supplied on create.
export interface ManagedUserDTO {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  plan: string;
  /** The organization code this account logs in under. */
  orgCode: string | null;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  code: string; // 6 digits
  /** Superadmin creating an organizer only; generated from the name when omitted. */
  orgCode?: string;
}

export interface UpdateUserInput {
  name?: string;
  /** Superadmin renaming an organizer's organization code. */
  orgCode?: string;
  active?: boolean;
  code?: string; // reset to a new 6-digit code
  plan?: string; // SUPERADMIN only, only meaningful when target role is ORGANIZER
}

export interface ApiErrorBody {
  error: string;
}
