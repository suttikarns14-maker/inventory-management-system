import type { z } from 'zod';
import type { categorySchema } from '../dtos/index.js';
import { prisma } from '../lib/prisma.js';
import { duplicate, notFound } from '../utils/app-error.js';

type CategoryInput = z.infer<typeof categorySchema>;

export const listCategories = () => prisma.category.findMany({ orderBy: { name: 'asc' } });

export async function createCategory(input: CategoryInput) {
  await assertNameFree(input.name);
  return prisma.category.create({ data: input });
}

export async function updateCategory(id: string, input: CategoryInput) {
  if (!(await prisma.category.findUnique({ where: { id } }))) throw notFound('ไม่พบหมวดหมู่');
  await assertNameFree(input.name, id);
  return prisma.category.update({ where: { id }, data: input });
}

async function assertNameFree(name: string, exceptId?: string): Promise<void> {
  const taken = await prisma.category.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, NOT: exceptId ? { id: exceptId } : undefined },
  });
  if (taken) throw duplicate('name', 'ชื่อหมวดหมู่นี้มีอยู่แล้ว');
}
