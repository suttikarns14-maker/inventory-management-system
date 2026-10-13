import type { z } from 'zod';
import type { departmentSchema, lookupSchema } from '../dtos/index.js';
import { prisma } from '../lib/prisma.js';
import { duplicate, notFound } from '../utils/app-error.js';
import { FLOORS } from '../utils/constants.js';

// Reference lists for dropdowns (spec v2.2 §2.1). Rows are deactivated, never deleted,
// because transaction history keeps pointing at them.

export type LookupKind = 'departments' | 'buildings' | 'storageLocations';

const byName = { orderBy: { name: 'asc' as const } };

export async function getLookups() {
  const [departments, buildings, storageLocations] = await Promise.all([
    prisma.department.findMany(byName),
    prisma.building.findMany(byName),
    prisma.storageLocation.findMany(byName),
  ]);
  return { departments, buildings, storageLocations, floors: FLOORS };
}

type LookupInput = z.infer<typeof lookupSchema>;
type DepartmentInput = z.infer<typeof departmentSchema>;

async function assertNameFree(kind: LookupKind, name: string, exceptId?: string): Promise<void> {
  const where = { name: { equals: name, mode: 'insensitive' as const }, NOT: exceptId ? { id: exceptId } : undefined };
  const taken =
    kind === 'departments'
      ? await prisma.department.findFirst({ where })
      : kind === 'buildings'
        ? await prisma.building.findFirst({ where })
        : await prisma.storageLocation.findFirst({ where });
  if (taken) throw duplicate('name', 'ชื่อนี้มีอยู่แล้ว');
}

export async function createDepartment(input: DepartmentInput) {
  await assertNameFree('departments', input.name);
  return prisma.department.create({ data: input });
}

export async function updateDepartment(id: string, input: DepartmentInput) {
  if (!(await prisma.department.findUnique({ where: { id } }))) throw notFound('ไม่พบหน่วยงาน');
  await assertNameFree('departments', input.name, id);
  return prisma.department.update({ where: { id }, data: input });
}

export async function createBuilding(input: LookupInput) {
  await assertNameFree('buildings', input.name);
  return prisma.building.create({ data: input });
}

export async function updateBuilding(id: string, input: LookupInput) {
  if (!(await prisma.building.findUnique({ where: { id } }))) throw notFound('ไม่พบอาคาร');
  await assertNameFree('buildings', input.name, id);
  return prisma.building.update({ where: { id }, data: input });
}

export async function createStorageLocation(input: LookupInput) {
  await assertNameFree('storageLocations', input.name);
  return prisma.storageLocation.create({ data: input });
}

export async function updateStorageLocation(id: string, input: LookupInput) {
  if (!(await prisma.storageLocation.findUnique({ where: { id } }))) throw notFound('ไม่พบสถานที่เก็บ');
  await assertNameFree('storageLocations', input.name, id);
  return prisma.storageLocation.update({ where: { id }, data: input });
}
