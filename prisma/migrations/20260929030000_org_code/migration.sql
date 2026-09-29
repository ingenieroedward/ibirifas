-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "orgCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_orgCode_key" ON "AdminUser"("orgCode");
