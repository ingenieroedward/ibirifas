export type NumberStatus = "available" | "occupied" | "paid";
export type PaymentStatus = "pending" | "paid" | "refunded";
/** When a raffle is played: on its date, or once every number is sold / paid. */
export type DrawTrigger = "date" | "sold" | "paid";
/** What paying every installment of a raffle by stages up front earns. */
export type FullPayPerk = "none" | "discount" | "draw";

/** One draw of a raffle by stages (see prisma/schema.prisma RaffleStage). */
export interface RaffleStageDTO {
  id: string;
  position: number;
  label: string;
  prize: string;
  /** The installment for this stage; 0 for the bonus draw. */
  price: number;
  /** The extra draw for numbers paid in full up front. */
  bonus: boolean;
  lottery: string | null;
  drawDate: string | null;
  winnerValue: number | null;
  /** "won": the number was up to date; "house": it wasn't (or nobody had it) and the prize stays with the organizer. */
  outcome: "won" | "house" | null;
  winnerName: string | null;
  drawnAt: string | null;
}

/** An installment paid on a number. */
export interface QuotaDTO {
  quota: number;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
}

/** A stage as sent when creating or editing a raffle by stages. */
export interface RaffleStageInput {
  /** Present when editing an existing stage. */
  id?: string;
  label?: string;
  prize: string;
  price?: number;
  lottery?: string | null;
  drawDate?: string | null;
}

/** Collect the next installment, what the stage being collected needs (catching up), everything, or undo the last one. */
export type QuotaAction = "next" | "due" | "all" | "undo";

export type Role = "SUPERADMIN" | "ORGANIZER" | "SELLER";
// How a manual payment was collected in person — no gateway involved yet.
export type PaymentMethod = "cash" | "nequi" | "transfer" | "other";

/** A raffle's reservations from the public link: follow the organization, or force on/off. */
export type ReservationSetting = "inherit" | "on" | "off";

/** Settings that apply to a whole organization (its organizer changes them). */
export interface OrgSettingsDTO {
  /** Default for its raffles: may visitors of a public link reserve numbers? */
  publicReservations: boolean;
}

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
  /** Who sold it (kept when someone else later collects the payment) and when; null while available. */
  soldById: string | null;
  soldByName: string | null;
  soldAt: string | null;
  /** Reserved by a visitor of the public link rather than sold by the team. */
  online: boolean;
  /** Installments paid (raffles by stages only; empty otherwise), in order. */
  quotas: QuotaDTO[];
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
  drawTrigger: DrawTrigger;
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

/**
 * What anyone with the public link sees. Deliberately narrow: whether each
 * number is still free, never who has it, their phone, receipts or payments.
 */
export interface PublicRaffleDTO {
  name: string;
  prizeLabel: string | null;
  lottery: string | null;
  numberPrice: number;
  drawDate: string | null;
  drawTrigger: DrawTrigger;
  /** Totals only (never which numbers): progress toward a "when full" draw. */
  soldCount: number;
  paidCount: number;
  status: "active" | "closed";
  /** Only for a closed raffle. */
  winnerValue: number | null;
  totalNumbers: number;
  themeBackground: string | null;
  themeNumberColor: string | null;
  themeTextColor: string | null;
  accounts: RaffleAccountDTO[];
  /** Lettered sets in order; `sold` once someone has the whole set. */
  groups: { label: string; price: number; sold: boolean }[];
  /** A raffle by stages: its draws (no buyer names), the installment deadline and the up-front perk. */
  stages: Omit<RaffleStageDTO, "id" | "winnerName" | "drawnAt">[];
  stageDeadlineDays: number;
  fullPayPerk: FullPayPerk;
  fullPayDiscount: number | null;
  /** Every number: `sold` is true for anything taken (pending or paid); `group` is the set's letter. */
  numbers: { value: number; sold: boolean; group: string | null }[];
  /** Whether visitors can reserve from this page, and how many days they get to pay. */
  reservations: { open: boolean; holdDays: number | null; maxLoose: number; maxSets: number };
}

/** What a visitor sends to reserve: loose numbers and/or whole sets by letter. */
export interface ReserveInput {
  name: string;
  phone: string;
  numbers: number[];
  sets: string[];
}

export interface ReserveResultDTO {
  /** What the reservation comes to. */
  total: number;
  holdDays: number;
  numbers: number[];
  sets: string[];
  /** Secret that lets this visitor attach their payment receipt to the reservation afterwards. */
  receiptKey: string;
}

export type PublicLinkAction = "enable" | "disable" | "regenerate";

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
  drawTrigger: DrawTrigger;
  /** The moment a "when full" raffle filled up (null while it hasn't). */
  completedAt: string | null;
  status: "active" | "closed";
  /** The winning number once the raffle is closed; null while open or when closed without a draw. */
  winnerValue: number | null;
  closedAt: string | null;
  /** Days a sold-but-unpaid number may wait before it is overdue; null = never. */
  holdDays: number | null;
  /** Overdue numbers go back on sale by themselves (otherwise the team is only warned). */
  autoRelease: boolean;
  /** This raffle's choice for reservations from the public link (inherit = the organization's default). */
  publicReservations: ReservationSetting;
  /** Whether reservations are open right now (the setting is on, there is a payment deadline, the raffle is active). */
  reservationsOpen: boolean;
  /** Secret of the public read-only page (/p/<token>); null when there is none. */
  publicToken: string | null;
  numbers: RaffleNumberDTO[];
  accounts: RaffleAccountDTO[];
  /** Lettered sets in order (A, B, C…); empty for a raffle sold number by number. */
  groups: RaffleGroupDTO[];
  /** The draws of a raffle by stages, in order of play; empty for an ordinary raffle. */
  stages: RaffleStageDTO[];
  stageDeadlineDays: number;
  fullPayPerk: FullPayPerk;
  fullPayDiscount: number | null;
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
  drawTrigger?: DrawTrigger;
  themeBackground?: string | null;
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
  accounts?: RaffleAccountInput[];
  holdDays?: number | null;
  autoRelease?: boolean;
  publicReservations?: ReservationSetting;
  /** Sell in lettered sets; numbers not listed here remain loose and use `numberPrice`. */
  groups?: RaffleGroupInput[];
  /** A raffle by stages (can't be combined with sets): one installment per stage; `numberPrice` becomes their sum. */
  stages?: RaffleStageInput[];
  stageDeadlineDays?: number;
  fullPayPerk?: FullPayPerk;
  fullPayDiscount?: number | null;
  /** With fullPayPerk "draw": the bonus draw. */
  bonusStage?: RaffleStageInput | null;
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
  drawTrigger?: DrawTrigger;
  themeBackground?: string | null;
  themeNumberColor?: string | null;
  themeTextColor?: string | null;
  accounts?: RaffleAccountInput[];
  /** Days a sold-but-unpaid number may wait before it is overdue; null = they never expire. */
  holdDays?: number | null;
  autoRelease?: boolean;
  publicReservations?: ReservationSetting;
  /** Raffles by stages: prize/label/lottery/date of stages not yet drawn (installment prices are fixed). */
  stages?: RaffleStageInput[];
  stageDeadlineDays?: number;
  fullPayPerk?: FullPayPerk;
  fullPayDiscount?: number | null;
  bonusStage?: RaffleStageInput | null;
}

export interface UpdateNumberInput {
  status: NumberStatus;
  buyerName?: string | null;
  buyerPhone?: string | null;
  photoDataUrl?: string | null;
  paymentMethod?: PaymentMethod | null; // only meaningful when status is "paid"
  notes?: string | null;
  /**
   * Set by a screen that is selling a number it saw as available: if someone else took it in the
   * meantime (a visitor reserving from the public link, another seller) the save is refused with
   * a 409 instead of silently overwriting their sale.
   */
  expectAvailable?: boolean;
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
