import type { ExtraPrize, PrizeKind, PrizeWin } from "@/lib/prizes";
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
export type PaymentMethod = "cash" | "nequi" | "breb" | "transfer" | "other";

/** A raffle's reservations from the public link: follow the organization, or force on/off. */
export type ReservationSetting = "inherit" | "on" | "off";

/** Settings that apply to a whole organization (its organizer changes them). */
export interface OrgSettingsDTO {
  /** Default for its raffles: may visitors of a public link reserve numbers? */
  publicReservations: boolean;
  /** Where buyers' replies to our emails go; also where the test email is sent. */
  contactEmail: string | null;
  /** Read-only: the server has email set up (SMTP). */
  mailEnabled?: boolean;
  /** Read-only: this organization's account is connected to pagoradar (bank payment notices). */
  paymentsEnabled?: boolean;
  /** A bank payment that matches exactly one reservation is approved on its own. */
  autoApprovePayments?: boolean;
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
  /** An organizer who hasn't accepted the current terms of use yet (the app asks before anything else). */
  needsTerms?: boolean;
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
  /** Email left by an online buyer, where they are told about their reservation. */
  buyerEmail: string | null;
  /** The team rejected the receipt this buyer sent (and why); cleared when they send another or pay. */
  receiptRejectedAt: string | null;
  receiptRejectReason: string | null;
  /** Who owns the account the buyer paid from, as they typed it with the receipt. */
  payerName: string | null;
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
  /** It can sell (activated, or its organization doesn't pay). See lib/billing.ts. */
  active: boolean;
}

// A payment account the organizer publishes on the raffle (Nequi, Bancolombia,
// etc.), ordered as entered. `holderName` ("responsable") is shown only when set.
export type BrebKeyType = "phone" | "email" | "document" | "alias" | "other";

export interface RaffleAccountDTO {
  id: string;
  label: string;
  /** The account number, or the llave for a Bre-B account. */
  number: string;
  holderName: string | null;
  /** "bank": a regular account; "breb": a Bre-B llave. */
  kind: "bank" | "breb";
  keyType: BrebKeyType | null;
  /** The account has a QR image (served at /api/accounts/<id>/qr). */
  hasQr: boolean;
}

/**
 * What anyone with the public link sees. Deliberately narrow: whether each
 * number is still free, never who has it, their phone, receipts or payments.
 */
export interface PublicRaffleDTO {
  name: string;
  extraPrizes: ExtraPrize[];
  /** Once closed with the lottery result: the winning numbers of every prize (never who has them). */
  prizeResults: { kind: PrizeKind; value: number; prize: string | null; won: boolean }[];
  prizeLabel: string | null;
  permit: string | null;
  lottery: string | null;
  numberPrice: number;
  drawDate: string | null;
  /** "21:00" in Colombia; null = no time. */
  drawTime: string | null;
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
  /** `email`: the server can send email, so the reservation form asks for one (optional). */
  reservations: {
    open: boolean;
    holdDays: number | null;
    /** When the draw comes first: the last day to pay (the day before the draw). Null when `holdDays` rules. */
    payBy: string | null;
    /** When they close: the moment of the draw (the last stage's). Null without a date. */
    closesAt: string | null;
    /** They closed because the draw's time arrived (`open` is false then). */
    closedByDraw: boolean;
    /** It's the draw day: a reservation made now is due at the time of the draw (`closesAt`). */
    dueAtDraw: boolean;
    maxLoose: number;
    maxSets: number;
    email: boolean;
    /** Cloudflare Turnstile site key when the anti-bot check is on; null otherwise. */
    turnstileSiteKey: string | null;
  };
}

/** What a visitor sends to reserve: loose numbers and/or whole sets by letter. */
export interface ReserveInput {
  name: string;
  phone: string;
  email?: string;
  turnstileToken?: string;
  numbers: number[];
  sets: string[];
}

export interface ReserveResultDTO {
  /** What the reservation comes to. */
  total: number;
  holdDays: number;
  /** The last day to pay when the draw comes before `holdDays` would (the day before the draw). */
  payBy: string | null;
  /** Reserved on the draw day: due at the time of the draw (that moment). */
  dueAt: string | null;
  numbers: number[];
  sets: string[];
  /** Secret that lets this visitor attach their payment receipt to the reservation afterwards. */
  receiptKey: string;
}

/** Visits to a raffle's public link (see lib/visits.ts). People are counted once a day. */
export interface VisitStatsDTO {
  today: number;
  last7: number;
  /** People-days since the link was shared (one person on three days counts 3). */
  total: number;
  /** Page openings, repeats included. */
  views: number;
  last14: { day: string; visitors: number }[];
}

/** One online reservation as its buyer sees it on "Mi reserva" (see lib/publicReservation.ts). */
export interface ReservationDTO {
  raffleName: string;
  raffleClosed: boolean;
  buyerName: string | null;
  /** They left an email: we'll write to them when something changes. */
  hasEmail: boolean;
  sets: { label: string; price: number }[];
  numbers: number[];
  total: number;
  /** pending: waiting for payment · review: receipt sent, not checked yet · rejected: the receipt wasn't valid · paid. */
  state: "pending" | "review" | "rejected" | "paid";
  rejectReason: string | null;
  /** When an unpaid reservation is freed; null once something was paid or with no deadline. */
  deadline: string | null;
  accounts: RaffleAccountDTO[];
  /** Raffles by stages: installments paid and what's owed. */
  stages: {
    paid: number;
    total: number;
    paidAmount: number;
    owed: number;
    dueNow: number;
    nextStage: string | null;
    lastDay: string | null;
  } | null;
  themeBackground: string | null;
  themeNumberColor: string | null;
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
  /** The raffle's permit as the organizer wrote it (shown on the public page and the image); null = none given. */
  permit: string | null;
  lottery: string | null;
  numberPrice: number;
  totalNumbers: number;
  drawDate: string | null;
  /** "21:00" in Colombia, for the draw day (and every stage's); public reservations close then. */
  drawTime: string | null;
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
  /** "Gana Más": extra prizes decided by the same lottery result (lib/prizes.ts). */
  extraPrizes: ExtraPrize[];
  /** The lottery result it was closed with ("3847"), and the prizes it gave. */
  lotteryResult: string | null;
  prizeResults: PrizeWin[];
  /** It can sell (activated, or its organization doesn't pay). See lib/billing.ts. */
  active: boolean;
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
  kind?: "bank" | "breb";
  keyType?: BrebKeyType | null;
  /** A new QR image (data URL), or null to remove it. */
  qrDataUrl?: string | null;
  /** Keep the QR image of this existing account (editing replaces the accounts as a whole). */
  qrFrom?: string;
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
  extraPrizes?: ExtraPrize[];
  prizeLabel?: string | null;
  permit?: string | null;
  lottery?: string | null;
  numberPrice: number;
  totalNumbers?: number; // defaults to 100
  drawDate?: string | null;
  drawTime?: string | null;
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
  extraPrizes?: ExtraPrize[];
  /** With status "closed": the lottery's full result; the winner and the extra prizes come out of it. */
  lotteryResult?: string | null;
  /** "closed" ends the sales; "active" reopens the raffle (and forgets the winner). */
  status?: "active" | "closed";
  /** Only with status "closed": the number that won, or null for a raffle closed without a draw. */
  winnerValue?: number | null;
  name?: string;
  prizeLabel?: string | null;
  permit?: string | null;
  lottery?: string | null;
  numberPrice?: number;
  drawDate?: string | null;
  drawTime?: string | null;
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
  // The buyer's receipt isn't valid: remove it and tell them why (they can send another).
  | { action: "rejectReceipt"; ids: string[]; reason?: string | null }
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
  /** Organizers only, for the platform owner: billing (lib/billing.ts). */
  billing?: { exempt: boolean; credits: number; freeUsed: boolean };
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
  /** SUPERADMIN only, on an organizer: never pays for raffles. */
  billingExempt?: boolean;
  /** SUPERADMIN only, on an organizer: raffles it can activate without paying (any size). */
  raffleCredits?: number;
}

export interface ApiErrorBody {
  error: string;
}

// ---------- Payments reported by the bank (pagoradar)

export type ReceivedPaymentStatus = "auto" | "approved" | "review" | "unmatched" | "ignored";

/** An open reservation a payment could belong to (or, for manual assignment, any open reservation). */
export interface PaymentCandidateDTO {
  key: string;
  raffleId: string;
  raffleName: string;
  numberIds: string[];
  items: string;
  buyerName: string | null;
  payerName: string | null;
  online: boolean;
  hasReceipt: boolean;
  amount: number;
  soldAt: string | null;
  /** How the bank's holder name compares with what the buyer typed (or their own name). */
  nameMatch: "strong" | "weak" | "none";
}

export interface ReceivedPaymentDTO {
  id: string;
  bank: string;
  bankLabel: string;
  method: string | null;
  amount: number;
  payerName: string;
  payerBank: string | null;
  reference: string | null;
  paidAt: string;
  status: ReceivedPaymentStatus;
  raffleId: string | null;
  matchLabel: string | null;
  note: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  /** Only for payments waiting for the team. */
  candidates: PaymentCandidateDTO[];
}

export interface ReceivedPaymentsDTO {
  /** The server is connected to pagoradar for this organization. */
  enabled: boolean;
  autoApprove: boolean;
  pending: number;
  payments: ReceivedPaymentDTO[];
}

/** An organization's own receiving account in pagoradar (Mi equipo → Pagos Bre-B automáticos). */
export interface PaymentsAccountDTO {
  /** The server can connect accounts (pagoradar's API is configured). */
  available: boolean;
  /** Payments arrive through the server's old single-organization setup (PAGORADAR_ORG). */
  legacy: boolean;
  autoApprove: boolean;
  /** pagoradar couldn't be reached just now. */
  unreachable?: boolean;
  account: null | {
    id: string;
    address: string;
    ownerEmails: string[];
    banks: string[];
    status: "pending" | "active" | "disabled";
    confirmationCode: string | null;
    confirmationLink: string | null;
    confirmationAt: string | null;
    lastPaymentAt: string | null;
    gmailFilterFrom: string;
  };
}

/** A raffle's activation (GET /api/raffles/<id>/activation). */
export interface ActivationStateDTO {
  active: boolean;
  kind: "legacy" | "exempt" | "free" | "credit" | "paid" | null;
  /** How it would be activated now: the free raffle, a credit, or paying (null when active). */
  option: "free" | "credit" | "pay" | null;
  price: number;
  credits: number;
  /** A payment under way: the page where to pay. */
  checkoutUrl: string | null;
  /** Paying online is set up (pagoradar); otherwise it's by hand, through WhatsApp. */
  payOnline: boolean;
  /** The platform owner's WhatsApp for paying by hand (digits), when configured. */
  whatsapp: string | null;
}

/** A raffle in the trash (GET /api/raffles/trash). */
export interface TrashedRaffleDTO {
  id: string;
  name: string;
  deletedAt: string;
  deletedByName: string | null;
  /** When it will be purged for good. */
  purgeAt: string;
  winnerValue: number | null;
}

/** One entry of the activity record (GET /api/activity). */
export interface ActivityDTO {
  id: string;
  /** For the platform owner: which organization. */
  organization: string | null;
  actorName: string;
  action: "raffle.trashed" | "raffle.restored" | "raffle.purged" | string;
  targetName: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}
