import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
// The runtime image only ships this one file from lib/ (see the Dockerfile).
import { firstFreeOrgCode, isValidOrgCode, normalizeOrgCode, slugifyOrgCode } from "../lib/orgCode";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

// In production, never fall back to the well-known dev codes — use SEED_*_CODE
// if set, otherwise generate a random one and print it once.
function resolveCode(envVar: string, devFallback: string): { code: string; generated: boolean } {
  const fromEnv = process.env[envVar];
  if (fromEnv) {
    if (!/^\d{6}$/.test(fromEnv)) {
      throw new Error(`${envVar} must be exactly 6 digits`);
    }
    return { code: fromEnv, generated: false };
  }
  if (process.env.NODE_ENV === "production") {
    return { code: crypto.randomInt(0, 1_000_000).toString().padStart(6, "0"), generated: true };
  }
  return { code: devFallback, generated: false };
}

/**
 * Organizers created before organization codes existed get one derived from
 * their name ("Rifas del Norte" -> "rifas-del-norte"). Idempotent, and it runs
 * on every start (before the "already seeded" early return below), so it also
 * covers organizers that get created without one by any other path.
 */
async function backfillOrgCodes() {
  const missing = await prisma.adminUser.findMany({
    where: { role: "ORGANIZER", orgCode: null },
    orderBy: { createdAt: "asc" },
  });
  for (const organizer of missing) {
    const orgCode = await firstFreeOrgCode(slugifyOrgCode(organizer.name), async (candidate) => {
      return (await prisma.adminUser.findUnique({ where: { orgCode: candidate }, select: { id: true } })) !== null;
    });
    await prisma.adminUser.update({ where: { id: organizer.id }, data: { orgCode } });
    console.log(`Organization code assigned: "${organizer.name}" -> ${orgCode}`);
  }
}

async function main() {
  await backfillOrgCodes();

  const existingSuperadmin = await prisma.adminUser.findFirst({ where: { role: "SUPERADMIN" } });
  if (existingSuperadmin) {
    console.log("Seed skipped: a SUPERADMIN already exists in the database.");
    return;
  }

  const printable: { name: string; code: string; generated: boolean }[] = [];
  const hash = (code: string) => bcrypt.hash(code, BCRYPT_ROUNDS);

  const superadmin = resolveCode("SEED_SUPERADMIN_CODE", "999999");
  printable.push({ name: "Superadmin", ...superadmin });
  await prisma.adminUser.create({
    data: { name: "Superadmin", codeHash: await hash(superadmin.code), role: "SUPERADMIN", active: true },
  });

  const demoOrgCode = normalizeOrgCode(process.env.SEED_ORG_CODE || "demo");
  if (!isValidOrgCode(demoOrgCode)) {
    throw new Error(`SEED_ORG_CODE must be 3-30 lowercase letters, digits or hyphens (got "${demoOrgCode}")`);
  }

  const organizer = resolveCode("SEED_ORGANIZER_CODE", "123456");
  printable.push({ name: "Organizador", ...organizer });
  const organizerUser = await prisma.adminUser.create({
    data: {
      name: "Organizador Demo",
      codeHash: await hash(organizer.code),
      role: "ORGANIZER",
      plan: "free",
      active: true,
      orgCode: demoOrgCode,
    },
  });

  const seller = resolveCode("SEED_SELLER_CODE", "654321");
  printable.push({ name: "Vendedor", ...seller });
  await prisma.adminUser.create({
    data: {
      name: "Vendedor Demo",
      codeHash: await hash(seller.code),
      role: "SELLER",
      ownerId: organizerUser.id,
      active: true,
    },
  });

  // UTC midnight, matching how the raffle form stores a picked calendar day.
  const now = new Date();
  const drawDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));

  const raffle = await prisma.raffle.create({
    data: {
      ownerId: organizerUser.id,
      name: "Gran Rifa Sinuano Noche",
      prizeLabel: "Premio $500.000",
      lottery: "Sinuano Noche",
      numberPrice: 10000,
      totalNumbers: 100,
      drawDate,
      status: "active",
    },
  });

  await prisma.raffleNumber.createMany({
    data: Array.from({ length: 100 }, (_, value) => ({
      raffleId: raffle.id,
      value,
      status: "available",
    })),
  });

  console.log("Seed complete.");
  console.log(`Organization code (for the organizer and seller logins): ${demoOrgCode}`);
  console.log("Login codes (the superadmin logs in with no organization code):");
  for (const { name, code, generated } of printable) {
    console.log(`  ${name}: ${code}${generated ? "  (auto-generated — save it, won't be shown again)" : ""}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
