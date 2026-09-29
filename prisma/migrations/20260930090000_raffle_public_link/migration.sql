-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN "publicToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Raffle_publicToken_key" ON "Raffle"("publicToken");
