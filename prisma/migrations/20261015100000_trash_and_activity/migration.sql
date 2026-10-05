-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN "deletedAt" DATETIME;
ALTER TABLE "Raffle" ADD COLUMN "deletedByName" TEXT;
ALTER TABLE "Raffle" ADD COLUMN "trashedPublicToken" TEXT;

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ActivityLog_ownerId_createdAt_idx" ON "ActivityLog"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
