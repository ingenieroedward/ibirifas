import { formatCurrency, formatDrawDate, formatNumberValue } from "@/lib/format";
import { numbersOfGroup } from "@/lib/groups";
import type { RaffleDTO } from "@/lib/types";

/** Intl puts a non-breaking space after "$"; plain spaces paste better into a chat. */
function money(amount: number): string {
  return formatCurrency(amount).replace(/ /g, " ");
}

function priceRange(prices: number[]): string {
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
}

/**
 * The raffle as a chat message: what it is, what is still free and where to pay.
 * A plain raffle lists its free numbers; one sold in lettered sets lists each free
 * letter with its numbers (a sold set is left out), then the free loose numbers.
 * WhatsApp/Telegram render *asterisks* as bold.
 */
export function buildAvailabilityText(raffle: RaffleDTO, link?: string | null): string {
  const lines: string[] = [`*${raffle.name}*`];
  const hasSets = raffle.groups.length > 0;
  const free = raffle.numbers.filter((n) => n.status === "available").sort((a, b) => a.value - b.value);

  if (raffle.prizeLabel) lines.push(`Premio: ${raffle.prizeLabel}`);
  if (raffle.drawDate || raffle.lottery) {
    const when = raffle.drawDate ? `Sorteo el ${formatDrawDate(raffle.drawDate)}` : "Sorteo";
    lines.push(`${when}${raffle.lottery ? ` · ${raffle.lottery}` : ""}`);
  }

  if (hasSets) {
    const freeSets = raffle.groups.filter((g) => numbersOfGroup(raffle.numbers, g.id).every((n) => n.status === "available"));
    const freeLoose = free.filter((n) => n.groupId === null);
    lines.push(`Valor del conjunto: ${priceRange(raffle.groups.map((g) => g.price))}`);
    if (freeLoose.length > 0) lines.push(`Número suelto: ${money(raffle.numberPrice)} c/u`);
    lines.push("");
    if (freeSets.length === 0 && freeLoose.length === 0) {
      lines.push("Ya no quedan conjuntos ni números disponibles.");
    } else {
      if (freeSets.length > 0) {
        lines.push(`*Conjuntos disponibles (${freeSets.length} de ${raffle.groups.length})*`);
        for (const g of freeSets) {
          const nums = numbersOfGroup(raffle.numbers, g.id).map((n) => formatNumberValue(n.value)).join(" · ");
          lines.push(`*${g.label}* (${money(g.price)}): ${nums}`);
        }
      } else {
        lines.push("Ya no quedan conjuntos disponibles.");
      }
      if (freeLoose.length > 0) {
        lines.push("");
        lines.push(`*Números sueltos disponibles (${freeLoose.length})*`);
        lines.push(freeLoose.map((n) => formatNumberValue(n.value)).join(" · "));
      }
    }
  } else {
    lines.push(`Valor del número: ${money(raffle.numberPrice)}`);
    lines.push("");
    if (free.length === 0) lines.push("Ya no quedan números disponibles.");
    else {
      lines.push(`*Números disponibles (${free.length} de ${raffle.totalNumbers})*`);
      lines.push(free.map((n) => formatNumberValue(n.value)).join(" · "));
    }
  }

  if (raffle.accounts.length > 0) {
    lines.push("");
    lines.push("*Cuentas de pago*");
    for (const a of raffle.accounts) lines.push(`${a.label}: ${a.number}${a.holderName ? ` (${a.holderName})` : ""}`);
  }
  if (link) {
    lines.push("");
    lines.push(`${raffle.reservationsOpen ? "Reserva y mira lo disponible aquí" : "Mira lo disponible aquí"}: ${link}`);
  }
  return lines.join("\n");
}
