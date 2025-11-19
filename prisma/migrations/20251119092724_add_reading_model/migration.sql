/*
  Warnings:

  - You are about to drop the column `air_humidity` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `air_temp` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `light` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `pump_status` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `soil_moisture` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `soil_ph` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `soil_temp` on the `Report` table. All the data in the column will be lost.
  - You are about to drop the column `sprinkler_status` on the `Report` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "mdnsName" TEXT NOT NULL,
    "lastIp" TEXT,
    "lastSeen" DATETIME,
    "farmId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reading" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "deviceId" TEXT,
    "payload" JSONB NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reading_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temp" REAL,
    "humAir" REAL,
    "humSuelo" INTEGER,
    "bomba" BOOLEAN,
    "auto" BOOLEAN,
    "potencia" INTEGER,
    "min" INTEGER,
    "max" INTEGER,
    "analisisIA" TEXT,
    CONSTRAINT "Report_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Report" ("farmId", "id", "ts") SELECT "farmId", "id", "ts" FROM "Report";
DROP TABLE "Report";
ALTER TABLE "new_Report" RENAME TO "Report";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Device_mdnsName_key" ON "Device"("mdnsName");

-- CreateIndex
CREATE INDEX "Reading_farmId_ts_idx" ON "Reading"("farmId", "ts");

-- CreateIndex
CREATE INDEX "Reading_deviceId_ts_idx" ON "Reading"("deviceId", "ts");
