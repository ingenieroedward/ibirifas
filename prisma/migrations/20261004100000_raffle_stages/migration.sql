-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN "stageDeadlineDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Raffle" ADD COLUMN "fullPayPerk" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Raffle" ADD COLUMN "fullPayDiscount" INTEGER;

-- CreateTable
CREATE TABLE "RaffleStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "raffleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "prize" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "bonus" BOOLEAN NOT NULL DEFAULT false,
    "lottery" TEXT,
    "drawDate" DATETIME,
    "winnerValue" INTEGER,
    "outcome" TEXT,
    "winnerName" TEXT,
    "drawnAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RaffleStage_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NumberQuota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numberId" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "quota" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byId" TEXT,
    CONSTRAINT "NumberQuota_numberId_fkey" FOREIGN KEY ("numberId") REFERENCES "RaffleNumber" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RaffleStage_raffleId_idx" ON "RaffleStage"("raffleId");
CREATE UNIQUE INDEX "RaffleStage_raffleId_position_key" ON "RaffleStage"("raffleId", "position");
CREATE INDEX "NumberQuota_raffleId_idx" ON "NumberQuota"("raffleId");
CREATE UNIQUE INDEX "NumberQuota_numberId_quota_key" ON "NumberQuota"("numberId", "quota");
