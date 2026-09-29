-- Plain ADD COLUMNs (no table rebuild) so existing numbers and their photos are left untouched.

-- AlterTable
ALTER TABLE "RaffleNumber" ADD COLUMN "soldAt" DATETIME;
ALTER TABLE "RaffleNumber" ADD COLUMN "soldById" TEXT REFERENCES "AdminUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN "holdDays" INTEGER;
ALTER TABLE "Raffle" ADD COLUMN "autoRelease" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Raffle" ADD COLUMN "expiryNoticeAt" DATETIME;

-- Numbers sold before this migration: the best we know is whoever touched them last, and when.
UPDATE "RaffleNumber" SET "soldAt" = "updatedAt", "soldById" = "updatedById" WHERE "status" <> 'available';

-- CreateIndex
CREATE INDEX "RaffleNumber_soldById_idx" ON "RaffleNumber"("soldById");
