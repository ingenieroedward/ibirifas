-- AlterTable
ALTER TABLE "RaffleAccount" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'bank';
ALTER TABLE "RaffleAccount" ADD COLUMN "keyType" TEXT;
ALTER TABLE "RaffleAccount" ADD COLUMN "qrDataUrl" TEXT;
ALTER TABLE "RaffleAccount" ADD COLUMN "hasQr" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RaffleNumber" ADD COLUMN "payerName" TEXT;
