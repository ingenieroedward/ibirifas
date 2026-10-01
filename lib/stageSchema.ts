import { z } from "zod";

export const stageInputSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1).max(40).optional(),
  prize: z.string().trim().min(1).max(80),
  price: z.number().int().positive().max(1_000_000_000).optional(),
  lottery: z.string().trim().max(80).nullable().optional(),
  drawDate: z.string().datetime().nullable().optional(),
});

/** A raffle by stages has between 2 and 6 paid draws. */
export const MAX_STAGES = 6;

