import type { Metadata } from "next";
import { requestOrigin } from "@/lib/siteUrl";

// What a shared login link (…/login?org=rifas-norte) looks like in WhatsApp & co.
// The picture comes from app/opengraph-image.tsx; it needs the site's absolute address.
export async function generateMetadata(): Promise<Metadata> {
  const description = "Entra con el código de tu organización y tu código de 6 dígitos.";
  return {
    metadataBase: await requestOrigin(),
    title: "Ingresar · Ibirifas",
    description,
    robots: { index: false, follow: false },
    openGraph: { title: "Ibirifas · Ingresar", description, siteName: "Ibirifas", type: "website", locale: "es_CO" },
    twitter: { card: "summary_large_image", title: "Ibirifas · Ingresar", description },
  };
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
