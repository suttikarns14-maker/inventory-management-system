import type { z } from 'zod';
import type { listUnitsSchema } from '../dtos/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, notFound } from '../utils/app-error.js';
import { skipTake } from '../utils/http.js';

// Serial-number lookups (spec v2.2 §3). Response shape: frontend/src/app/shared/models/unit.ts

const unitSelect = {
  id: true,
  serialNumber: true,
  isTempSerial: true,
  status: true,
  createdAt: true,
  material: { select: { id: true, code: true, name: true, brand: true, model: true } },
  storageLocation: { select: { id: true, name: true } },
  // Latest movement tells where an issued unit went.
  movements: {
    take: 1,
    orderBy: { transaction: { createdAt: 'desc' } },
    select: {
      remark: true,
      transaction: {
        select: {
          id: true,
          type: true,
          referenceNo: true,
          createdAt: true,
          requesterName: true,
          usingDepartment: { select: { id: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.MaterialUnitSelect;

type UnitRow = Prisma.MaterialUnitGetPayload<{ select: typeof unitSelect }>;

const toDto = ({ movements, ...u }: UnitRow) => ({
  ...u,
  lastMovement: movements[0] ? { ...movements[0].transaction, remark: movements[0].remark } : null,
});

export async function listUnits(q: z.infer<typeof listUnitsSchema>, materialId?: string) {
  const where: Prisma.MaterialUnitWhereInput = {
    ...(materialId && { materialId }),
    ...(q.status && { status: q.status }),
    ...(q.tempOnly && { isTempSerial: true }),
    ...(q.search && { serialNumber: { contains: q.search, mode: 'insensitive' } }),
  };
  const [items, total] = await Promise.all([
    prisma.materialUnit.findMany({ where, select: unitSelect, orderBy: { serialNumber: 'asc' }, ...skipTake(q) }),
    prisma.materialUnit.count({ where }),
  ]);
  return { items: items.map(toDto), total };
}

/** ADMIN fixes a serial number (typically replacing a -TEMP-SN- placeholder). */
export async function updateSerial(id: string, serialNumber: string) {
  if (!(await prisma.materialUnit.findUnique({ where: { id } }))) throw notFound('ไม่พบ S/N');
  const taken = await prisma.materialUnit.findFirst({
    where: { serialNumber: { equals: serialNumber, mode: 'insensitive' }, NOT: { id } },
  });
  if (taken) {
    throw new AppError(409, 'DUPLICATE_SERIAL', 'S/N นี้มีอยู่แล้ว', [{ field: 'serialNumber', message: 'S/N นี้มีอยู่แล้ว' }]);
  }
  return toDto(
    await prisma.materialUnit.update({ where: { id }, data: { serialNumber, isTempSerial: false }, select: unitSelect }),
  );
}
