import type { Metadata } from "next";
import { getReservation } from "@/lib/publicReservation";
import { ReservationView } from "@/components/ReservationView";

export const metadata: Metadata = {
  title: "Mi reserva · Ibirifas",
  robots: { index: false, follow: false },
};

/** "Mi reserva": the buyer's own reservation, from the link they got after reserving (and by email). */
export default async function ReservationPage({ params }: { params: Promise<{ token: string; key: string }> }) {
  const { token, key } = await params;
  const reservation = await getReservation(token, key);
  return <ReservationView token={token} reservationKey={key} initial={reservation} />;
}
