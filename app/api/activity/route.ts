import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import type { ActivityDTO } from "@/lib/types";

/**
 * The record of what happened to raffles (lib/activity.ts): the platform owner sees every organization's, an
 * organizer their own. Newest first, the last 200.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (user.role !== "SUPERADMIN" && user.role !== "ORGANIZER") return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const rows = await prisma.activityLog.findMany({
    where: user.role === "SUPERADMIN" ? {} : { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const orgIds = [...new Set(rows.map((r) => r.ownerId).filter((v): v is string => Boolean(v)))];
  const orgs = user.role === "SUPERADMIN" && orgIds.length
    ? await prisma.adminUser.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true, orgCode: true } })
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.orgCode ? `${o.name} (${o.orgCode})` : o.name]));
  return NextResponse.json(
    rows.map((r) => {
      let details: Record<string, unknown> | null = null;
      try {
        details = r.details ? (JSON.parse(r.details) as Record<string, unknown>) : null;
      } catch {
        details = null;
      }
      return {
        id: r.id,
        organization: r.ownerId ? (orgName.get(r.ownerId) ?? null) : null,
        actorName: r.actorName,
        action: r.action,
        targetName: r.targetName,
        details,
        createdAt: r.createdAt.toISOString(),
      };
    }) satisfies ActivityDTO[],
  );
}
