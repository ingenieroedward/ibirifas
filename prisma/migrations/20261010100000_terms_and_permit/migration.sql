-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "termsAcceptedAt" DATETIME;

-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN "permit" TEXT;
