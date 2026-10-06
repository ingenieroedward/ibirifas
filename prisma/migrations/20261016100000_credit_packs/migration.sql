-- CreateTable
CREATE TABLE "CreditPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "pack" TEXT NOT NULL,
    "raffles" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "raffleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditPurchase_chargeId_key" ON "CreditPurchase"("chargeId");

-- CreateIndex
CREATE INDEX "CreditPurchase_ownerId_createdAt_idx" ON "CreditPurchase"("ownerId", "createdAt");
