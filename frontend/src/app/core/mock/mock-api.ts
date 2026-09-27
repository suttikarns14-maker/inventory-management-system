import { ErrorCode, FieldError, PageMeta } from '../../shared/models/api';
import { Role, User, USERNAME_PATTERN } from '../../shared/models/user';
import { Category, Material, MaterialStatus } from '../../shared/models/material';
import { StockTransaction, TransactionType } from '../../shared/models/transaction';
import {
  DashboardSummary,
  ReorderSuggestion,
  TopWithdrawn,
  UnusedMaterial,
} from '../../shared/models/dashboard';
import { bangkokDate, bangkokDayStart, DAY_MS } from '../../shared/utils/date';
import { MaterialRow, MockStore, TransactionRow, UserRow } from './mock-db';

// In-browser stand-in for the Part 2 back-end. It follows spec §4 (routes, roles, error codes,
// response envelope) so the Angular app cannot tell the difference. Business logic here only
// needs to be good enough to drive the UI — the real rules live in the back-end.

export interface MockRequest {
  method: string;
  path: string; // e.g. /api/v1/materials/abc
  query: URLSearchParams;
  body: unknown;
}

export interface MockResponse {
  status: number;
  body: unknown;
}

// Dashboard constants (spec §6.2, decision D4).
export const USAGE_WINDOW_DAYS = 90;
export const ALERT_DAYS = 14;
export const COVERAGE_DAYS = 30;

class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: FieldError[],
  ) {
    super(message);
  }
}

type Body = Record<string, unknown>;
interface Ctx {
  req: MockRequest;
  body: Body;
  user: UserRow | null;
}
type Handler = (ctx: Ctx, params: string[]) => MockResponse;

const ok = (data: unknown, status = 200): MockResponse => ({ status, body: { success: true, data } });

function paged<T>(items: T[], query: URLSearchParams, map: (x: T) => unknown = (x) => x): MockResponse {
  const limit = Math.min(Math.max(Number(query.get('limit')) || 20, 1), 100);
  const total = items.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const page = Math.min(Math.max(Number(query.get('page')) || 1, 1), totalPages);
  const meta: PageMeta = { page, limit, total, totalPages };
  return {
    status: 200,
    body: { success: true, data: items.slice((page - 1) * limit, page * limit).map(map), meta },
  };
}

// ---- input validation (the real BE uses Zod DTOs) ----

class Validator {
  readonly errors: FieldError[] = [];
  constructor(private body: Body) {}

  str(field: string, label: string, { required = true, max = 200 } = {}): string | null {
    const v = this.body[field];
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) {
      if (required) this.errors.push({ field, message: `กรุณากรอก${label}` });
      return null;
    }
    if (s.length > max) this.errors.push({ field, message: `${label}ยาวเกิน ${max} ตัวอักษร` });
    return s;
  }

  int(field: string, label: string, min: number): number {
    const v = this.body[field];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min) {
      this.errors.push({ field, message: `${label}ต้องเป็นจำนวนเต็มตั้งแต่ ${min} ขึ้นไป` });
      return min;
    }
    return v;
  }

  oneOf<T extends string>(field: string, label: string, options: readonly T[]): T {
    const v = this.body[field];
    if (!options.includes(v as T)) this.errors.push({ field, message: `${label}ไม่ถูกต้อง` });
    return v as T;
  }

  check(): void {
    if (this.errors.length) throw new MockError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', this.errors);
  }
}

export class MockApi {
  private routes: [string, RegExp, Handler][] = [];

  constructor(private store: MockStore) {
    const r = (method: string, pattern: string, handler: Handler) =>
      this.routes.push([method, new RegExp(`^/api/v1${pattern.replace(/:\w+/g, '([^/]+)')}$`), handler]);

    r('POST', '/auth/login', (c) => this.login(c));
    r('POST', '/auth/logout', () => this.logout());
    r('GET', '/auth/me', (c) => ok(this.toUser(this.auth(c))));

    r('GET', '/users', (c) => this.listUsers(c));
    r('POST', '/users', (c) => this.createUser(c));
    r('PUT', '/users/:id', (c, [id]) => this.updateUser(c, id));
    r('PUT', '/users/:id/password', (c, [id]) => this.resetPassword(c, id));

    r('GET', '/categories', (c) => this.listCategories(c));
    r('POST', '/categories', (c) => this.saveCategory(c));
    r('PUT', '/categories/:id', (c, [id]) => this.saveCategory(c, id));

    r('GET', '/materials', (c) => this.listMaterials(c));
    r('GET', '/materials/:id', (c, [id]) => (this.auth(c), ok(this.toMaterial(this.material(id)))));
    r('POST', '/materials', (c) => this.saveMaterial(c));
    r('PUT', '/materials/:id', (c, [id]) => this.saveMaterial(c, id));

    r('POST', '/inventory/transactions', (c) => this.createTransaction(c));
    r('GET', '/inventory/transactions/:id', (c, [id]) => this.getTransaction(c, id));
    r('POST', '/inventory/transactions/:id/reverse', (c, [id]) => this.reverse(c, id));
    r('GET', '/inventory/history', (c) => this.history(c));

    r('GET', '/dashboard/summary', (c) => this.summary(c));
    r('GET', '/dashboard/reorder-suggestions', (c) => (this.auth(c, 'ADMIN', 'STAFF'), ok(this.reorder())));
    r('GET', '/dashboard/top-withdrawn', (c) => this.topWithdrawn(c));
    r('GET', '/dashboard/unused', (c) => this.unused(c));
  }

  private get db() {
    return this.store.data;
  }

  handle(req: MockRequest): MockResponse {
    const route = this.routes
      .map(([method, re, handler]) => ({ method, match: re.exec(req.path), handler }))
      .find((x) => x.method === req.method && x.match);
    try {
      if (!route) throw new MockError(404, 'NOT_FOUND', 'ไม่พบ API ที่เรียก');
      const body = req.body && typeof req.body === 'object' ? (req.body as Body) : {};
      const user = this.db.users.find((u) => u.id === this.store.session) ?? null;
      const res = route.handler({ req, body, user }, route.match!.slice(1).map(decodeURIComponent));
      if (req.method !== 'GET') this.store.save();
      return res;
    } catch (e) {
      if (e instanceof MockError) {
        return {
          status: e.status,
          body: { success: false, error: { code: e.code, message: e.message, details: e.details } },
        };
      }
      console.error('[mock-api]', e);
      return {
        status: 500,
        body: { success: false, error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาดในระบบ' } },
      };
    }
  }

  // ---- auth ----

  private auth(c: Ctx, ...roles: Role[]): UserRow {
    if (!c.user || !c.user.isActive) {
      throw new MockError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ');
    }
    if (roles.length && !roles.includes(c.user.role)) {
      throw new MockError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์ทำรายการนี้');
    }
    return c.user;
  }

  private login(c: Ctx): MockResponse {
    const v = new Validator(c.body);
    const username = v.str('username', 'ชื่อผู้ใช้');
    const password = v.str('password', 'รหัสผ่าน');
    v.check();
    const user = this.findByUsername(username!);
    if (!user || user.password !== password) {
      throw new MockError(401, 'INVALID_CREDENTIALS', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    if (!user.isActive) throw new MockError(403, 'USER_INACTIVE', 'บัญชีนี้ถูกปิดการใช้งาน');
    this.store.session = user.id;
    return ok(this.toUser(user));
  }

  private logout(): MockResponse {
    this.store.session = null;
    return ok(null);
  }

  // ---- users ----

  /** Usernames are unique case-insensitively ("Admin" and "admin" are the same account). */
  private findByUsername(username: string): UserRow | undefined {
    return this.db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  private toUser({ password: _, ...user }: UserRow): User {
    return user;
  }

  private listUsers(c: Ctx): MockResponse {
    this.auth(c, 'ADMIN');
    const q = c.req.query;
    const search = q.get('search')?.trim().toLowerCase();
    const role = q.get('role');
    const isActive = q.get('isActive');
    const users = this.db.users
      .filter((u) => !search || u.username.toLowerCase().includes(search) || u.fullName.toLowerCase().includes(search))
      .filter((u) => !role || u.role === role)
      .filter((u) => isActive === null || String(u.isActive) === isActive)
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'th'))
      .map((u) => this.toUser(u));
    return paged(users, q);
  }

  private createUser(c: Ctx): MockResponse {
    this.auth(c, 'ADMIN');
    const v = new Validator(c.body);
    const username = v.str('username', 'ชื่อผู้ใช้', { max: 50 });
    if (username && !USERNAME_PATTERN.test(username)) {
      v.errors.push({ field: 'username', message: 'ใช้ได้เฉพาะ A-Z, 0-9 และ . _ - ความยาว 3-50 ตัวอักษร' });
    }
    const fullName = v.str('fullName', 'ชื่อ-นามสกุล');
    const role = v.oneOf('role', 'สิทธิ์', ['ADMIN', 'STAFF', 'USER'] as const);
    const password = this.password(v);
    v.check();
    if (this.findByUsername(username!)) {
      throw new MockError(409, 'DUPLICATE_CODE', 'ชื่อผู้ใช้นี้ถูกใช้แล้ว', [
        { field: 'username', message: 'ชื่อผู้ใช้นี้ถูกใช้แล้ว' },
      ]);
    }
    const now = new Date().toISOString();
    const user: UserRow = {
      id: crypto.randomUUID(),
      username: username!,
      password,
      fullName: fullName!,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.db.users.push(user);
    return ok(this.toUser(user), 201);
  }

  private updateUser(c: Ctx, id: string): MockResponse {
    const me = this.auth(c, 'ADMIN');
    const user = this.find(this.db.users, id, 'ไม่พบผู้ใช้');
    const v = new Validator(c.body);
    const fullName = v.str('fullName', 'ชื่อ-นามสกุล');
    const role = v.oneOf('role', 'สิทธิ์', ['ADMIN', 'STAFF', 'USER'] as const);
    const isActive = c.body['isActive'];
    if (typeof isActive !== 'boolean') v.errors.push({ field: 'isActive', message: 'สถานะไม่ถูกต้อง' });
    v.check();
    if (user.id === me.id && (role !== 'ADMIN' || !isActive)) {
      throw new MockError(400, 'VALIDATION_ERROR', 'ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้');
    }
    Object.assign(user, { fullName, role, isActive, updatedAt: new Date().toISOString() });
    return ok(this.toUser(user));
  }

  private resetPassword(c: Ctx, id: string): MockResponse {
    this.auth(c, 'ADMIN');
    const user = this.find(this.db.users, id, 'ไม่พบผู้ใช้');
    const v = new Validator(c.body);
    const password = this.password(v);
    v.check();
    Object.assign(user, { password, updatedAt: new Date().toISOString() });
    return ok(null);
  }

  private password(v: Validator): string {
    const password = v.str('password', 'รหัสผ่าน', { max: 100 }) ?? '';
    if (password && password.length < 8) v.errors.push({ field: 'password', message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
    return password;
  }

  // ---- categories ----

  private listCategories(c: Ctx): MockResponse {
    this.auth(c);
    return ok([...this.db.categories].sort((a, b) => a.name.localeCompare(b.name, 'th')) satisfies Category[]);
  }

  private saveCategory(c: Ctx, id?: string): MockResponse {
    this.auth(c, 'ADMIN');
    const existing = id ? this.find(this.db.categories, id, 'ไม่พบหมวดหมู่') : null;
    const v = new Validator(c.body);
    const name = v.str('name', 'ชื่อหมวดหมู่', { max: 100 });
    const description = v.str('description', 'คำอธิบาย', { required: false, max: 500 });
    v.check();
    if (this.db.categories.some((x) => x.id !== id && x.name === name)) {
      throw new MockError(409, 'DUPLICATE_CODE', 'ชื่อหมวดหมู่นี้มีอยู่แล้ว', [{ field: 'name', message: 'ชื่อหมวดหมู่นี้มีอยู่แล้ว' }]);
    }
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, { name, description, updatedAt: now });
      return ok(existing);
    }
    const category = { id: crypto.randomUUID(), name: name!, description, createdAt: now, updatedAt: now };
    this.db.categories.push(category);
    return ok(category, 201);
  }

  // ---- materials ----

  private material(id: string): MaterialRow {
    return this.find(this.db.materials, id, 'ไม่พบวัสดุ');
  }

  private toMaterial(m: MaterialRow): Material {
    const category = this.db.categories.find((c) => c.id === m.categoryId)!;
    return { ...m, category: { id: category.id, name: category.name } };
  }

  private listMaterials(c: Ctx): MockResponse {
    this.auth(c);
    const q = c.req.query;
    const search = q.get('search')?.trim().toLowerCase();
    const categoryId = q.get('categoryId');
    const status = (q.get('status') ?? 'ACTIVE') as MaterialStatus;
    const lowStock = q.get('lowStock') === 'true';
    const sortBy = (q.get('sortBy') ?? 'code') as keyof MaterialRow;
    const dir = q.get('sortOrder') === 'desc' ? -1 : 1;
    if (!['code', 'name', 'currentQuantity', 'updatedAt'].includes(sortBy)) {
      throw new MockError(400, 'VALIDATION_ERROR', 'sortBy ไม่ถูกต้อง');
    }
    const items = this.db.materials
      .filter((m) => m.status === status)
      .filter((m) => !categoryId || m.categoryId === categoryId)
      .filter((m) => !lowStock || m.currentQuantity <= m.minStock)
      .filter((m) => !search || m.code.toLowerCase().includes(search) || m.name.toLowerCase().includes(search))
      .sort((a, b) => {
        const x = a[sortBy];
        const y = b[sortBy];
        return (typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y), 'th')) * dir;
      })
      .map((m) => this.toMaterial(m));
    return paged(items, q);
  }

  private saveMaterial(c: Ctx, id?: string): MockResponse {
    this.auth(c, ...(id ? (['ADMIN'] as const) : (['ADMIN', 'STAFF'] as const)));
    const existing = id ? this.material(id) : null;
    const v = new Validator(c.body);
    const code = v.str('code', 'รหัสวัสดุ', { max: 50 });
    const name = v.str('name', 'ชื่อวัสดุ');
    const unit = v.str('unit', 'หน่วยนับ', { max: 30 });
    const location = v.str('location', 'ตำแหน่งจัดเก็บ', { required: false, max: 50 });
    const minStock = v.int('minStock', 'จุดสั่งซื้อ', 0);
    const categoryId = v.str('categoryId', 'หมวดหมู่');
    if (categoryId && !this.db.categories.some((x) => x.id === categoryId)) {
      v.errors.push({ field: 'categoryId', message: 'ไม่พบหมวดหมู่ที่เลือก' });
    }
    const status = existing ? v.oneOf('status', 'สถานะ', ['ACTIVE', 'INACTIVE'] as const) : 'ACTIVE';
    v.check();
    if (this.db.materials.some((m) => m.id !== id && m.code.toLowerCase() === code!.toLowerCase())) {
      throw new MockError(409, 'DUPLICATE_CODE', 'รหัสวัสดุนี้มีอยู่แล้ว', [{ field: 'code', message: 'รหัสวัสดุนี้มีอยู่แล้ว' }]);
    }
    const now = new Date().toISOString();
    const fields = { code: code!, name: name!, unit: unit!, location, minStock, categoryId: categoryId!, status, updatedAt: now };
    if (existing) {
      Object.assign(existing, fields); // currentQuantity is deliberately untouched
      return ok(this.toMaterial(existing));
    }
    const material: MaterialRow = { ...fields, id: crypto.randomUUID(), currentQuantity: 0, createdAt: now };
    this.db.materials.push(material);
    return ok(this.toMaterial(material), 201);
  }

  // ---- inventory ----

  private toTransaction(t: TransactionRow): StockTransaction {
    const by = this.db.users.find((u) => u.id === t.createdById)!;
    const ref = (x: TransactionRow | undefined) => (x ? { id: x.id, referenceNo: x.referenceNo } : null);
    return {
      id: t.id,
      type: t.type,
      referenceNo: t.referenceNo,
      createdBy: { id: by.id, fullName: by.fullName },
      note: t.note,
      reversalOf: ref(this.db.transactions.find((x) => x.id === t.reversalOfId)),
      reversedBy: ref(this.db.transactions.find((x) => x.reversalOfId === t.id)),
      createdAt: t.createdAt,
      items: t.items.map((i) => {
        const m = this.material(i.materialId);
        return { ...i, material: { id: m.id, code: m.code, name: m.name, unit: m.unit } };
      }),
    };
  }

  private createTransaction(c: Ctx): MockResponse {
    const user = this.auth(c);
    const v = new Validator(c.body);
    const type = v.oneOf('type', 'ประเภทรายการ', ['IN', 'OUT'] as const);
    const note = v.str('note', 'หมายเหตุ', { required: false, max: 500 });
    const rawItems = Array.isArray(c.body['items']) ? (c.body['items'] as Body[]) : [];
    if (rawItems.length < 1 || rawItems.length > 100) {
      v.errors.push({ field: 'items', message: 'ต้องมีรายการวัสดุ 1-100 รายการ' });
    }
    const items = rawItems.map((raw, i) => {
      const iv = new Validator(raw);
      const materialId = iv.str('materialId', 'วัสดุ') ?? '';
      const quantity = iv.int('quantity', 'จำนวน', 1);
      const price = raw['unitPrice'];
      if (price !== undefined && price !== null && (typeof price !== 'number' || price < 0)) {
        iv.errors.push({ field: 'unitPrice', message: 'ราคาต่อหน่วยไม่ถูกต้อง' });
      }
      v.errors.push(...iv.errors.map((e) => ({ ...e, field: `items.${i}.${e.field}` })));
      return { materialId, quantity, unitPrice: typeof price === 'number' ? price : undefined };
    });
    if (new Set(items.map((i) => i.materialId)).size !== items.length) {
      v.errors.push({ field: 'items', message: 'มีวัสดุซ้ำในรายการ' });
    }
    v.check();
    if (type === 'IN' && user.role === 'USER') throw new MockError(403, 'FORBIDDEN', 'ไม่มีสิทธิ์บันทึกรับเข้า');
    return ok(this.toTransaction(this.applyTransaction(user, type, note, items, null)), 201);
  }

  /** Validates stock, then applies all lines at once (the mock is synchronous, so this is atomic). */
  private applyTransaction(
    user: UserRow,
    type: TransactionType,
    note: string | null,
    items: { materialId: string; quantity: number; unitPrice?: number }[],
    reversalOfId: string | null,
  ): TransactionRow {
    const materials = items.map((i) => this.material(i.materialId));
    for (const [i, m] of materials.entries()) {
      // A reversal must always be possible, even if the material was switched off since.
      if (m.status !== 'ACTIVE' && !reversalOfId) throw new MockError(400, 'MATERIAL_INACTIVE', `วัสดุ "${m.name}" ถูกปิดใช้งาน`);
      if (type === 'OUT' && m.currentQuantity < items[i].quantity) {
        throw new MockError(
          400,
          'INSUFFICIENT_STOCK',
          `วัสดุ "${m.name}" คงเหลือ ${m.currentQuantity} ${m.unit} ไม่พอเบิก ${items[i].quantity} ${m.unit}`,
        );
      }
    }
    const now = new Date();
    materials.forEach((m, i) => {
      m.currentQuantity += type === 'IN' ? items[i].quantity : -items[i].quantity;
      m.updatedAt = now.toISOString();
    });
    const day = bangkokDate(now).replaceAll('-', '');
    this.db.counters[day] = (this.db.counters[day] ?? 0) + 1;
    const txn: TransactionRow = {
      id: crypto.randomUUID(),
      type,
      referenceNo: `TXN-${day}-${String(this.db.counters[day]).padStart(3, '0')}`,
      createdById: user.id,
      note,
      reversalOfId,
      createdAt: now.toISOString(),
      items: items.map((i) => ({
        id: crypto.randomUUID(),
        materialId: i.materialId,
        quantity: i.quantity,
        unitPrice: type === 'IN' && i.unitPrice !== undefined ? i.unitPrice.toFixed(2) : null,
      })),
    };
    this.db.transactions.push(txn);
    return txn;
  }

  private visibleTransaction(c: Ctx, id: string): TransactionRow {
    const user = this.auth(c);
    const t = this.find(this.db.transactions, id, 'ไม่พบรายการ');
    if (user.role === 'USER' && t.createdById !== user.id) throw new MockError(404, 'NOT_FOUND', 'ไม่พบรายการ');
    return t;
  }

  private getTransaction(c: Ctx, id: string): MockResponse {
    return ok(this.toTransaction(this.visibleTransaction(c, id)));
  }

  private reverse(c: Ctx, id: string): MockResponse {
    const admin = this.auth(c, 'ADMIN');
    const original = this.find(this.db.transactions, id, 'ไม่พบรายการ');
    const v = new Validator(c.body);
    const note = v.str('note', 'เหตุผลการยกเลิก', { max: 400 });
    v.check();
    if (original.reversalOfId || this.db.transactions.some((t) => t.reversalOfId === id)) {
      throw new MockError(409, 'ALREADY_REVERSED', 'รายการนี้ถูกยกเลิกไปแล้ว หรือเป็นรายการยกเลิก');
    }
    const txn = this.applyTransaction(
      admin,
      original.type === 'IN' ? 'OUT' : 'IN',
      `ยกเลิก ${original.referenceNo}: ${note}`,
      original.items.map(({ materialId, quantity }) => ({ materialId, quantity })),
      original.id,
    );
    return ok(this.toTransaction(txn), 201);
  }

  private history(c: Ctx): MockResponse {
    const user = this.auth(c);
    const q = c.req.query;
    const from = q.get('from');
    const to = q.get('to');
    const fromMs = from ? bangkokDayStart(from) : -Infinity;
    const toMs = to ? bangkokDayStart(to) + DAY_MS : Infinity;
    const type = q.get('type');
    const materialId = q.get('materialId');
    const createdById = user.role === 'USER' ? user.id : q.get('createdById');
    const items = this.db.transactions
      .filter((t) => {
        const at = Date.parse(t.createdAt);
        return at >= fromMs && at < toMs;
      })
      .filter((t) => !type || t.type === type)
      .filter((t) => !materialId || t.items.some((i) => i.materialId === materialId))
      .filter((t) => !createdById || t.createdById === createdById)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return paged(items, q, (t) => this.toTransaction(t));
  }

  // ---- dashboard (spec §6) ----

  /** OUT transactions that count as real usage: not reversed and not themselves reversals. */
  private realWithdrawals(): TransactionRow[] {
    const reversed = new Set(this.db.transactions.map((t) => t.reversalOfId).filter(Boolean));
    return this.db.transactions.filter((t) => t.type === 'OUT' && !t.reversalOfId && !reversed.has(t.id));
  }

  private lastOutByMaterial(): Map<string, string> {
    const last = new Map<string, string>();
    for (const t of this.realWithdrawals()) {
      for (const i of t.items) {
        if ((last.get(i.materialId) ?? '') < t.createdAt) last.set(i.materialId, t.createdAt);
      }
    }
    return last;
  }

  private activeMaterials(): MaterialRow[] {
    return this.db.materials.filter((m) => m.status === 'ACTIVE');
  }

  private summary(c: Ctx): MockResponse {
    this.auth(c, 'ADMIN', 'STAFF');
    const active = this.activeMaterials();
    const lastOut = this.lastOutByMaterial();
    const monthStart = bangkokDayStart(`${bangkokDate().slice(0, 7)}-01`);
    const data: DashboardSummary = {
      activeMaterials: active.length,
      reorderCount: this.reorder().length,
      outOfStockCount: active.filter((m) => m.currentQuantity === 0).length,
      neverWithdrawnCount: active.filter((m) => !lastOut.has(m.id)).length,
      withdrawalsThisMonth: this.realWithdrawals().filter((t) => Date.parse(t.createdAt) >= monthStart).length,
    };
    return ok(data);
  }

  reorder(): ReorderSuggestion[] {
    const since = Date.now() - USAGE_WINDOW_DAYS * DAY_MS;
    const used = new Map<string, number>();
    for (const t of this.realWithdrawals()) {
      if (Date.parse(t.createdAt) < since) continue;
      for (const i of t.items) used.set(i.materialId, (used.get(i.materialId) ?? 0) + i.quantity);
    }
    return this.activeMaterials()
      .map((m) => {
        const avgDailyUsage = (used.get(m.id) ?? 0) / USAGE_WINDOW_DAYS;
        const daysLeft = avgDailyUsage > 0 ? m.currentQuantity / avgDailyUsage : null;
        return {
          id: m.id,
          code: m.code,
          name: m.name,
          unit: m.unit,
          currentQuantity: m.currentQuantity,
          minStock: m.minStock,
          avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
          daysLeft: daysLeft === null ? null : Math.floor(daysLeft),
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

  private topWithdrawn(c: Ctx): MockResponse {
    this.auth(c, 'ADMIN', 'STAFF');
    const q = c.req.query;
    const to = q.get('to');
    const from = q.get('from');
    const toMs = to ? bangkokDayStart(to) + DAY_MS : Date.now();
    const fromMs = from ? bangkokDayStart(from) : toMs - 30 * DAY_MS;
    const limit = Math.min(Number(q.get('limit')) || 10, 50);
    const byCount = q.get('sortBy') === 'count';
    const active = new Map(this.activeMaterials().map((m) => [m.id, m]));
    const stats = new Map<string, TopWithdrawn>();
    for (const t of this.realWithdrawals()) {
      const at = Date.parse(t.createdAt);
      if (at < fromMs || at >= toMs) continue;
      for (const i of t.items) {
        const m = active.get(i.materialId);
        if (!m) continue;
        const s = stats.get(m.id) ?? { id: m.id, code: m.code, name: m.name, unit: m.unit, totalQuantity: 0, withdrawalCount: 0 };
        s.totalQuantity += i.quantity;
        s.withdrawalCount += 1;
        stats.set(m.id, s);
      }
    }
    const key = byCount ? 'withdrawalCount' : 'totalQuantity';
    return ok([...stats.values()].sort((a, b) => b[key] - a[key]).slice(0, limit));
  }

  private unused(c: Ctx): MockResponse {
    this.auth(c, 'ADMIN', 'STAFF');
    const days = c.req.query.get('days');
    const cutoff = days ? new Date(Date.now() - Number(days) * DAY_MS).toISOString() : null;
    const lastOut = this.lastOutByMaterial();
    const data: UnusedMaterial[] = this.activeMaterials()
      .map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        unit: m.unit,
        currentQuantity: m.currentQuantity,
        createdAt: m.createdAt,
        lastOutAt: lastOut.get(m.id) ?? null,
      }))
      .filter((m) => m.lastOutAt === null || (cutoff !== null && m.lastOutAt < cutoff))
      .sort((a, b) => (a.lastOutAt ?? '').localeCompare(b.lastOutAt ?? '') || b.currentQuantity - a.currentQuantity);
    return ok(data);
  }

  // ---- helpers ----

  private find<T extends { id: string }>(rows: T[], id: string, message: string): T {
    const row = rows.find((x) => x.id === id);
    if (!row) throw new MockError(404, 'NOT_FOUND', message);
    return row;
  }
}
