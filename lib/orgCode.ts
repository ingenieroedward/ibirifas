/**
 * The "organization code" is the first half of logging in: it says which
 * organizer's team you belong to, so the 6-digit code only has to be unique
 * inside that team instead of across the whole platform.
 *
 * Pure helpers only (no database), so the login screen and forms can use them.
 */

export const ORG_CODE_MAX = 30;

// 3-30 characters: lowercase letters, digits and hyphens, never starting or
// ending with a hyphen. Easy to say out loud and to type on a phone.
const ORG_CODE_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export const ORG_CODE_HELP = "3 a 30 caracteres: letras minúsculas, números o guiones (ej. rifas-norte).";

/** What people type is compared case-insensitively and ignoring stray spaces. */
export function normalizeOrgCode(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidOrgCode(code: string): boolean {
  return ORG_CODE_RE.test(code);
}

/** "Rifas del Norte" -> "rifas-del-norte"; always returns something valid. */
export function slugifyOrgCode(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ORG_CODE_MAX)
    .replace(/-+$/, "");

  if (slug.length >= 3) return slug;
  return slug ? `${slug}-org` : "org";
}

// No 0/o, 1/l/i: easy to read out loud and to type from a message.
const ORG_CODE_RANDOM_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** "org-k7m2xq": a random organization code for when a name-based one isn't wanted. */
export function generateOrgCode(): string {
  const bytes = new Uint32Array(6);
  const limit = Math.floor(0x1_0000_0000 / ORG_CODE_RANDOM_ALPHABET.length) * ORG_CODE_RANDOM_ALPHABET.length;
  let out = "";
  while (out.length < 6) {
    crypto.getRandomValues(bytes);
    for (const n of bytes) {
      if (n < limit && out.length < 6) out += ORG_CODE_RANDOM_ALPHABET[n % ORG_CODE_RANDOM_ALPHABET.length];
    }
  }
  return `org-${out}`;
}

/** `base`, then `base-2`, `base-3`… (kept within the length limit) until `isTaken` says it's free. */
export async function firstFreeOrgCode(base: string, isTaken: (code: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  for (let n = 2; await isTaken(candidate); n++) {
    const suffix = `-${n}`;
    candidate = `${base.slice(0, ORG_CODE_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
  }
  return candidate;
}
