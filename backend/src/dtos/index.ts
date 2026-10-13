import { z } from 'zod';
import { pageQuery } from '../utils/http.js';

// Input schemas for every endpoint (spec §4.3–4.4). Field names and error paths must match the
// Angular models in frontend/src/app/shared/models/, which map `details[].field` onto form controls.

z.config(z.locales.th());

const text = (label: string, max: number) =>
  z.string({ error: `กรุณากรอก${label}` }).trim().min(1, `กรุณากรอก${label}`).max(max, `${label}ยาวเกิน ${max} ตัวอักษร`);
const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label}ยาวเกิน ${max} ตัวอักษร`)
    .nullish()
    .transform((v) => v || null);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องอยู่ในรูปแบบ YYYY-MM-DD');
const role = z.enum(['ADMIN', 'STAFF', 'USER'], { error: 'สิทธิ์ไม่ถูกต้อง' });

// ---- auth / users ----

/** Same rule as USERNAME_PATTERN in the front-end. */
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;
const password = z.string({ error: 'กรุณากรอกรหัสผ่าน' }).min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร').max(100);

export const loginSchema = z.object({
  username: z.string({ error: 'กรุณากรอกชื่อผู้ใช้' }).trim().min(1, 'กรุณากรอกชื่อผู้ใช้'),
  password: z.string({ error: 'กรุณากรอกรหัสผ่าน' }).min(1, 'กรุณากรอกรหัสผ่าน'),
});

export const listUsersSchema = pageQuery.extend({
  search: z.string().trim().optional(),
  role: role.optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const createUserSchema = z.object({
  username: z
    .string({ error: 'กรุณากรอกชื่อผู้ใช้' })
    .trim()
    .regex(USERNAME_PATTERN, 'ใช้ได้เฉพาะ A-Z, 0-9 และ . _ - ความยาว 3-50 ตัวอักษร'),
  fullName: text('ชื่อ-นามสกุล', 200),
  role,
  password,
});

export const updateUserSchema = z.object({
  fullName: text('ชื่อ-นามสกุล', 200),
  role,
  isActive: z.boolean({ error: 'สถานะไม่ถูกต้อง' }),
});

export const resetPasswordSchema = z.object({ password });

// ---- categories ----

export const categorySchema = z.object({
  name: text('ชื่อหมวดหมู่', 100),
  description: optionalText('คำอธิบาย', 500),
});

// ---- materials ----

export const listMaterialsSchema = pageQuery.extend({
  search: z.string().trim().optional(),
  categoryId: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  lowStock: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  storageLocationId: z.string().optional(),
  trackingType: z.enum(['QUANTITY', 'SERIAL']).optional(),
  sortBy: z.enum(['code', 'name', 'currentQuantity', 'updatedAt']).default('code'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const optionalId = z
  .string()
  .nullish()
  .transform((v) => v || null);

/** No currentQuantity: stock only changes through transactions (business rule). */
const materialFields = {
  code: text('รหัสวัสดุ', 50),
  name: text('ชื่อวัสดุ', 200),
  brand: optionalText('ยี่ห้อ', 100),
  model: optionalText('รุ่น', 100),
  categoryId: z.string({ error: 'กรุณาเลือกหมวดหมู่' }).min(1, 'กรุณาเลือกหมวดหมู่'),
  unit: text('หน่วยนับ', 30),
  minStock: z
    .number({ error: 'จุดสั่งซื้อต้องเป็นตัวเลข' })
    .int('จุดสั่งซื้อต้องเป็นจำนวนเต็ม')
    .min(0, 'จุดสั่งซื้อต้องไม่ติดลบ'),
  trackingType: z.enum(['QUANTITY', 'SERIAL'], { error: 'วิธีติดตามไม่ถูกต้อง' }).default('QUANTITY'),
  storageLocationId: optionalId,
};
export const createMaterialSchema = z.object(materialFields);
export const updateMaterialSchema = z.object({
  ...materialFields,
  status: z.enum(['ACTIVE', 'INACTIVE'], { error: 'สถานะไม่ถูกต้อง' }),
});

// ---- inventory ----

/** Thai fiscal year 2500–2700 (B.E.). */
const fiscalYear = z.number().int().min(2500, 'ปีงบประมาณต้องเป็นปี พ.ศ.').max(2700, 'ปีงบประมาณต้องเป็นปี พ.ศ.');
export const SERIAL_PATTERN = /^\S{1,100}$/;
const serialNumber = z
  .string()
  .trim()
  .regex(SERIAL_PATTERN, 'S/N ต้องไม่มีช่องว่าง และยาวไม่เกิน 100 ตัวอักษร');

/**
 * One line per material. Which fields apply depends on the material's tracking type, checked in
 * the service: QUANTITY uses `quantity`; SERIAL + IN uses `serialNumbers`; SERIAL + OUT uses `units`.
 */
const transactionItem = z.object({
  materialId: z.string({ error: 'กรุณาเลือกวัสดุ' }).min(1, 'กรุณาเลือกวัสดุ'),
  quantity: z.number({ error: 'จำนวนต้องเป็นตัวเลข' }).int('จำนวนต้องเป็นจำนวนเต็ม').positive('จำนวนต้องมากกว่า 0').optional(),
  unitPrice: z.number().nonnegative('ราคาต่อหน่วยต้องไม่ติดลบ').max(99_999_999.99).optional(),
  serialNumbers: z.array(serialNumber).min(1, 'กรุณากรอก S/N อย่างน้อย 1 ตัว').max(1000).optional(),
  units: z
    .array(z.object({ unitId: z.string().min(1), remark: optionalText('หมายเหตุ', 200) }))
    .min(1, 'กรุณาเลือก S/N อย่างน้อย 1 ชิ้น')
    .max(1000)
    .optional(),
});
export type TransactionItemInput = z.infer<typeof transactionItem>;

export const createTransactionSchema = z.object({
  type: z.enum(['IN', 'OUT'], { error: 'ประเภทรายการไม่ถูกต้อง' }),
  note: optionalText('หมายเหตุ', 500),
  // IN
  fiscalYear: fiscalYear.nullish(),
  projectName: optionalText('ชื่อโครงการ', 200),
  // OUT (spec v2.2 §2.4); USER is forced to be the requester in the service
  requesterId: optionalId,
  requesterName: optionalText('ชื่อผู้เบิก', 200),
  requestingDepartmentId: optionalId,
  usingDepartmentId: optionalId,
  buildingId: optionalId,
  floor: optionalText('ชั้น', 10),
  purpose: optionalText('ระบบงานที่ใช้', 200),
  items: z
    .array(transactionItem)
    .min(1, 'ต้องมีรายการวัสดุอย่างน้อย 1 รายการ')
    .max(100, 'รายการวัสดุต้องไม่เกิน 100 รายการ')
    .refine((items) => new Set(items.map((i) => i.materialId)).size === items.length, 'มีวัสดุซ้ำในรายการ'),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const reverseTransactionSchema = z.object({ note: text('เหตุผลการยกเลิก', 400) });

export const historySchema = pageQuery.extend({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  type: z.enum(['IN', 'OUT']).optional(),
  materialId: z.string().optional(),
  createdById: z.string().optional(),
  requestingDepartmentId: z.string().optional(),
  usingDepartmentId: z.string().optional(),
  serial: z.string().trim().optional(),
});

// ---- units (serial numbers) ----

export const listUnitsSchema = pageQuery.extend({
  search: z.string().trim().optional(),
  status: z.enum(['IN_STOCK', 'ISSUED', 'VOID']).optional(),
  tempOnly: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

export const updateUnitSchema = z.object({ serialNumber });

// ---- lookups ----

export const lookupSchema = z.object({
  name: text('ชื่อ', 200),
  isActive: z.boolean().default(true),
});
export const departmentSchema = lookupSchema.extend({
  kind: z.enum(['MAIN', 'SUB'], { error: 'ประเภทหน่วยงานไม่ถูกต้อง' }),
});

// ---- import (spec v2.2 §5) ----

const trackingDecisions = z.record(z.string(), z.enum(['QUANTITY', 'SERIAL']));
const mapping = z.record(z.string(), z.string().nullable());

export const commitInitialImportSchema = z.object({
  importId: z.string().min(1),
  tracking: trackingDecisions.default({}),
  mapping: z
    .object({
      requestingDepartments: mapping.default({}),
      usingDepartments: mapping.default({}),
      buildings: mapping.default({}),
    })
    .default({ requestingDepartments: {}, usingDepartments: {}, buildings: {} }),
});

export const commitReceiptImportSchema = z.object({
  importId: z.string().min(1),
  tracking: trackingDecisions.default({}),
});

// ---- dashboard ----

export const topWithdrawnSchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  sortBy: z.enum(['quantity', 'count']).default('quantity'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const unusedSchema = z.object({
  days: z.coerce.number().int().positive().optional(),
});
