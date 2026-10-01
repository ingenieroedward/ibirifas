-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "autoApprovePayments" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ReceivedPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "method" TEXT,
    "amount" INTEGER NOT NULL,
    "payerName" TEXT NOT NULL,
    "payerBank" TEXT,
    "reference" TEXT,
    "paidAt" DATETIME NOT NULL,
    "sourceReceivedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "raffleId" TEXT,
    "matchLabel" TEXT,
    "note" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "ReceivedPayment_ownerId_status_idx" ON "ReceivedPayment"("ownerId", "status");

-- CreateIndex
CREATE INDEX "ReceivedPayment_ownerId_sourceReceivedAt_idx" ON "ReceivedPayment"("ownerId", "sourceReceivedAt");
