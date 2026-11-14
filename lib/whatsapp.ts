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

// --- Messages to everyone at once (the organizer's broadcast) -------------------------------------------------

/** Replaced by each buyer's first name; dropped (with its space) when the message goes to a group. */
export const NAME_TOKEN = "{nombre}";

const dayMonth = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC" });
const monthOnly = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" });

const ORDINAL = ["primer", "segundo", "tercer", "cuarto", "quinto", "sexto", "séptimo", "octavo", "noveno", "décimo"];

interface BroadcastStage {
  position: number;
  prize: string;
  bonus: boolean;
  lottery: string | null;
  drawDate: string | null;
  outcome: "won" | "house" | null;
}

export interface BroadcastContext {
  raffleName: string;
  /** The raffle's own prize and draw (raffles without stages). */
  prize: string | null;
  drawDate: string | null;
  lottery: string | null;
  stages: BroadcastStage[];
  /** The public page, so whoever reads it can see the board. */
  link?: string | null;
}

/**
 * The organizer's message to every buyer — "ya tenemos nuestro primer ganador… este 30 de noviembre vamos por
 * otros $500.000… seguimos hasta diciembre por el gran premio" — built from the raffle's stages. It is only a
 * starting point: the organizer edits it before sending. {nombre} becomes each buyer's first name.
 */
export function buildBroadcastMessage(c: BroadcastContext): string {
  const lines = [`🎉 ¡Hola ${NAME_TOKEN}! Te escribimos de *${c.raffleName}*.`, ""];
  const stages = [...c.stages].sort((a, b) => a.position - b.position);

  if (stages.length > 0) {
    const winners = stages.filter((s) => s.outcome === "won").length;
    const played = stages.filter((s) => s.outcome !== null).length;
    const open = stages.filter((s) => s.outcome === null);
    const next = open[0] ?? null;
    // The big one: the last draw that isn't the bonus for numbers paid up front.
    const final = [...stages].reverse().find((s) => !s.bonus) ?? stages[stages.length - 1]!;

    if (winners > 0) {
      lines.push(
        winners === 1
          ? "¡Recuerda que ya tenemos nuestro primer ganador y tú puedes ser el próximo! 🏆"
          : `¡Recuerda que ya tenemos ${winners} ganadores y tú puedes ser el próximo! 🏆`,
      );
    } else if (played > 0) {
      lines.push("¡El premio sigue en juego y tú puedes ser el ganador! 🏆");
    }

    if (next) {
      const lottery = next.lottery || c.lottery;
      const when = next.drawDate ? `Este ${dayMonth.format(new Date(next.drawDate))}` : `En el ${ORDINAL[played] ?? "próximo"} sorteo`;
      const isFinal = next === final;
      lines.push(
        isFinal
          ? `${when} jugamos el gran premio de *${next.prize}*${lottery ? `, con el resultado de *${lottery}*` : ""}. 💰`
          : `${when} vamos por ${played > 0 ? "otros " : ""}*${next.prize}*${lottery ? `, jugando con el resultado de *${lottery}*` : ""}. 💰`,
      );
      if (!isFinal && final.outcome === null) {
        const month = final.drawDate ? ` hasta ${monthOnly.format(new Date(final.drawDate))}` : "";
        lines.push(`Y esto no termina aquí… ¡Seguimos${month} por el gran premio de *${final.prize}*! 🔥`);
      }
      lines.push("", "¡Mantente activo, conserva tu número y prepárate para ser el próximo ganador! 🍀");
    } else {
      lines.push("¡Gracias por participar con nosotros! Muy pronto te contamos de la próxima rifa. 🙌");
    }
  } else {
    const when = c.drawDate ? `Este ${dayMonth.format(new Date(c.drawDate))}` : "Muy pronto";
    lines.push(
      `${when} jugamos${c.prize ? ` *${c.prize}*` : " el premio"}${c.lottery ? ` con el resultado de *${c.lottery}*` : ""}. 💰`,
      "",
      "¡Conserva tu número y prepárate para ganar! 🍀",
    );
  }

  lines.push("¡La suerte puede estar de tu lado!");
  if (c.link) lines.push("", `Mira los números aquí: ${c.link}`);
  return lines.join("\n");
}

/** The broadcast for one buyer (their first name) or for a group (name dropped), plus an optional personal line. */
export function personalizeBroadcast(text: string, buyerName: string | null, extra?: string | null): string {
  const body = buyerName
    ? text.split(NAME_TOKEN).join(firstName(buyerName))
    : text.replace(new RegExp(`\\s?${NAME_TOKEN.replace(/[{}]/g, "\\$&")}`, "g"), "");
  return extra ? `${body.trimEnd()}\n\n${extra}` : body;
}

/** The line added to a buyer's copy when they owe: what, how much and by when. */
export function broadcastDueLine(c: { sets: string[]; looseValues: number[]; amount: number; lastDay?: string | null }): string {
  return `Recuerda: para jugar con ${describeHoldings(c.sets, c.looseValues)} te falta pagar *${money(c.amount)}*${c.lastDay ? ` antes de terminar el ${c.lastDay}` : ""}.`;
}
