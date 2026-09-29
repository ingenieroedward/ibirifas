import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
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
}

export function buildReminderMessage(c: ReminderContext): string {
  const lines = [
    `Hola ${firstName(c.buyerName)} 👋`,
    "",
    `Te escribo por tu participación en la rifa *${c.raffleName}*: tienes ${describeHoldings(c.sets, c.looseValues)} pendiente${c.sets.length + c.looseValues.length > 1 ? "s" : ""} de pago.`,
    `Total: *${money(c.amount)}*`,
  ];

  if (c.accounts.length > 0) {
    lines.push("", "Puedes pagar por:");
    for (const account of c.accounts) {
      lines.push(`• ${account.label}: ${account.number}${account.holderName ? ` (${account.holderName})` : ""}`);
    }
    lines.push("", "Cuando pagues, envíame el comprobante por aquí.");
  }

  if (c.drawDate || c.lottery) {
    const when = c.drawDate ? `el ${formatDrawDate(c.drawDate)}` : "";
    const lottery = c.lottery ? `con la lotería ${c.lottery}` : "";
    lines.push("", `El sorteo es ${[when, lottery].filter(Boolean).join(" ")}.`);
  }

  lines.push("", "¡Gracias y mucha suerte! 🍀");
  return lines.join("\n");
}

export function buildReceiptMessage(c: MessageContext & { paymentMethodLabel?: string | null }): string {
  return [
    `Hola ${firstName(c.buyerName)} 👋`,
    "",
    `Recibimos tu pago de *${money(c.amount)}* por ${describeHoldings(c.sets, c.looseValues)} de la rifa *${c.raffleName}*${c.paymentMethodLabel ? ` (${c.paymentMethodLabel})` : ""}. ✅`,
    "",
    "¡Gracias y mucha suerte! 🍀",
  ].join("\n");
}
