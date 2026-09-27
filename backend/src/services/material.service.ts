import type { z } from 'zod';
import type { createMaterialSchema, listMaterialsSchema, updateMaterialSchema } from '../dtos/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, duplicate, notFound } from '../utils/app-error.js';
import { skipTake } from '../utils/http.js';

/** Response shape: frontend/src/app/shared/models/material.ts */
const withCategory = { category: { select: { id: true, name: true } } } satisfies Prisma.MaterialInclude;

export async function listMaterials(q: z.infer<typeof listMaterialsSchema>) {
  const where: Prisma.MaterialWhereInput = {
    status: q.status,
    ...(q.categoryId && { categoryId: q.categoryId }),
    // Low stock = currentQuantity <= minStock: a column-to-column comparison (field reference).
    ...(q.lowStock && { currentQuantity: { lte: prisma.material.fields.minStock } }),
    ...(q.search && {
      OR: [
        { code: { contains: q.search, mode: 'insensitive' } },
        { name: { contains: q.search, mode: 'insensitive' } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.material.findMany({
      where,
      include: withCategory,
      // Secondary key keeps paging stable when many rows share the sort value.
      orderBy: [{ [q.sortBy]: q.sortOrder }, { code: 'asc' }],
      ...skipTake(q),
    }),
    prisma.material.count({ where }),
  ]);
  return { items, total };
}

export async function getMaterial(id: string) {
  const material = await prisma.material.findUnique({ where: { id }, include: withCategory });
  if (!material) throw notFound('ไม่พบวัสดุ');
  return material;
}

export async function createMaterial(input: z.infer<typeof createMaterialSchema>) {
  await assertValid(input);
  return prisma.material.create({ data: input, include: withCategory });
}

/** ADMIN only. The code may change (decision D6); history keeps pointing at the same id. */
export async function updateMaterial(id: string, input: z.infer<typeof updateMaterialSchema>) {
  await getMaterial(id);
  await assertValid(input, id);
  return prisma.material.update({ where: { id }, data: input, include: withCategory });
}

async function assertValid(input: { code: string; categoryId: string }, exceptId?: string): Promise<void> {
  if (!(await prisma.category.findUnique({ where: { id: input.categoryId } }))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [
      { field: 'categoryId', message: 'ไม่พบหมวดหมู่ที่เลือก' },
    ]);
  }
  const taken = await prisma.material.findFirst({
    where: { code: { equals: input.code, mode: 'insensitive' }, NOT: exceptId ? { id: exceptId } : undefined },
  });
  if (taken) throw duplicate('code', 'รหัสวัสดุนี้มีอยู่แล้ว');
}
