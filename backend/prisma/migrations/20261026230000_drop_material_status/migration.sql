-- Materials are no longer switched off (decision 2026-10-26): drop the ACTIVE/INACTIVE status.
DROP INDEX "materials_status_idx";

ALTER TABLE "materials" DROP COLUMN "status";

DROP TYPE "MaterialStatus";
