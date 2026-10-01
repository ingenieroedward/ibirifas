-- AlterTable
ALTER TABLE "RaffleNumber" ADD COLUMN "privacyConsentAt" DATETIME;

-- CreateTable
CREATE TABLE "RaffleVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "raffleId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "visitor" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaffleVisit_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RaffleVisit_raffleId_day_idx" ON "RaffleVisit"("raffleId", "day");
CREATE UNIQUE INDEX "RaffleVisit_raffleId_day_visitor_key" ON "RaffleVisit"("raffleId", "day", "visitor");
