/**
 * Random codes for the "Generar aleatorio" buttons. Runs in the browser, so it
 * uses Web Crypto (never Math.random) and rejection sampling to avoid modulo bias.
 */

/** Uniform integer in [0, max) from crypto randomness. */
export function randomBelow(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 0x1_0000_0000) throw new RangeError("max out of range");
  const limit = Math.floor(0x1_0000_0000 / max) * max; // values >= limit would skew the result
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/** 000000, 111111, 123456, 654321… are the first things anyone would guess. */
export function isGuessableCode(code: string): boolean {
  if (/^(\d)\1+$/.test(code)) return true;
  const steps = code.split("").map((c, i, a) => (i === 0 ? 0 : Number(c) - Number(a[i - 1]))).slice(1);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

/** A random 6-digit access code that isn't trivially guessable. */
export function generateAccessCode(length = 6): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < length; i++) code += String(randomBelow(10));
    if (!isGuessableCode(code)) return code;
  }
}
