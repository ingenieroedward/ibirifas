/*
  Warnings:

  - Added the required column `role` to the `AdminUser` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownerId` to the `Raffle` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    CONSTRAINT "AdminUser_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AdminUser" ("active", "codeHash", "createdAt", "id", "name") SELECT "active", "codeHash", "createdAt", "id", "name" FROM "AdminUser";
DROP TABLE "AdminUser";
ALTER TABLE "new_AdminUser" RENAME TO "AdminUser";
CREATE INDEX "AdminUser_ownerId_idx" ON "AdminUser"("ownerId");
CREATE TABLE "new_Raffle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prizeLabel" TEXT,
    "numberPrice" INTEGER NOT NULL,
    "totalNumbers" INTEGER NOT NULL DEFAULT 100,
    "drawDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Raffle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "AdminUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Raffle" ("createdAt", "drawDate", "id", "name", "numberPrice", "prizeLabel", "status", "totalNumbers") SELECT "createdAt", "drawDate", "id", "name", "numberPrice", "prizeLabel", "status", "totalNumbers" FROM "Raffle";
DROP TABLE "Raffle";
ALTER TABLE "new_Raffle" RENAME TO "Raffle";
CREATE INDEX "Raffle_ownerId_idx" ON "Raffle"("ownerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
