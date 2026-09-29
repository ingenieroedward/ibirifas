import { ImageResponse } from "next/og";
import { AppCard, OG_SIZE, ogFonts } from "@/lib/ogCards";

export const alt = "Ibirifas · Vende, cobra y comparte tus rifas";
export const size = OG_SIZE;
export const contentType = "image/png";

// The login segment sets its own Open Graph tags (see layout.tsx), and a child's
// tags replace the ones inherited from the root, so the picture lives here too.
export default async function Image() {
  return new ImageResponse(<AppCard />, { ...size, fonts: await ogFonts() });
}
