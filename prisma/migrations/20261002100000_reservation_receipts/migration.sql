-- AlterTable
ALTER TABLE "RaffleNumber" ADD COLUMN "holdToken" TEXT;

-- CreateIndex
CREATE INDEX "RaffleNumber_holdToken_idx" ON "RaffleNumber"("holdToken");
