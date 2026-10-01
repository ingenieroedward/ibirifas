/**
 * Client-side image resize/compress helper.
 *
 * Buyer receipt photos come straight from the phone camera and can easily be
 * several megabytes — far too large to round-trip as base64 JSON. This caps
 * the longest side and re-encodes as JPEG before we ever build the data URL.
 */
export interface ResizeOptions {
  /** Longest side, in pixels, of the output image. */
  maxSize?: number;
  /** JPEG quality, 0–1. */
  quality?: number;
  /** Output format: JPEG for photos, PNG for things that must stay sharp (a QR code). */
  type?: "image/jpeg" | "image/png";
}

export async function fileToCompressedDataUrl(
  file: File,
  { maxSize = 1000, quality = 0.72, type = "image/jpeg" }: ResizeOptions = {},
): Promise<string> {
  const bitmap = await loadImage(file);
  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, maxSize / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen");

    if (type === "image/jpeg") {
      // JPEG has no transparency: a transparent PNG would otherwise turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    return type === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

async function loadImage(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Safari-on-old-iOS fallback path via HTMLImageElement.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo leer la imagen"));
      el.src = url;
    });
    return img as unknown as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}
