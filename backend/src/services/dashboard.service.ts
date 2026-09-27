import type { z } from 'zod';
import type { topWithdrawnSchema } from '../dtos/index.js';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
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
  return { ...counts!, reorderCount: (await reorderSuggestions()).length };
}

export async function reorderSuggestions() {
  const rows = await prisma.$queryRaw<
    { id: string; code: string; name: string; unit: string; currentQuantity: number; minStock: number; used: number }[]
  >`
    SELECT m.id, m.code, m.name, m.unit,
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
    { id: string; code: string; name: string; unit: string; totalQuantity: number; withdrawalCount: number }[]
  >`
    SELECT m.id, m.code, m.name, m.unit,
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

/** `days` omitted = never withdrawn at all; otherwise also those idle for more than `days`. */
export function unused(days: number | undefined) {
  const cutoff = days ? daysAgo(days) : null;
  return prisma.$queryRaw<
    { id: string; code: string; name: string; unit: string; currentQuantity: number; createdAt: Date; lastOutAt: Date | null }[]
  >`
    SELECT m.id, m.code, m.name, m.unit, m.current_quantity AS "currentQuantity",
           m.created_at AS "createdAt", lo.last_out_at AS "lastOutAt"
    FROM materials m
    LEFT JOIN LATERAL (
      SELECT MAX(t.created_at) AS last_out_at
      FROM stock_transaction_items i
      JOIN stock_transactions t ON t.id = i.transaction_id
      WHERE i.material_id = m.id AND ${REAL_WITHDRAWAL}
    ) lo ON true
    WHERE m.status = 'ACTIVE'
      AND (lo.last_out_at IS NULL OR (${cutoff}::timestamptz IS NOT NULL AND lo.last_out_at < ${cutoff}::timestamptz))
    ORDER BY lo.last_out_at ASC NULLS FIRST, m.current_quantity DESC`;
}
