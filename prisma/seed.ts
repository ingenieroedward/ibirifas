import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

// In production, never fall back to the well-known dev codes (123456/654321) —
// use SEED_*_CODE if set, otherwise generate a random one and print it once.
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

async function main() {
  const existingRaffle = await prisma.raffle.findFirst();
  if (existingRaffle) {
    console.log("Seed skipped: a Raffle already exists in the database.");
    return;
  }

  const drawDate = new Date();
  drawDate.setDate(drawDate.getDate() + 14);

  const raffle = await prisma.raffle.create({
    data: {
      name: "Gran Rifa Sinuano Noche",
      prizeLabel: "Premio $500.000",
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

  const credentials = [
    { name: "Organizador", ...resolveCode("SEED_ORGANIZER_CODE", "123456") },
    { name: "Vendedor", ...resolveCode("SEED_SELLER_CODE", "654321") },
  ];

  for (const { name, code } of credentials) {
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    await prisma.adminUser.create({
      data: { name, codeHash, active: true },
    });
  }

  console.log("Seed complete.");
  console.log("Login codes:");
  for (const { name, code, generated } of credentials) {
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
