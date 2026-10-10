import { drawPlanFromNumbers } from "@/lib/drawPlan";
import { combosLine } from "@/lib/combos";
import { accountLine } from "@/lib/accountText";
import { formatCurrency, formatNumberValue, formatDrawWhen } from "@/lib/format";
import { installmentPrices, lastPayDay, paidStages, sortedStages, stagesPrizeSummary, totalPrice } from "@/lib/stages";
import { numbersOfGroup } from "@/lib/groups";
import { extraPrizesLine } from "@/lib/prizes";
import type { FullPayPerk, RaffleDTO, RaffleStageDTO } from "@/lib/types";

/** Intl puts a non-breaking space after "$"; plain spaces paste better into a chat. */
function money(amount: number): string {
  return formatCurrency(amount).replace(/ /g, " ");
}

function priceRange(prices: number[]): string {
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
}

type StagesInfo = {
  stages: Pick<RaffleStageDTO, "position" | "label" | "prize" | "price" | "bonus" | "lottery" | "drawDate" | "outcome" | "winnerValue">[];
  stageDeadlineDays: number;
  fullPayPerk: FullPayPerk;
  fullPayDiscount: number | null;
  lottery: string | null;
  drawTime?: string | null;
};

/** A raffle by stages, as chat lines: each draw (with its result once played), the installments and the perk. */
export function stageChatLines(raffle: StagesInfo): string[] {
  const stages = sortedStages(raffle.stages);
  const paid = paidStages(stages);
  const prices = installmentPrices(stages);
  const total = totalPrice(stages);
  const lines = ["*Sorteos* (juegas con el mismo número en todos)"];
  for (const st of stages) {
    const when = st.drawDate ? ` · ${formatDrawWhen(st.drawDate, raffle.drawTime)}` : "";
    const lottery = st.lottery || raffle.lottery;
    const result =
      st.winnerValue !== null && st.winnerValue !== undefined
        ? ` → salió el ${formatNumberValue(st.winnerValue)}${st.outcome === "won" ? " ✅" : " (queda en la casa)"}`
        : "";
    lines.push(`${st.bonus ? "🎁" : "•"} ${st.label}: *${st.prize}*${when}${lottery ? ` · ${lottery}` : ""}${result}`);
  }
  const same = new Set(prices).size === 1;
  lines.push(
    "",
    `Valor del número: ${money(total)}, en ${prices.length} cuotas${same ? ` de ${money(prices[0]!)}` : `: ${prices.map(money).join(" + ")}`}.`,
  );
  const firstDay = paid[0] ? lastPayDay(paid[0], raffle.stageDeadlineDays) : null;
  const days = raffle.stageDeadlineDays;
  lines.push(
    `Cada cuota debe estar paga ${days === 0 ? "a más tardar el día" : `${days} ${days === 1 ? "día" : "días"} antes`} de su sorteo; si sale un número que no está al día, el premio queda en la casa.`,
  );
  const bonus = stages.find((st) => st.bonus);
  if (raffle.fullPayPerk === "discount" && raffle.fullPayDiscount) {
    lines.push(`Pagando todo de una${firstDay ? ` (hasta el ${firstDay})` : ""}: *${money(total - raffle.fullPayDiscount)}*.`);
  } else if (raffle.fullPayPerk === "draw" && bonus) {
    lines.push(`Pagando todo de una${firstDay ? ` (hasta el ${firstDay})` : ""} juegas también ${bonus.label}: *${bonus.prize}*.`);
  }
  return lines;
}

/**
 * The raffle as a chat message: what it is, what is still free and where to pay.
 * A plain raffle lists its free numbers; one sold in lettered sets lists each free
 * letter with its numbers (a sold set is left out), then the free loose numbers.
 * WhatsApp/Telegram render *asterisks* as bold.
 */
export function buildAvailabilityText(raffle: RaffleDTO, link?: string | null): string {
  const lines: string[] = [`*${raffle.name}*`];
  if (raffle.permit) lines.push(`Permiso: ${raffle.permit}`);
  const hasSets = raffle.groups.length > 0;
  const free = raffle.numbers.filter((n) => n.status === "available").sort((a, b) => a.value - b.value);

  const prize = raffle.prizeLabel || stagesPrizeSummary(raffle.stages);
  if (prize) lines.push(`Premio: ${prize}`);
  if (raffle.extraPrizes.length > 0) lines.push(`Gana Más: ${extraPrizesLine(raffle.extraPrizes, raffle.totalNumbers)}`);
  const byStages = raffle.stages.length > 0;
  const plan = drawPlanFromNumbers(raffle);
  if (byStages) {
    lines.push("", ...stageChatLines(raffle));
  } else if (plan.line || raffle.lottery) {
    lines.push(`${plan.line ?? "Sorteo"}${raffle.lottery ? ` · ${raffle.lottery}` : ""}`);
  }
  if (plan.progress) lines.push(`Avance: ${plan.progress.done} de ${plan.progress.total} ${plan.progress.noun}`);

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
    if (!byStages) lines.push(`Valor del número: ${money(raffle.numberPrice)}`);
    if (!byStages && raffle.combos.length > 0) lines.push(`Combos: ${combosLine(raffle.combos)}`);
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
    for (const a of raffle.accounts) lines.push(accountLine(a));
  }
  if (link) {
    lines.push("");
    lines.push(`${raffle.reservationsOpen ? "Reserva y mira lo disponible aquí" : "Mira lo disponible aquí"}: ${link}`);
  }
  return lines.join("\n");
}
