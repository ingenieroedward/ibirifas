-- Plain ADD COLUMNs (no table rebuild) so existing numbers and their photos are left untouched.

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "publicReservations" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN "publicReservations" TEXT;

-- AlterTable
ALTER TABLE "RaffleNumber" ADD COLUMN "online" BOOLEAN NOT NULL DEFAULT false;
