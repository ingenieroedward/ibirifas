import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { firstFreeOrgCode, slugifyOrgCode } from "@/lib/orgCode";

/**
 * A "team" is an organizer plus their sellers. Login codes only have to be
 * unique inside a team (people also say which organization they're in when
 * they log in), so this is the whole collision check.
 */
export async function codeUsedInTeam(organizerId: string, code: string, exceptUserId?: string): Promise<boolean> {
  const team = await prisma.adminUser.findMany({
    where: {
      active: true,
      id: exceptUserId ? { not: exceptUserId } : undefined,
      OR: [{ id: organizerId }, { ownerId: organizerId }],
    },
  });
  for (const member of team) {
    if (await bcrypt.compare(code, member.codeHash)) return true;
  }
  return false;
}

export async function orgCodeTaken(orgCode: string, exceptUserId?: string): Promise<boolean> {
  const found = await prisma.adminUser.findFirst({
    where: { orgCode, id: exceptUserId ? { not: exceptUserId } : undefined },
    select: { id: true },
  });
  return found !== null;
}

/** A free organization code derived from an organization's name. */
export function uniqueOrgCodeFromName(name: string): Promise<string> {
  return firstFreeOrgCode(slugifyOrgCode(name), (code) => orgCodeTaken(code));
}
