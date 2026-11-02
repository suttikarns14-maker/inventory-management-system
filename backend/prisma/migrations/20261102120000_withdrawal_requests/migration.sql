-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "request_no" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_id" TEXT NOT NULL,
    "requester_id" TEXT,
    "requester_name" TEXT NOT NULL,
    "requesting_department_id" TEXT NOT NULL,
    "using_department_id" TEXT NOT NULL,
    "building_id" TEXT,
    "floor" TEXT,
    "purpose" TEXT,
    "note" TEXT,
    "requester_signature" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMPTZ(3),
    "reject_reason" TEXT,
    "approver_signature" TEXT,
    "transaction_id" TEXT,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_request_items" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "approved_quantity" INTEGER,

    CONSTRAINT "withdrawal_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_request_no_key" ON "withdrawal_requests"("request_no");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_transaction_id_key" ON "withdrawal_requests"("transaction_id");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_created_at_idx" ON "withdrawal_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "withdrawal_requests_created_by_id_idx" ON "withdrawal_requests"("created_by_id");

-- CreateIndex
CREATE INDEX "withdrawal_requests_requester_id_idx" ON "withdrawal_requests"("requester_id");

-- CreateIndex
CREATE INDEX "withdrawal_request_items_material_id_idx" ON "withdrawal_request_items"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_request_items_request_id_material_id_key" ON "withdrawal_request_items"("request_id", "material_id");

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_requesting_department_id_fkey" FOREIGN KEY ("requesting_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_using_department_id_fkey" FOREIGN KEY ("using_department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "stock_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request_items" ADD CONSTRAINT "withdrawal_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "withdrawal_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawal_request_items" ADD CONSTRAINT "withdrawal_request_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Quantities stay positive integers; an approval may only lower them (D17).
ALTER TABLE "withdrawal_request_items" ADD CONSTRAINT "withdrawal_request_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "withdrawal_request_items" ADD CONSTRAINT "withdrawal_request_items_approved_quantity_check" CHECK ("approved_quantity" BETWEEN 0 AND "quantity");
