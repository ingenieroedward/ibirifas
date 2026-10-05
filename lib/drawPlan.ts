import { formatDrawWhen } from "@/lib/format";
import type { DrawTrigger } from "@/lib/types";

/** What decides when a raffle is played. */
export interface DrawPlanInput {
  drawDate: string | null;
  /** "21:00" in Colombia, when the raffle has a time. */
  drawTime?: string | null;
  drawTrigger: DrawTrigger;
  /** Numbers that are taken (sold, paid or not). */
  soldCount: number;
  paidCount: number;
  totalNumbers: number;
}

export const DRAW_TRIGGER_LABEL: Record<DrawTrigger, string> = {
  date: "En una fecha",
  sold: "Cuando se vendan todos los números",
  paid: "Cuando se paguen todos los números",
};

/** "cuando se vendan todos los números", for running text. */
export function triggerCondition(trigger: Exclude<DrawTrigger, "date">): string {
  return trigger === "sold" ? "cuando se vendan todos los números" : "cuando se paguen todos los números";
}

export interface DrawPlan {
  /** The condition to fill the raffle is met (always false for a raffle played on a date). */
  complete: boolean;
  /** How far along it is, for the two "when full" triggers; null for a dated raffle. */
  progress: { done: number; total: number; noun: string } | null;
  /** The organizer still has to set the date: the raffle is full and has none. */
  needsDate: boolean;
  /** The sentence about when it is played, or null when there is nothing to say yet. */
  line: string | null;
}

export function drawPlanOf(input: DrawPlanInput): DrawPlan {
  const { drawDate, drawTime, drawTrigger, soldCount, paidCount, totalNumbers } = input;
  if (drawTrigger === "date") {
    return { complete: false, progress: null, needsDate: false, line: drawDate ? `Sorteo el ${formatDrawWhen(drawDate, drawTime)}` : null };
  }
  const done = drawTrigger === "sold" ? soldCount : paidCount;
  const complete = totalNumbers > 0 && done >= totalNumbers;
  const noun = drawTrigger === "sold" ? "vendidos" : "pagados";
  let line: string;
  if (drawDate) line = `Sorteo el ${formatDrawWhen(drawDate, drawTime)}`;
  else if (complete) line = "Sorteo: fecha por confirmar";
  else line = `Sorteo ${triggerCondition(drawTrigger)}`;
  return {
    complete,
    progress: complete ? null : { done, total: totalNumbers, noun },
    needsDate: complete && !drawDate,
    line,
  };
}

/** The same plan from a raffle's numbers. */
export function drawPlanFromNumbers(raffle: {
  drawDate: string | null;
  drawTime?: string | null;
  drawTrigger: DrawTrigger;
  numbers: { status: string }[];
  totalNumbers: number;
}): DrawPlan {
  return drawPlanOf({
    drawDate: raffle.drawDate,
    drawTime: raffle.drawTime,
    drawTrigger: raffle.drawTrigger,
    soldCount: raffle.numbers.filter((n) => n.status !== "available").length,
    paidCount: raffle.numbers.filter((n) => n.status === "paid").length,
    totalNumbers: raffle.totalNumbers,
  });
}
