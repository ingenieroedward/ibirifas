import { ImageResponse } from "next/og";
import { AppCard, OG_SIZE, ogFonts } from "@/lib/ogCards";

export const alt = "Ibirifas · Vende, cobra y comparte tus rifas";
export const size = OG_SIZE;
export const contentType = "image/png";

// The card the login link (and any page without its own) shows when shared.
export default async function Image() {
  return new ImageResponse(<AppCard />, { ...size, fonts: await ogFonts() });
}
