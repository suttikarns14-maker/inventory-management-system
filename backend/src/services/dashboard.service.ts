import type { z } from 'zod';
import type { topWithdrawnSchema } from '../dtos/index.js';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { IMPORT_DEFAULT_MIN_STOCK } from '../utils/constants.js';
import { bangkokDate, bangkokDayStart, DAY_MS, daysAgo } from '../utils/date.js';

// Spec §6. Response shapes: frontend/src/app/shared/models/dashboard.ts

/** Decision D4 */
export const USAGE_WINDOW_DAYS = 90;
export const ALERT_DAYS = 14;
export const COVERAGE_DAYS = 30;

/** Real usage only: an OUT that was not reversed, and is not itself a reversal of an IN. */
const REAL_WITHDRAWAL = Prisma.sql`
  t.type = 'OUT'
  AND t.reversal_of_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM stock_transactions r WHERE r.reversal_of_id = t.id)`;

/**
 * Latest purchase price of material `m` (decision: latest price, not a weighted average):
 * the unit price of the newest non-reversed IN line that has one. Use in a LEFT JOIN LATERAL.
 */
const LATEST_PRICE = Prisma.sql`
  SELECT i.unit_price::float8 AS price
  FROM stock_transaction_items i
  JOIN stock_transactions t ON t.id = i.transaction_id
  WHERE i.material_id = m.id AND t.type = 'IN' AND i.unit_price IS NOT NULL
    AND t.reversal_of_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM stock_transactions r WHERE r.reversal_of_id = t.id)
  ORDER BY t.created_at DESC
  LIMIT 1`;

export async function summary() {
  const monthStart = bangkokDayStart(`${bangkokDate().slice(0, 7)}-01`);
  const [counts] = await prisma.$queryRaw<
    { activeMaterials: number; outOfStockCount: number; neverWithdrawnCount: number; withdrawalsThisMonth: number }[]
  >`
    SELECT
      (SELECT COUNT(*) FROM materials WHERE status = 'ACTIVE')::int AS "activeMaterials",
      (SELECT COUNT(*) FROM materials WHERE status = 'ACTIVE' AND current_quantity = 0)::int AS "outOfStockCount",
      (SELECT COUNT(*) FROM materials m
        WHERE m.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM stock_transaction_items i
            JOIN stock_transactions t ON t.id = i.transaction_id
            WHERE i.material_id = m.id AND ${REAL_WITHDRAWAL}))::int AS "neverWithdrawnCount",
      (SELECT COUNT(*) FROM stock_transactions t
        WHERE ${REAL_WITHDRAWAL} AND t.created_at >= ${monthStart})::int AS "withdrawalsThisMonth"`;

  // Materials never bought with a price count as 0; how many is reported as unpricedCount.
  const byCategory = await prisma.$queryRaw<{ id: string; name: string; value: number; unpriced: number }[]>`
    SELECT c.id, c.name,
           COALESCE(SUM(m.current_quantity * p.price), 0)::float8 AS value,
           COUNT(*) FILTER (WHERE p.price IS NULL AND m.current_quantity > 0)::int AS unpriced
    FROM materials m
    JOIN categories c ON c.id = m.category_id
    LEFT JOIN LATERAL (${LATEST_PRICE}) p ON true
    WHERE m.status = 'ACTIVE'
    GROUP BY c.id
    ORDER BY value DESC, c.name`;

  const [dataQuality] = await prisma.$queryRaw<
    { tempSerials: number; defaultMinStock: number; missingDepartments: number }[]
  >`
    SELECT
      (SELECT COUNT(*) FROM material_units WHERE is_temp_serial AND status <> 'VOID')::int AS "tempSerials",
      (SELECT COUNT(*) FROM materials
        WHERE status = 'ACTIVE' AND min_stock = ${IMPORT_DEFAULT_MIN_STOCK})::int AS "defaultMinStock",
      (SELECT COUNT(*) FROM stock_transactions t
        WHERE ${REAL_WITHDRAWAL}
          AND (t.requesting_department_id IS NULL OR t.using_department_id IS NULL))::int AS "missingDepartments"`;

  return {
    ...counts!,
    reorderCount: (await reorderSuggestions()).length,
    stockValue: byCategory.reduce((sum, c) => sum + c.value, 0),
    unpricedCount: byCategory.reduce((sum, c) => sum + c.unpriced, 0),
    valueByCategory: byCategory.map(({ id, name, value }) => ({ id, name, value })),
    dataQuality: dataQuality!,
  };
}

export async function reorderSuggestions() {
  const rows = await prisma.$queryRaw<
    { id: string; code: string; name: string; brand: string | null; model: string | null; unit: string; currentQuantity: number; minStock: number; used: number }[]
  >`
    SELECT m.id, m.code, m.name, m.brand, m.model, m.unit,
           m.current_quantity AS "currentQuantity", m.min_stock AS "minStock",
           COALESCE(u.used, 0)::int AS used
    FROM materials m
    LEFT JOIN (
      SELECT i.material_id, SUM(i.quantity) AS used
      FROM stock_transaction_items i
      JOIN stock_transactions t ON t.id = i.transaction_id
      WHERE ${REAL_WITHDRAWAL} AND t.created_at >= ${daysAgo(USAGE_WINDOW_DAYS)}
      GROUP BY i.material_id
    ) u ON u.material_id = m.id
    WHERE m.status = 'ACTIVE'`;

  return rows
    .map(({ used, ...m }) => {
      const avgDailyUsage = used / USAGE_WINDOW_DAYS;
      const daysLeft = avgDailyUsage > 0 ? Math.floor(m.currentQuantity / avgDailyUsage) : null;
      return {
        ...m,
        avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
        daysLeft,
        suggestedQty: Math.max(0, Math.ceil(m.minStock + avgDailyUsage * COVERAGE_DAYS) - m.currentQuantity),
      };
    })
    .filter((s) => s.currentQuantity <= s.minStock || (s.daysLeft !== null && s.daysLeft <= ALERT_DAYS))
    .sort(
      (a, b) =>
        Number(b.currentQuantity === 0) - Number(a.currentQuantity === 0) ||
        (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) ||
        a.currentQuantity / Math.max(a.minStock, 1) - b.currentQuantity / Math.max(b.minStock, 1),
    );
}

export function topWithdrawn(q: z.infer<typeof topWithdrawnSchema>) {
  const to = q.to ? new Date(bangkokDayStart(q.to).getTime() + DAY_MS) : new Date();
  const from = q.from ? bangkokDayStart(q.from) : new Date(to.getTime() - 30 * DAY_MS);
  const orderBy = q.sortBy === 'count' ? Prisma.sql`"withdrawalCount"` : Prisma.sql`"totalQuantity"`;
  return prisma.$queryRaw<
    { id: string; code: string; name: string; brand: string | null; model: string | null; unit: string; totalQuantity: number; withdrawalCount: number }[]
  >`
    SELECT m.id, m.code, m.name, m.brand, m.model, m.unit,
           SUM(i.quantity)::int AS "totalQuantity",
           COUNT(DISTINCT t.id)::int AS "withdrawalCount"
    FROM stock_transaction_items i
    JOIN stock_transactions t ON t.id = i.transaction_id
    JOIN materials m ON m.id = i.material_id
    WHERE ${REAL_WITHDRAWAL}
      AND t.created_at >= ${from} AND t.created_at < ${to}
      AND m.status = 'ACTIVE'
    GROUP BY m.id
    ORDER BY ${orderBy} DESC, m.code
    LIMIT ${q.limit}`;
}

/**
 * `days` omitted = never withdrawn at all; otherwise also those idle for more than `days`.
 * Most valuable first, so money tied up in idle stock stands out.
 */
export function unused(days: number | undefined) {
  const cutoff = days ? daysAgo(days) : null;
  return prisma.$queryRaw<
    { id: string; code: string; name: string; brand: string | null; model: string | null; unit: string; currentQuantity: number; createdAt: Date; lastOutAt: Date | null; unitPrice: number | null; value: number }[]
  >`
    SELECT m.id, m.code, m.name, m.brand, m.model, m.unit, m.current_quantity AS "currentQuantity",
           m.created_at AS "createdAt", lo.last_out_at AS "lastOutAt",
           p.price AS "unitPrice", COALESCE(m.current_quantity * p.price, 0)::float8 AS value
    FROM materials m
    LEFT JOIN LATERAL (${LATEST_PRICE}) p ON true
    LEFT JOIN LATERAL (
      SELECT MAX(t.created_at) AS last_out_at
      FROM stock_transaction_items i
      JOIN stock_transactions t ON t.id = i.transaction_id
      WHERE i.material_id = m.id AND ${REAL_WITHDRAWAL}
    ) lo ON true
    WHERE m.status = 'ACTIVE'
      AND (lo.last_out_at IS NULL OR (${cutoff}::timestamptz IS NOT NULL AND lo.last_out_at < ${cutoff}::timestamptz))
    ORDER BY value DESC, lo.last_out_at ASC NULLS FIRST, m.current_quantity DESC`;
}

/**
 * Purchases per fiscal year + project (TOR), and how much of each is still in stock (stock age).
 * Counted per unit, each at the price on its own receipt line.
 * ponytail: SERIAL units only (every material is SERIAL since D15); QUANTITY stock has no per-receipt trail.
 */
export function procurement() {
  return prisma.$queryRaw<
    { fiscalYear: number; projectName: string | null; receivedQty: number; receivedValue: number; unpricedQty: number; remainingQty: number; remainingValue: number }[]
  >`
    SELECT
      -- A receipt saved without a year falls in the Thai fiscal year of its date (starts 1 Oct).
      COALESCE(t.fiscal_year,
        EXTRACT(YEAR FROM (t.created_at AT TIME ZONE 'Asia/Bangkok') + interval '3 months')::int + 543) AS "fiscalYear",
      t.project_name AS "projectName",
      COUNT(*)::int AS "receivedQty",
      COALESCE(SUM(i.unit_price), 0)::float8 AS "receivedValue",
      COUNT(*) FILTER (WHERE i.unit_price IS NULL)::int AS "unpricedQty",
      COUNT(*) FILTER (WHERE u.status = 'IN_STOCK')::int AS "remainingQty",
      COALESCE(SUM(i.unit_price) FILTER (WHERE u.status = 'IN_STOCK'), 0)::float8 AS "remainingValue"
    FROM stock_transactions t
    JOIN transaction_units tu ON tu.transaction_id = t.id
    JOIN material_units u ON u.id = tu.unit_id
    JOIN materials m ON m.id = u.material_id
    JOIN stock_transaction_items i ON i.transaction_id = t.id AND i.material_id = u.material_id
    WHERE t.type = 'IN' AND t.reversal_of_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM stock_transactions r WHERE r.reversal_of_id = t.id)
      AND m.status = 'ACTIVE'
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 NULLS FIRST`;
}

/** Pieces withdrawn in each of the last 12 Bangkok months (oldest first), next to the same month a year earlier. */
export async function monthlyWithdrawals() {
  const [y, m] = bangkokDate().slice(0, 7).split('-').map(Number) as [number, number];
  const monthKey = (back: number) => new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 7);
  const rows = await prisma.$queryRaw<{ month: string; quantity: number }[]>`
    SELECT to_char(t.created_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM') AS month, SUM(i.quantity)::int AS quantity
    FROM stock_transaction_items i
    JOIN stock_transactions t ON t.id = i.transaction_id
    JOIN materials m ON m.id = i.material_id
    WHERE ${REAL_WITHDRAWAL} AND m.status = 'ACTIVE'
      AND t.created_at >= ${bangkokDayStart(`${monthKey(23)}-01`)}
    GROUP BY 1`;
  const qty = new Map(rows.map((r) => [r.month, r.quantity]));
  return Array.from({ length: 12 }, (_, i) => {
    const back = 11 - i;
    return {
      month: monthKey(back),
      quantity: qty.get(monthKey(back)) ?? 0,
      previousYearQuantity: qty.get(monthKey(back + 12)) ?? 0,
    };
  });
}
