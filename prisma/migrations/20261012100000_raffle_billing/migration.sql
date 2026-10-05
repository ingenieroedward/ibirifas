-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "billingExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AdminUser" ADD COLUMN "freeRaffleUsedAt" DATETIME;
ALTER TABLE "AdminUser" ADD COLUMN "raffleCredits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN "activatedAt" DATETIME;
ALTER TABLE "Raffle" ADD COLUMN "activationKind" TEXT;
ALTER TABLE "Raffle" ADD COLUMN "activationAmount" INTEGER;
ALTER TABLE "Raffle" ADD COLUMN "activationChargeId" TEXT;

-- Raffles that existed before billing keep selling.
UPDATE "Raffle" SET "activatedAt" = "createdAt", "activationKind" = 'legacy';
