-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PackRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "raffleId" TEXT,
    "pack" TEXT NOT NULL,
    "raffles" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "payerName" TEXT,
    "receiptDataUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectReason" TEXT,
    "reviewedAt" DATETIME,
    "reviewedByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PackRequest_status_createdAt_idx" ON "PackRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PackRequest_ownerId_createdAt_idx" ON "PackRequest"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PackRequest_raffleId_createdAt_idx" ON "PackRequest"("raffleId", "createdAt");
