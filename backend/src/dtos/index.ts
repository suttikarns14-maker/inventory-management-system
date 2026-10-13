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
  sortBy: z.enum(['code', 'name', 'currentQuantity', 'updatedAt']).default('code'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

/** No currentQuantity: stock only changes through transactions (business rule). */
const materialFields = {
  code: text('รหัสวัสดุ', 50),
  name: text('ชื่อวัสดุ', 200),
  categoryId: z.string({ error: 'กรุณาเลือกหมวดหมู่' }).min(1, 'กรุณาเลือกหมวดหมู่'),
  unit: text('หน่วยนับ', 30),
  minStock: z
    .number({ error: 'จุดสั่งซื้อต้องเป็นตัวเลข' })
    .int('จุดสั่งซื้อต้องเป็นจำนวนเต็ม')
    .min(0, 'จุดสั่งซื้อต้องไม่ติดลบ'),
  location: optionalText('ตำแหน่งจัดเก็บ', 50),
};
export const createMaterialSchema = z.object(materialFields);
export const updateMaterialSchema = z.object({
  ...materialFields,
  status: z.enum(['ACTIVE', 'INACTIVE'], { error: 'สถานะไม่ถูกต้อง' }),
});

// ---- inventory ----

export const createTransactionSchema = z.object({
  type: z.enum(['IN', 'OUT'], { error: 'ประเภทรายการไม่ถูกต้อง' }),
  note: optionalText('หมายเหตุ', 500),
  items: z
    .array(
      z.object({
        materialId: z.string({ error: 'กรุณาเลือกวัสดุ' }).min(1, 'กรุณาเลือกวัสดุ'),
        quantity: z
          .number({ error: 'จำนวนต้องเป็นตัวเลข' })
          .int('จำนวนต้องเป็นจำนวนเต็ม')
          .positive('จำนวนต้องมากกว่า 0'),
        unitPrice: z.number().nonnegative('ราคาต่อหน่วยต้องไม่ติดลบ').max(99_999_999.99).optional(),
      }),
    )
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
