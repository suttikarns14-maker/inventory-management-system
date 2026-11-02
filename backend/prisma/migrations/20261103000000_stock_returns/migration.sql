-- D18: returns are IN transactions linked to the OUT they take items back from.
ALTER TABLE "stock_transactions" ADD COLUMN "return_of_id" TEXT;

CREATE INDEX "stock_transactions_return_of_id_idx" ON "stock_transactions"("return_of_id");

ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_return_of_id_fkey" FOREIGN KEY ("return_of_id") REFERENCES "stock_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_return_is_in" CHECK ("return_of_id" IS NULL OR "type" = 'IN');
