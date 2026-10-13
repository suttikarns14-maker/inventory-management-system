import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { CreateTransactionInput, historySchema, TransactionItemInput } from '../dtos/index.js';
import { Prisma, type TrackingType, type TransactionType } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import type { SessionUser } from '../middlewares/auth.middleware.js';
import { AppError, type FieldError, notFound } from '../utils/app-error.js';
import { FLOORS } from '../utils/constants.js';
import { bangkokDate, bangkokDayStart, DAY_MS } from '../utils/date.js';
import { skipTake } from '../utils/http.js';

// ---- response shape: frontend/src/app/shared/models/transaction.ts ----

const ref = { select: { id: true, name: true } } as const;
export const transactionSelect = {
  id: true,
  type: true,
  referenceNo: true,
  note: true,
  createdAt: true,
  fiscalYear: true,
  projectName: true,
  requesterName: true,
  floor: true,
  purpose: true,
  createdBy: { select: { id: true, fullName: true } },
  requester: { select: { id: true, fullName: true } },
  requestingDepartment: ref,
  usingDepartment: ref,
  building: ref,
  reversalOf: { select: { id: true, referenceNo: true } },
  reversedBy: { select: { id: true, referenceNo: true } },
  items: {
    select: {
      id: true,
      materialId: true,
      quantity: true,
      unitPrice: true,
      material: { select: { id: true, code: true, name: true, unit: true, trackingType: true } },
    },
  },
  units: {
    select: {
      remark: true,
      unit: { select: { id: true, materialId: true, serialNumber: true, isTempSerial: true } },
    },
  },
} satisfies Prisma.StockTransactionSelect;

type TransactionRow = Prisma.StockTransactionGetPayload<{ select: typeof transactionSelect }>;

/** Moves the serial numbers under the item of their material. */
export function toTransactionDto({ units, ...t }: TransactionRow) {
  return {
    ...t,
    items: t.items.map((item) => ({
      ...item,
      units: units
        .filter((u) => u.unit.materialId === item.materialId)
        .map((u) => ({ id: u.unit.id, serialNumber: u.unit.serialNumber, isTempSerial: u.unit.isTempSerial, remark: u.remark }))
        .sort((a, b) => a.serialNumber.localeCompare(b.serialNumber)),
    })),
  };
}

// ---- reference numbers ----

/** TXN-YYYYMMDD-NNN from a per-day counter (spec §5.2). The row lock serialises same-day numbering. */
export async function nextReferenceNo(tx: Tx, date = bangkokDate()): Promise<string> {
  const day = date.replaceAll('-', '');
  const [row] = await tx.$queryRaw<{ last_value: number }[]>`
    INSERT INTO reference_counters (date, last_value) VALUES (${day}, 1)
    ON CONFLICT (date) DO UPDATE SET last_value = reference_counters.last_value + 1
    RETURNING last_value`;
  return `TXN-${day}-${String(row!.last_value).padStart(3, '0')}`;
}

// ---- core movement ----

export interface Line {
  materialId: string;
  quantity: number;
  unitPrice?: number | undefined;
  /** SERIAL + IN: new serial numbers */
  serialNumbers?: string[];
  /** Subset of serialNumbers that are import placeholders (-TEMP-SN-) */
  tempSerials?: Set<string>;
  /** SERIAL + OUT, or any reversal: existing units */
  units?: { unitId: string; remark: string | null }[];
}

export type Header = Omit<
  Prisma.StockTransactionUncheckedCreateInput,
  'id' | 'type' | 'referenceNo' | 'createdById' | 'items' | 'units' | 'reversalOfId'
>;

const fieldError = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [{ field, message }]);

/**
 * Spec §5.1 + v2.2 §2.3. One DB transaction: stock, units, header, items, links and the
 * reference counter commit or roll back together.
 */
export async function applyTransaction(
  user: SessionUser,
  type: TransactionType,
  header: Header,
  lines: Line[],
  reversalOfId: string | null = null,
  /** Run inside a caller's DB transaction (imports); otherwise opens its own. */
  outer?: Tx,
) {
  // Same lock order for every request, so two multi-line transactions cannot deadlock.
  const items = [...lines].sort((a, b) => a.materialId.localeCompare(b.materialId));

  const run = async (tx: Tx) => {
    const materials = await tx.material.findMany({
      where: { id: { in: items.map((i) => i.materialId) } },
      select: { id: true, name: true, unit: true, status: true, trackingType: true, storageLocationId: true },
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

    const newUnits: {
      id: string;
      materialId: string;
      serialNumber: string;
      isTempSerial: boolean;
      storageLocationId: string | null;
    }[] = [];
    const links: { unitId: string; remark: string | null }[] = [];

    for (const item of items) {
      const m = byId.get(item.materialId)!;

      // Serial units change state first; the quantity update below then keeps the totals in sync.
      if (item.serialNumbers) {
        for (const serialNumber of item.serialNumbers) {
          const id = randomUUID();
          newUnits.push({
            id,
            materialId: m.id,
            serialNumber,
            isTempSerial: item.tempSerials?.has(serialNumber) ?? false,
            storageLocationId: m.storageLocationId,
          });
          links.push({ unitId: id, remark: null });
        }
      } else if (item.units) {
        const ids = item.units.map((u) => u.unitId);
        // IN (reversing a withdrawal): ISSUED -> IN_STOCK. OUT: IN_STOCK -> ISSUED, or for a
        // reversed receipt IN_STOCK -> VOID. Conditional, so two people cannot take the same unit.
        const from = type === 'IN' ? 'ISSUED' : 'IN_STOCK';
        const to = type === 'IN' ? 'IN_STOCK' : reversalOfId ? 'VOID' : 'ISSUED';
        const { count } = await tx.materialUnit.updateMany({
          where: { id: { in: ids }, materialId: m.id, status: from },
          data: { status: to },
        });
        if (count !== ids.length) {
          throw new AppError(
            400,
            reversalOfId ? 'INSUFFICIENT_STOCK' : 'UNIT_NOT_AVAILABLE',
            reversalOfId
              ? `วัสดุ "${m.name}" บางชิ้นของรายการนี้ถูกเบิกไปแล้ว จึงยกเลิกไม่ได้`
              : `วัสดุ "${m.name}" มีบาง S/N ที่ถูกเบิกไปแล้วหรือไม่อยู่ในคลัง กรุณาเลือกใหม่`,
          );
        }
        links.push(...item.units);
      }

      if (type === 'IN') {
        await tx.material.update({
          where: { id: m.id },
          data: { currentQuantity: { increment: item.quantity } },
        });
        continue;
      }
      // Check and deduct in one statement: safe under concurrent withdrawals (never read-then-write).
      const { count } = await tx.material.updateMany({
        where: { id: m.id, currentQuantity: { gte: item.quantity } },
        data: { currentQuantity: { decrement: item.quantity } },
      });
      if (count === 0) {
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

    if (newUnits.length) {
      await assertSerialsFree(tx, newUnits.map((u) => u.serialNumber));
      await tx.materialUnit.createMany({ data: newUnits });
    }

    const txn = await tx.stockTransaction.create({
      data: {
        ...header,
        type,
        referenceNo: await nextReferenceNo(tx),
        createdById: user.id,
        reversalOfId,
        items: {
          create: items.map((i) => ({
            materialId: i.materialId,
            quantity: i.quantity,
            unitPrice: type === 'IN' ? i.unitPrice : undefined,
          })),
        },
      },
      select: { id: true },
    });
    if (links.length) {
      await tx.transactionUnit.createMany({ data: links.map((l) => ({ ...l, transactionId: txn.id })) });
    }
    return toTransactionDto(await tx.stockTransaction.findUniqueOrThrow({ where: { id: txn.id }, select: transactionSelect }));
  };
  return outer ? run(outer) : prisma.$transaction(run);
}

/** Rejects serial numbers that already exist (case-insensitive), listing them in the message. */
export async function assertSerialsFree(tx: Tx, serials: string[]): Promise<void> {
  const lower = serials.map((s) => s.toLowerCase());
  const repeated = lower.filter((s, i) => lower.indexOf(s) !== i);
  const existing = await tx.$queryRaw<{ serial_number: string }[]>`
    SELECT serial_number FROM material_units WHERE lower(serial_number) = ANY(${lower}::text[])`;
  const taken = [...new Set([...repeated, ...existing.map((e) => e.serial_number)])];
  if (taken.length) {
    throw new AppError(409, 'DUPLICATE_SERIAL', `S/N ซ้ำกับที่มีอยู่แล้ว: ${taken.slice(0, 10).join(', ')}${taken.length > 10 ? ' ...' : ''}`);
  }
}

// ---- create ----

export async function createTransaction(user: SessionUser, input: CreateTransactionInput) {
  if (input.type === 'IN' && user.role === 'USER') {
    throw new AppError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์บันทึกรับเข้า');
  }
  const trackingTypes = new Map(
    (
      await prisma.material.findMany({
        where: { id: { in: input.items.map((i) => i.materialId) } },
        select: { id: true, trackingType: true },
      })
    ).map((m) => [m.id, m.trackingType]),
  );
  const lines = input.items.map((item, i) => toLine(input.type, item, trackingTypes.get(item.materialId), i));
  const header = input.type === 'IN' ? receiptHeader(user, input) : await withdrawalHeader(user, input);
  return applyTransaction(user, input.type, header, lines);
}

/** Checks the item has the fields its material's tracking type needs (spec v2.2 §3). */
function toLine(type: TransactionType, item: TransactionItemInput, tracking: TrackingType | undefined, i: number): Line {
  const field = (name: string) => `items.${i}.${name}`;
  if (!tracking) throw notFound('ไม่พบวัสดุบางรายการ');
  if (tracking === 'QUANTITY') {
    if (!item.quantity) throw fieldError(field('quantity'), 'กรุณากรอกจำนวน');
    return { materialId: item.materialId, quantity: item.quantity, unitPrice: item.unitPrice };
  }
  if (type === 'IN') {
    if (!item.serialNumbers?.length) throw fieldError(field('serialNumbers'), 'วัสดุนี้ติดตามรายชิ้น กรุณากรอก S/N');
    return {
      materialId: item.materialId,
      quantity: item.serialNumbers.length,
      unitPrice: item.unitPrice,
      serialNumbers: item.serialNumbers,
    };
  }
  if (!item.units?.length) throw fieldError(field('units'), 'วัสดุนี้ติดตามรายชิ้น กรุณาเลือก S/N ที่เบิก');
  if (new Set(item.units.map((u) => u.unitId)).size !== item.units.length) {
    throw fieldError(field('units'), 'เลือก S/N ซ้ำ');
  }
  return {
    materialId: item.materialId,
    quantity: item.units.length,
    units: item.units.map((u) => ({ unitId: u.unitId, remark: u.remark })),
  };
}

function receiptHeader(user: SessionUser, input: CreateTransactionInput): Header {
  return {
    note: input.note,
    fiscalYear: input.fiscalYear ?? null,
    projectName: input.projectName,
    requesterName: user.fullName,
  };
}

/** Spec v2.2 D10/D11/Q2. */
async function withdrawalHeader(user: SessionUser, input: CreateTransactionInput): Promise<Header> {
  const errors: FieldError[] = [];

  // Requester: USER is always themselves; ADMIN/STAFF pick a user or type a name.
  let requesterId: string | null = user.id;
  let requesterName = user.fullName;
  if (user.role !== 'USER') {
    if (input.requesterId) {
      const requester = await prisma.user.findUnique({ where: { id: input.requesterId } });
      if (!requester?.isActive) errors.push({ field: 'requesterId', message: 'ไม่พบผู้เบิกที่เลือก' });
      else ({ id: requesterId, fullName: requesterName } = requester);
    } else if (input.requesterName) {
      requesterId = null;
      requesterName = input.requesterName;
    } else {
      errors.push({ field: 'requesterName', message: 'กรุณาระบุผู้เบิก' });
    }
  }

  const [requesting, using, building] = await Promise.all([
    input.requestingDepartmentId ? prisma.department.findUnique({ where: { id: input.requestingDepartmentId } }) : null,
    input.usingDepartmentId ? prisma.department.findUnique({ where: { id: input.usingDepartmentId } }) : null,
    input.buildingId ? prisma.building.findUnique({ where: { id: input.buildingId } }) : null,
  ]);
  if (!input.requestingDepartmentId) errors.push({ field: 'requestingDepartmentId', message: 'กรุณาเลือกหน่วยงานที่เบิก' });
  else if (!requesting?.isActive || requesting.kind !== 'MAIN') {
    errors.push({ field: 'requestingDepartmentId', message: 'หน่วยงานที่เบิกต้องเป็นหน่วยงานหลัก' });
  }
  if (!input.usingDepartmentId) errors.push({ field: 'usingDepartmentId', message: 'กรุณาเลือกหน่วยงานที่ใช้' });
  else if (!using?.isActive) errors.push({ field: 'usingDepartmentId', message: 'ไม่พบหน่วยงานที่เลือก' });
  if (input.buildingId && !building?.isActive) errors.push({ field: 'buildingId', message: 'ไม่พบอาคารที่เลือก' });
  if (input.floor && !(FLOORS as readonly string[]).includes(input.floor)) {
    errors.push({ field: 'floor', message: 'ชั้นไม่ถูกต้อง' });
  }
  if (errors.length) throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', errors);

  return {
    note: input.note,
    requesterId,
    requesterName,
    requestingDepartmentId: input.requestingDepartmentId,
    usingDepartmentId: input.usingDepartmentId,
    buildingId: input.buildingId,
    floor: input.floor,
    purpose: input.purpose,
  };
}

// ---- reversal ----

/** Spec §5.3: never edit history; post the opposite movement instead. ADMIN only (route guard). */
export async function reverseTransaction(admin: SessionUser, id: string, note: string) {
  const original = await prisma.stockTransaction.findUnique({
    where: { id },
    include: { items: true, units: { include: { unit: { select: { materialId: true } } } }, reversedBy: { select: { id: true } } },
  });
  if (!original) throw notFound('ไม่พบรายการ');
  const alreadyReversed = () =>
    new AppError(409, 'ALREADY_REVERSED', 'รายการนี้ถูกยกเลิกไปแล้ว หรือเป็นรายการยกเลิก');
  if (original.reversedBy || original.reversalOfId) throw alreadyReversed();

  const lines: Line[] = original.items.map(({ materialId, quantity }) => {
    const units = original.units.filter((u) => u.unit.materialId === materialId);
    return {
      materialId,
      quantity,
      ...(units.length && { units: units.map((u) => ({ unitId: u.unitId, remark: u.remark })) }),
    };
  });
  try {
    return await applyTransaction(
      admin,
      original.type === 'IN' ? 'OUT' : 'IN',
      { note: `ยกเลิก ${original.referenceNo}: ${note}`, requesterName: admin.fullName },
      lines,
      original.id,
    );
  } catch (e) {
    // Two admins reversing at the same moment: the unique reversal_of_id lets only one win.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw alreadyReversed();
    throw e;
  }
}

// ---- read ----

/** USER may only see their own transactions (spec §1); others get 404, not 403, to avoid leaking ids. */
export async function getTransaction(user: SessionUser, id: string) {
  const txn = await prisma.stockTransaction.findFirst({
    where: { id, ...(user.role === 'USER' && { OR: [{ createdById: user.id }, { requesterId: user.id }] }) },
    select: transactionSelect,
  });
  if (!txn) throw notFound('ไม่พบรายการ');
  return toTransactionDto(txn);
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
    ...(q.requestingDepartmentId && { requestingDepartmentId: q.requestingDepartmentId }),
    ...(q.usingDepartmentId && { usingDepartmentId: q.usingDepartmentId }),
    ...(q.serial && { units: { some: { unit: { serialNumber: { contains: q.serial, mode: 'insensitive' } } } } }),
    // USER sees what they recorded or what was withdrawn in their name.
    ...(user.role === 'USER'
      ? { OR: [{ createdById: user.id }, { requesterId: user.id }] }
      : q.createdById && { createdById: q.createdById }),
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
  return { items: items.map(toTransactionDto), total };
}
