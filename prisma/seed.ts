import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 10;

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
    { name: "Organizador", code: "123456" },
    { name: "Vendedor", code: "654321" },
  ];

  for (const { name, code } of credentials) {
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    await prisma.adminUser.create({
      data: { name, codeHash, active: true },
    });
  }

  console.log("Seed complete.");
  console.log("Login codes:");
  for (const { name, code } of credentials) {
    console.log(`  ${name}: ${code}`);
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
