import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import { accountLine } from "@/lib/accountText";
import type { RaffleAccountDTO } from "@/lib/types";

/**
 * Messages a seller sends a buyer through WhatsApp's click-to-chat link
 * (wa.me): nothing to integrate or pay for, the seller's own WhatsApp sends it.
 */

/**
 * Digits only, with Colombia's country code added to a bare 10-digit mobile
 * number (3XX XXX XXXX). Returns null when there's nothing usable, and the caller
 * falls back to letting the seller pick the contact.
 */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^3\d{9}$/.test(digits)) return `57${digits}`;
  // Already with a country code (any country): plausible international length.
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** wa.me link; without a usable phone it opens WhatsApp's contact picker with the text ready. */
export function whatsAppUrl(phone: string | null | undefined, text: string): string {
  const number = normalizeWhatsAppPhone(phone);
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(text)}`;
}

/** Intl puts a non-breaking space after "$"; plain spaces read better in a chat. */
function money(amount: number): string {
  return formatCurrency(amount).replace(/ /g, " ");
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "el conjunto A y los números 07, 21" — what the buyer holds, in words. */
export function describeHoldings(sets: string[], looseValues: number[]): string {
  const parts: string[] = [];
  if (sets.length === 1) parts.push(`el conjunto ${sets[0]}`);
  else if (sets.length > 1) parts.push(`los conjuntos ${sets.slice(0, -1).join(", ")} y ${sets[sets.length - 1]}`);
  if (looseValues.length === 1) parts.push(`el número ${formatNumberValue(looseValues[0]!)}`);
  else if (looseValues.length > 1) {
    const list = [...looseValues].sort((a, b) => a - b).map(formatNumberValue).join(", ");
    parts.push(`los números ${list}`);
  }
  return parts.join(" y ");
}

interface MessageContext {
  buyerName: string;
  raffleName: string;
  /** What is being talked about (the unpaid part for a reminder, the paid part for a receipt). */
  sets: string[];
  looseValues: number[];
  amount: number;
}

export interface ReminderContext extends MessageContext {
  accounts: RaffleAccountDTO[];
  drawDate: string | null;
  lottery: string | null;
  /** For a raffle played when it fills up and with no date yet: "cuando se vendan todos los números". */
  drawCondition?: string | null;
  /** A raffle by stages: what the payment is for, replacing the "pendiente de pago" sentence and the draw line. */
  stageNote?: string | null;
}

export function buildReminderMessage(c: ReminderContext): string {
  const lines = [
    `Hola ${firstName(c.buyerName)} 👋`,
    "",
    c.stageNote
      ? `Te escribo por tu participación en la rifa *${c.raffleName}* con ${describeHoldings(c.sets, c.looseValues)}. ${c.stageNote}`
      : `Te escribo por tu participación en la rifa *${c.raffleName}*: tienes ${describeHoldings(c.sets, c.looseValues)} pendiente${c.sets.length + c.looseValues.length > 1 ? "s" : ""} de pago.`,
    `${c.stageNote ? "Valor" : "Total"}: *${money(c.amount)}*`,
  ];

  if (c.accounts.length > 0) {
    lines.push("", "Puedes pagar por:");
    for (const account of c.accounts) {
      lines.push(`• ${accountLine(account)}`);
    }
    lines.push("", "Cuando pagues, envíame el comprobante por aquí.");
  }

  if (!c.stageNote && (c.drawDate || c.lottery || c.drawCondition)) {
    const when = c.drawDate ? `el ${formatDrawDate(c.drawDate)}` : (c.drawCondition ?? "");
    const lottery = c.lottery ? `con la lotería ${c.lottery}` : "";
    lines.push("", `El sorteo es ${[when, lottery].filter(Boolean).join(" ")}.`);
  }

  lines.push("", "¡Gracias y mucha suerte! 🍀");
  return lines.join("\n");
}

export function buildReceiptMessage(
  c: MessageContext & {
    paymentMethodLabel?: string | null;
    /** A raffle by stages: how far along the installments are ("Llevas 2 de 3 cuotas."). */
    progress?: string | null;
  },
): string {
  return [
    `Hola ${firstName(c.buyerName)} 👋`,
    "",
    c.progress
      ? `Tus pagos por ${describeHoldings(c.sets, c.looseValues)} de la rifa *${c.raffleName}* suman *${money(c.amount)}*. ${c.progress} ✅`
      : `Recibimos tu pago de *${money(c.amount)}* por ${describeHoldings(c.sets, c.looseValues)} de la rifa *${c.raffleName}*${c.paymentMethodLabel ? ` (${c.paymentMethodLabel})` : ""}. ✅`,
    "",
    "¡Gracias y mucha suerte! 🍀",
  ].join("\n");
}

export interface WinnerContext {
  buyerName: string | null;
  raffleName: string;
  winnerValue: number;
  prize: string | null;
  /** A raffle by stages: which draw it was. */
  stageLabel?: string | null;
  lottery: string | null;
  drawDate: string | null;
  /** "Gana Más": the extra prize it won ("Al revés") and the number that came out (the main one). */
  prizeLabel?: string | null;
  drawnValue?: number | null;
}

/** "¡Felicitaciones! Tu número ganó…" — what the organizer sends the winner after registering the result. */
export function buildWinnerMessage(c: WinnerContext): string {
  const when = [c.lottery, c.drawDate ? formatDrawDate(c.drawDate) : null].filter(Boolean).join(" · ");
  return [
    `Hola${c.buyerName ? ` ${firstName(c.buyerName)}` : ""} 🎉`,
    "",
    c.prizeLabel && c.drawnValue !== undefined && c.drawnValue !== null
      ? `¡Felicitaciones! En el sorteo de la rifa *${c.raffleName}* salió el *${formatNumberValue(c.drawnValue)}* y tu número *${formatNumberValue(c.winnerValue)}* ganó el premio *${c.prizeLabel.toLowerCase()}*${c.prize ? `: *${c.prize}*` : ""} 🏆`
      : `¡Felicitaciones! En el sorteo${c.stageLabel ? ` de *${c.stageLabel}*` : ""} de la rifa *${c.raffleName}* salió el *${formatNumberValue(c.winnerValue)}* y es tuyo: ganaste${c.prize ? ` *${c.prize}*` : " el premio"} 🏆`,
    ...(when ? [`(${when})`] : []),
    "",
    "Escríbeme para coordinar la entrega del premio.",
  ].join("\n");
}
