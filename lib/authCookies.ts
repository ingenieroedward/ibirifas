// Cookie name constants only — no Node-only deps (crypto/jsonwebtoken), so this
// file is safe to import from edge middleware without pulling lib/auth.ts's
// Node runtime code into the edge bundle.
export const ACCESS_TOKEN_COOKIE = "ibirifas_at";
export const REFRESH_TOKEN_COOKIE = "ibirifas_rt";
