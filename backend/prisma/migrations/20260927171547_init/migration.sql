-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF', 'USER');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "current_quantity" INTEGER NOT NULL DEFAULT 0,
    "min_stock" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "status" "MaterialStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transactions" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "reference_no" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "note" TEXT,
    "reversal_of_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transaction_items" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2),

    CONSTRAINT "stock_transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_counters" (
    "date" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "reference_counters_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");

-- CreateIndex
CREATE INDEX "materials_category_id_idx" ON "materials"("category_id");

-- CreateIndex
CREATE INDEX "materials_status_idx" ON "materials"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transactions_reference_no_key" ON "stock_transactions"("reference_no");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transactions_reversal_of_id_key" ON "stock_transactions"("reversal_of_id");

-- CreateIndex
CREATE INDEX "stock_transactions_type_created_at_idx" ON "stock_transactions"("type", "created_at");

-- CreateIndex
CREATE INDEX "stock_transactions_created_by_id_idx" ON "stock_transactions"("created_by_id");

-- CreateIndex
CREATE INDEX "stock_transaction_items_material_id_idx" ON "stock_transaction_items"("material_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transaction_items_transaction_id_material_id_key" ON "stock_transaction_items"("transaction_id", "material_id");

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "stock_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transaction_items" ADD CONSTRAINT "stock_transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "stock_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transaction_items" ADD CONSTRAINT "stock_transaction_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- Rules Prisma cannot express (spec §3) ----
-- Last line of defence: stock can never go negative, even if application code is wrong.
ALTER TABLE "materials"
  ADD CONSTRAINT "materials_current_quantity_nonneg" CHECK ("current_quantity" >= 0),
  ADD CONSTRAINT "materials_min_stock_nonneg" CHECK ("min_stock" >= 0);

ALTER TABLE "stock_transaction_items"
  ADD CONSTRAINT "stock_transaction_items_quantity_positive" CHECK ("quantity" > 0);

-- "Admin" and "admin" are the same account.
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (lower("username"));
