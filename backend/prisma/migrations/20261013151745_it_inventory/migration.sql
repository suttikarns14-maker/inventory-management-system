/*
  Warnings:

  - You are about to drop the column `location` on the `materials` table. All the data in the column will be lost.
  - Added the required column `requester_name` to the `stock_transactions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TrackingType" AS ENUM ('QUANTITY', 'SERIAL');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('IN_STOCK', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "DepartmentKind" AS ENUM ('MAIN', 'SUB');

-- AlterTable
ALTER TABLE "materials" DROP COLUMN "location",
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "storage_location_id" TEXT,
ADD COLUMN     "tracking_type" "TrackingType" NOT NULL DEFAULT 'QUANTITY';

-- AlterTable
ALTER TABLE "stock_transactions" ADD COLUMN     "building_id" TEXT,
ADD COLUMN     "fiscal_year" INTEGER,
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "project_name" TEXT,
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "requester_id" TEXT,
ADD COLUMN     "requester_name" TEXT NOT NULL,
ADD COLUMN     "requesting_department_id" TEXT,
ADD COLUMN     "using_department_id" TEXT;

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DepartmentKind" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_units" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "is_temp_serial" BOOLEAN NOT NULL DEFAULT false,
    "status" "UnitStatus" NOT NULL DEFAULT 'IN_STOCK',
    "storage_location_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "material_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_units" (
    "transaction_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "remark" TEXT,

    CONSTRAINT "transaction_units_pkey" PRIMARY KEY ("transaction_id","unit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_name_key" ON "buildings"("name");

-- CreateIndex
CREATE UNIQUE INDEX "storage_locations_name_key" ON "storage_locations"("name");

-- CreateIndex
CREATE INDEX "material_units_material_id_status_idx" ON "material_units"("material_id", "status");

-- CreateIndex
CREATE INDEX "material_units_is_temp_serial_idx" ON "material_units"("is_temp_serial");

-- CreateIndex
CREATE INDEX "transaction_units_unit_id_idx" ON "transaction_units"("unit_id");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_requesting_department_id_fkey" FOREIGN KEY ("requesting_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_using_department_id_fkey" FOREIGN KEY ("using_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_units" ADD CONSTRAINT "material_units_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_units" ADD CONSTRAINT "material_units_storage_location_id_fkey" FOREIGN KEY ("storage_location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_units" ADD CONSTRAINT "transaction_units_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "stock_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_units" ADD CONSTRAINT "transaction_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "material_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- Rules Prisma cannot express (spec v2.2 §2.3) ----
-- A serial number identifies one physical item: unique regardless of letter case.
CREATE UNIQUE INDEX "material_units_serial_lower_key" ON "material_units" (lower("serial_number"));
