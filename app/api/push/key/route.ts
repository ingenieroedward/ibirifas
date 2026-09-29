import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getVapidPublicKey } from "@/lib/push";

/** The public key a browser needs to subscribe; null when the server has push turned off. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}
