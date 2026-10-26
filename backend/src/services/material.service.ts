import type { z } from 'zod';
import type { createMaterialSchema, listMaterialsSchema, updateMaterialSchema } from '../dtos/index.js';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError, duplicate, notFound } from '../utils/app-error.js';
import { skipTake } from '../utils/http.js';

/** Response shape: frontend/src/app/shared/models/material.ts */
export const materialInclude = {
  category: { select: { id: true, name: true } },
  storageLocation: { select: { id: true, name: true } },
} satisfies Prisma.MaterialInclude;

/**
 * Identity of a material for matching (spec v2.2 §2.2): name + brand + model, ignoring spaces and
 * letter case. "-" counts as no value, as in the Excel data.
 */
export function materialKey(name: string, brand?: string | null, model?: string | null): string {
  const norm = (s?: string | null) => (s && s.trim() !== '-' ? s.replace(/\s+/g, '').toLowerCase() : '');
  return [norm(name), norm(brand), norm(model)].join('|');
}

export async function listMaterials(q: z.infer<typeof listMaterialsSchema>) {
  const where: Prisma.MaterialWhereInput = {
    ...(q.categoryId && { categoryId: q.categoryId }),
    ...(q.storageLocationId && { storageLocationId: q.storageLocationId }),
    ...(q.trackingType && { trackingType: q.trackingType }),
    // Low stock = currentQuantity <= minStock: a column-to-column comparison (field reference).
    ...(q.lowStock && { currentQuantity: { lte: prisma.material.fields.minStock } }),
    ...(q.outOfStock && { currentQuantity: 0 }),
    ...(q.search && {
      OR: [
        { code: { contains: q.search, mode: 'insensitive' } },
        { name: { contains: q.search, mode: 'insensitive' } },
        { brand: { contains: q.search, mode: 'insensitive' } },
        { model: { contains: q.search, mode: 'insensitive' } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.material.findMany({
      where,
      include: materialInclude,
      // Secondary key keeps paging stable when many rows share the sort value.
      orderBy: [{ [q.sortBy]: q.sortOrder }, { code: 'asc' }],
      ...skipTake(q),
    }),
    prisma.material.count({ where }),
  ]);
  return { items, total };
}

export async function getMaterial(id: string) {
  const material = await prisma.material.findUnique({ where: { id }, include: materialInclude });
  if (!material) throw notFound('ไม่พบวัสดุ');
  return material;
}

type CreateInput = z.infer<typeof createMaterialSchema>;
type UpdateInput = z.infer<typeof updateMaterialSchema>;

export async function createMaterial(input: CreateInput) {
  await assertValid(input);
  return prisma.material.create({ data: input, include: materialInclude });
}

/** ADMIN only. The code may change (decision D6); history keeps pointing at the same id. */
export async function updateMaterial(id: string, input: UpdateInput) {
  const current = await getMaterial(id);
  await assertValid(input, id);
  if (input.trackingType !== current.trackingType) {
    const used = await prisma.stockTransactionItem.count({ where: { materialId: id } });
    if (used > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [
        { field: 'trackingType', message: 'เปลี่ยนวิธีติดตามไม่ได้ เพราะวัสดุนี้มีรายการรับ-เบิกแล้ว' },
      ]);
    }
  }
  return prisma.material.update({ where: { id }, data: input, include: materialInclude });
}

async function assertValid(input: CreateInput, exceptId?: string): Promise<void> {
  const fieldError = (field: string, message: string) =>
    new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', [{ field, message }]);
  if (!(await prisma.category.findUnique({ where: { id: input.categoryId } }))) {
    throw fieldError('categoryId', 'ไม่พบหมวดหมู่ที่เลือก');
  }
  if (input.storageLocationId) {
    const loc = await prisma.storageLocation.findUnique({ where: { id: input.storageLocationId } });
    if (!loc?.isActive) throw fieldError('storageLocationId', 'ไม่พบสถานที่เก็บที่เลือก');
  }
  const notSelf = exceptId ? { id: exceptId } : undefined;
  if (await prisma.material.findFirst({ where: { code: { equals: input.code, mode: 'insensitive' }, NOT: notSelf } })) {
    throw duplicate('code', 'รหัสวัสดุนี้มีอยู่แล้ว');
  }
  // Same name + brand + model is the same material (ignoring spaces/case).
  const key = materialKey(input.name, input.brand, input.model);
  const sameName = await prisma.material.findMany({
    where: { name: { contains: input.name.trim().split(/\s+/)[0] ?? '', mode: 'insensitive' }, NOT: notSelf },
    select: { name: true, brand: true, model: true, code: true },
  });
  const clash = sameName.find((m) => materialKey(m.name, m.brand, m.model) === key);
  if (clash) throw duplicate('name', `มีวัสดุชื่อ ยี่ห้อ และรุ่นนี้แล้ว (${clash.code})`);
}
