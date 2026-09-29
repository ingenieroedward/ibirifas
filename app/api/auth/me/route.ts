import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import type { MeDTO } from "@/lib/types";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const dto: MeDTO = { id: user.id, name: user.name, role: user.role, plan: user.plan, orgCode: user.orgCode };
  return NextResponse.json(dto);
}
