-- CreateTable
CREATE TABLE "RaffleGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "raffleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaffleGroup_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
-- A plain ADD COLUMN (instead of the table rebuild Prisma generates for a new
-- foreign key) so existing numbers, and the photos on them, are left untouched.
ALTER TABLE "RaffleNumber" ADD COLUMN "groupId" TEXT REFERENCES "RaffleGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "RaffleNumber_groupId_idx" ON "RaffleNumber"("groupId");

-- CreateIndex
CREATE INDEX "RaffleGroup_raffleId_idx" ON "RaffleGroup"("raffleId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleGroup_raffleId_label_key" ON "RaffleGroup"("raffleId", "label");
