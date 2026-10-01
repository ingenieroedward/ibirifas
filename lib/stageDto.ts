import type { RaffleStage } from "@prisma/client";
import type { RaffleStageDTO } from "@/lib/types";

export function toStageDTO(s: RaffleStage): RaffleStageDTO {
  return {
    id: s.id,
    position: s.position,
    label: s.label,
    prize: s.prize,
    price: s.price,
    bonus: s.bonus,
    lottery: s.lottery,
    drawDate: s.drawDate ? s.drawDate.toISOString() : null,
    winnerValue: s.winnerValue,
    outcome: s.outcome === "won" || s.outcome === "house" ? s.outcome : null,
    winnerName: s.winnerName,
    drawnAt: s.drawnAt ? s.drawnAt.toISOString() : null,
  };
}

export const stagesInclude = { orderBy: { position: "asc" as const } };
