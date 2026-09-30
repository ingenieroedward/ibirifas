import { NextResponse, type NextRequest } from "next/server";

export type JsonBody = { ok: true; value: unknown } | { ok: false; response: NextResponse };

/** Sizes in bytes for the different kinds of request (JSON text, so a photo's base64 counts in full). */
export const BODY_LIMITS = {
  small: 16 * 1024,
  medium: 512 * 1024,
  /** A compressed receipt photo as a data URL, plus a little. */
  receipt: 2.2 * 1024 * 1024,
  /** A photo of up to 3 MB as a data URL plus the rest of the fields. */
  photo: 4.5 * 1024 * 1024,
} as const;

/**
 * Reads a request's JSON body without letting anyone make the server swallow an arbitrarily large one:
 * a declared length over the limit is refused before reading anything (413), and a body that lies about
 * its length (or is streamed with no length) is cut off as soon as it goes over. Unparseable JSON is a 400.
 */
export async function readJsonBody(req: NextRequest, maxBytes: number): Promise<JsonBody> {
  const tooLarge = () => ({
    ok: false as const,
    response: NextResponse.json({ error: "La solicitud es demasiado grande" }, { status: 413 }),
  });
  const invalid = () => ({
    ok: false as const,
    response: NextResponse.json({ error: "Solicitud inválida" }, { status: 400 }),
  });

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();

  if (!req.body) return invalid();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return invalid();
  }

  try {
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return invalid();
  }
}

/**
 * The image formats a receipt photo may be: what a phone camera or a screenshot produces. Never SVG (it can
 * carry scripts) or anything else that starts with "data:image/".
 */
export const RECEIPT_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,/;
