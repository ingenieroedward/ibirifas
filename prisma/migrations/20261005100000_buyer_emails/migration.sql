-- AlterTable
ALTER TABLE "RaffleNumber" ADD COLUMN "buyerEmail" TEXT;
ALTER TABLE "RaffleNumber" ADD COLUMN "receiptRejectedAt" DATETIME;
ALTER TABLE "RaffleNumber" ADD COLUMN "receiptRejectReason" TEXT;

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "contactEmail" TEXT;
