import type { z } from 'zod';
import type { CreateTransactionInput, historySchema } from '../dtos/index.js';
import { Prisma, type TransactionType } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import type { SessionUser } from '../middlewares/auth.middleware.js';
import { AppError, notFound } from '../utils/app-error.js';
import { bangkokDate, bangkokDayStart, DAY_MS } from '../utils/date.js';
import { skipTake } from '../utils/http.js';

/** Response shape: frontend/src/app/shared/models/transaction.ts */
const transactionSelect = {
  id: true,
  type: true,
  referenceNo: true,
  note: true,
  createdAt: true,
  createdBy: { select: { id: true, fullName: true } },
  reversalOf: { select: { id: true, referenceNo: true } },
  reversedBy: { select: { id: true, referenceNo: true } },
  items: {
    select: {
      id: true,
      materialId: true,
      quantity: true,
      unitPrice: true,
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
  },
} satisfies Prisma.StockTransactionSelect;

/** TXN-YYYYMMDD-NNN from a per-day counter (spec §5.2). The row lock serialises same-day numbering. */
async function nextReferenceNo(tx: Tx): Promise<string> {
  const date = bangkokDate().replaceAll('-', '');
  const [row] = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO reference_counters (date, last_value) VALUES (${date}, 1)
    ON CONFLICT (date) DO UPDATE SET last_value = reference_counters.last_value + 1
    RETURNING last_value`;
  return `TXN-${date}-${String(row!.last_value).padStart(3, '0')}`;
}

interface Line {
  materialId: string;
  quantity: number;
  unitPrice?: number | undefined;
}

/**
 * Spec §5.1. Everything happens in one DB transaction: any error rolls back stock, header,
 * items and the reference counter together.
 */
async function applyTransaction(
  user: SessionUser,
  type: TransactionType,
  note: string | null,
  lines: Line[],
  reversalOfId: string | null = null,
) {
  // Same lock order for every request, so two multi-line transactions cannot deadlock.
  const items = [...lines].sort((a, b) => a.materialId.localeCompare(b.materialId));

  return prisma.$transaction(async (tx) => {
    const materials = await tx.material.findMany({
      where: { id: { in: items.map((i) => i.materialId) } },
      select: { id: true, name: true, unit: true, status: true },
    });
    const byId = new Map(materials.map((m) => [m.id, m]));
    for (const item of items) {
      const m = byId.get(item.materialId);
      if (!m) throw notFound('ไม่พบวัสดุบางรายการ');
      // A reversal must always be possible, even if the material was switched off since.
      if (m.status !== 'ACTIVE' && !reversalOfId) {
        throw new AppError(400, 'MATERIAL_INACTIVE', `วัสดุ "${m.name}" ถูกปิดใช้งาน`);
      }
    }

    for (const item of items) {
      if (type === 'IN') {
        await tx.material.update({
          where: { id: item.materialId },
          data: { currentQuantity: { increment: item.quantity } },
        });
        continue;
      }
      // Check and deduct in one statement: safe under concurrent withdrawals (never read-then-write).
      const { count } = await tx.material.updateMany({
        where: { id: item.materialId, currentQuantity: { gte: item.quantity } },
        data: { currentQuantity: { decrement: item.quantity } },
      });
      if (count === 0) {
        const m = byId.get(item.materialId)!;
        const { currentQuantity } = await tx.material.findUniqueOrThrow({
          where: { id: m.id },
          select: { currentQuantity: true },
        });
        throw new AppError(
          400,
          'INSUFFICIENT_STOCK',
          `วัสดุ "${m.name}" คงเหลือ ${currentQuantity} ${m.unit} ไม่พอเบิก ${item.quantity} ${m.unit}`,
        );
      }
    }

    return tx.stockTransaction.create({
      data: {
        type,
        referenceNo: await nextReferenceNo(tx),
        createdById: user.id,
        note,
        reversalOfId,
        items: {
          create: items.map((i) => ({
            materialId: i.materialId,
            quantity: i.quantity,
            unitPrice: type === 'IN' ? i.unitPrice : undefined,
          })),
        },
      },
      select: transactionSelect,
    });
  });
}

export async function createTransaction(user: SessionUser, input: CreateTransactionInput) {
  if (input.type === 'IN' && user.role === 'USER') {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์บันทึกรับเข้า');
  }
  return applyTransaction(user, input.type, input.note, input.items);
}

/** Spec §5.3: never edit history; post the opposite movement instead. ADMIN only (route guard). */
export async function reverseTransaction(admin: SessionUser, id: string, note: string) {
  const original = await prisma.stockTransaction.findUnique({
    where: { id },
    include: { items: true, reversedBy: { select: { id: true } } },
  });
  if (!original) throw notFound('ไม่พบรายการ');
  const alreadyReversed = () =>
    new AppError(409, 'ALREADY_REVERSED', 'รายการนี้ถูกยกเลิกไปแล้ว หรือเป็นรายการยกเลิก');
  if (original.reversedBy || original.reversalOfId) throw alreadyReversed();
  try {
    return await applyTransaction(
      admin,
      original.type === 'IN' ? 'OUT' : 'IN',
      `ยกเลิก ${original.referenceNo}: ${note}`,
      original.items.map(({ materialId, quantity }) => ({ materialId, quantity })),
      original.id,
    );
  } catch (e) {
    // Two admins reversing at the same moment: the unique reversal_of_id lets only one win.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw alreadyReversed();
    throw e;
  }
}

/** USER may only see their own transactions (spec §1); others get 404, not 403, to avoid leaking ids. */
export async function getTransaction(user: SessionUser, id: string) {
  const txn = await prisma.stockTransaction.findFirst({
    where: { id, ...(user.role === 'USER' && { createdById: user.id }) },
    select: transactionSelect,
  });
  if (!txn) throw notFound('ไม่พบรายการ');
  return txn;
}

export async function history(user: SessionUser, q: z.infer<typeof historySchema>) {
  const where: Prisma.StockTransactionWhereInput = {
    ...((q.from || q.to) && {
      createdAt: {
        ...(q.from && { gte: bangkokDayStart(q.from) }),
        ...(q.to && { lt: new Date(bangkokDayStart(q.to).getTime() + DAY_MS) }),
      },
    }),
    ...(q.type && { type: q.type }),
    ...(q.materialId && { items: { some: { materialId: q.materialId } } }),
    createdById: user.role === 'USER' ? user.id : q.createdById,
  };
  const [items, total] = await Promise.all([
    prisma.stockTransaction.findMany({
      where,
      select: transactionSelect,
      orderBy: [{ createdAt: 'desc' }, { referenceNo: 'desc' }],
      ...skipTake(q),
    }),
    prisma.stockTransaction.count({ where }),
  ]);
  return { items, total };
}
