-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "pagoradarAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_pagoradarAccountId_key" ON "AdminUser"("pagoradarAccountId");
