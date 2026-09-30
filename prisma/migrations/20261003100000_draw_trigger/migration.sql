-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN "drawTrigger" TEXT NOT NULL DEFAULT 'date';
ALTER TABLE "Raffle" ADD COLUMN "completedAt" DATETIME;
