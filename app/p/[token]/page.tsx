import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicRaffleView } from "@/components/PublicRaffleView";
import { formatCurrency } from "@/lib/format";
import { stagesPrizeSummary } from "@/lib/stages";
import { getPublicRaffle } from "@/lib/publicRaffle";
import { requestOrigin } from "@/lib/siteUrl";

// Always fresh: what's still available changes with every sale.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const raffle = await getPublicRaffle(token);
  // Private link: keep it out of search engines whatever it holds.
  const robots = { index: false, follow: false };
  if (!raffle) return { metadataBase: await requestOrigin(), title: "Rifa no disponible · Ibirifas", robots };

  const available = raffle.numbers.filter((n) => !n.sold).length;
  const prize = raffle.prizeLabel || stagesPrizeSummary(raffle.stages);
  const description =
    raffle.status === "closed"
      ? "Rifa cerrada."
      : `${prize ? `${prize} · ` : ""}${available} ${available === 1 ? "número disponible" : "números disponibles"}${
          raffle.groups.length === 0 ? ` a ${formatCurrency(raffle.numberPrice)}` : ""
        }`;
  return {
    // The picture (app/p/[token]/opengraph-image.tsx) needs the site's absolute address.
    metadataBase: await requestOrigin(),
    title: `${raffle.name} · números disponibles`,
    description,
    robots,
    openGraph: { title: raffle.name, description, siteName: "Ibirifas", type: "website", locale: "es_CO" },
    twitter: { card: "summary_large_image", title: raffle.name, description },
  };
}

export default async function PublicRafflePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const raffle = await getPublicRaffle(token);

  // A real 404, so nothing (a crawler, a link preview) mistakes a dead link for a page.
  if (!raffle) notFound();

  return <PublicRaffleView token={token} initial={raffle} />;
}
