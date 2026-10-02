/**
 * The platform's terms of use (/terminos). Organizers accept them before working: Ibirifas is a management tool
 * and each organizer answers for their own raffles (permit, prize, buyers' data). Bump TERMS_UPDATED_AT when the
 * text changes in substance and every organizer is asked to accept again.
 */
export const TERMS_UPDATED_AT = new Date("2026-10-02T00:00:00.000Z");

/** Only organizers accept the terms (their sellers work under them; the platform owner wrote them). */
export function needsTerms(role: string, termsAcceptedAt: Date | null): boolean {
  return role === "ORGANIZER" && (!termsAcceptedAt || termsAcceptedAt < TERMS_UPDATED_AT);
}
