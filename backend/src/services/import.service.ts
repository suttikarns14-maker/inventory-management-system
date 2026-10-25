import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import type { z } from 'zod';
import type { commitInitialImportSchema, commitReceiptImportSchema } from '../dtos/index.js';
import type { DepartmentKind, Prisma, TrackingType } from '../generated/prisma/client.js';
import { prisma, type Tx } from '../lib/prisma.js';
import type { SessionUser } from '../middlewares/auth.middleware.js';
import { AppError } from '../utils/app-error.js';
import { FLOORS, IMPORT_DEFAULT_MIN_STOCK, IMPORT_DEFAULT_UNIT } from '../utils/constants.js';
import { bangkokDate } from '../utils/date.js';
import { columnList, COLUMNS, findSheet, loadWorkbook, readRows, type SheetRow, WITHDRAWN } from '../utils/xlsx.js';
import { materialKey } from './material.service.js';
import { applyTransaction, type Line } from './transaction.service.js';

// Spec v2.2 §5: Excel import. `preview` parses and plans without writing; `commit` writes the
// plan plus the admin's decisions in one DB transaction.

// ---- in-memory plans between preview and commit ----

// ponytail: in-memory, single API instance; move to a table if the API ever runs on more than one.
const PLAN_TTL_MS = 30 * 60_000;
const plans = new Map<string, { userId: string; expires: number; plan: InitialPlan | ReceiptPlan }>();

function storePlan(user: SessionUser, plan: InitialPlan | ReceiptPlan): string {
  const now = Date.now();
  for (const [id, p] of plans) if (p.expires < now) plans.delete(id);
  const id = randomUUID();
  plans.set(id, { userId: user.id, expires: now + PLAN_TTL_MS, plan });
  return id;
}

function takePlan<K extends (InitialPlan | ReceiptPlan)['kind']>(user: SessionUser, id: string, kind: K) {
  const entry = plans.get(id);
  if (!entry || entry.userId !== user.id || entry.expires < Date.now() || entry.plan.kind !== kind) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ผลตรวจไฟล์หมดอายุแล้ว กรุณาอัปโหลดไฟล์ใหม่');
  }
  plans.delete(id);
  return entry.plan as Extract<InitialPlan | ReceiptPlan, { kind: K }>;
}

// ---- shared planning ----

const CODE_PREFIX: Record<string, string> = {
  'อุปกรณ์หลัก (Hardware)': 'HW',
  'อุปกรณ์เครือข่าย': 'NET',
  'อุปกรณ์ต่อพ่วง': 'PER',
  'วัสดุสิ้นเปลือง / อุปกรณ์ประกอบ': 'CON',
};
const prefixFor = (type: string) => CODE_PREFIX[type] ?? 'OTH';

const clean = (s: string) => (s && s !== '-' ? s : null);

interface PlannedMaterial {
  key: string;
  /** null = already exists (receipt import) */
  existingId: string | null;
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string;
  storage: string | null;
  rows: SheetRow[];
  validSerials: number;
  proposed: TrackingType;
}

interface Issue {
  row: number | null;
  message: string;
  blocking: boolean;
}

/** Spec v2.2 §5.3: a serial is real if present, not "-", and not repeated in the file. */
function serialCounts(rows: SheetRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const s = r.serial.toLowerCase();
    if (s && s !== '-') counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return counts;
}
const isRealSerial = (r: SheetRow, counts: Map<string, number>) =>
  !!r.serial && r.serial !== '-' && counts.get(r.serial.toLowerCase()) === 1;

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Groups rows into materials by name + brand + model (spaces and case ignored). */
function groupMaterials(rows: SheetRow[], counts: Map<string, number>) {
  const groups = new Map<string, SheetRow[]>();
  for (const r of rows) {
    const key = materialKey(r.name, r.brand, r.model);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const validSerials = rs.filter((r) => isRealSerial(r, counts)).length;
    return {
      key,
      rows: rs,
      name: mostCommon(rs.map((r) => r.name.replace(/\s+/g, ' ')))!,
      brand: clean(rs[0]!.brand),
      model: clean(rs[0]!.model),
      category: rs[0]!.type || 'ไม่ระบุประเภท',
      storage: mostCommon(rs.map((r) => r.storage)),
      validSerials,
      // Partly serialised materials are tracked per unit with placeholders (decision D15).
      proposed: (validSerials > 0 ? 'SERIAL' : 'QUANTITY') as TrackingType,
    };
  });
}

/**
 * Serial per row for a SERIAL material. Rows without a real serial get
 * `<real serial of the nearest row>-TEMP-SN-NN` (D15); `taken` keeps them globally unique.
 */
function assignSerials(m: { code: string; rows: SheetRow[] }, counts: Map<string, number>, taken: Set<string>) {
  const real = m.rows.filter((r) => isRealSerial(r, counts));
  let n = 0;
  return m.rows.map((r) => {
    if (isRealSerial(r, counts)) return { row: r, serial: r.serial, temp: false };
    const nearest = real.reduce<SheetRow | null>(
      (best, x) => (!best || Math.abs(x.row - r.row) < Math.abs(best.row - r.row) ? x : best),
      null,
    );
    let serial: string;
    do serial = `${nearest?.serial ?? m.code}-TEMP-SN-${String(++n).padStart(2, '0')}`;
    while (taken.has(serial.toLowerCase()));
    taken.add(serial.toLowerCase());
    return { row: r, serial, temp: true };
  });
}

/** Fiscal year 2568 (B.E.) starts on 1 Oct 2024 (C.E.). */
const fiscalYearStart = (fy: number) => `${fy - 544}-10-01`;
const atBangkok = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+07:00`);

const numberOrNull = (s: string) => {
  const n = Number(s.replace(/,/g, ''));
  return s && Number.isFinite(n) ? n : null;
};

// ---- initial import (with history) ----

interface InitialPlan {
  kind: 'initial';
  materials: PlannedMaterial[];
  rows: SheetRow[];
  serialCounts: Map<string, number>;
  lookups: { main: string[]; sub: string[]; buildings: string[]; storage: string[]; types: string[] };
  unmatched: { requestingDepartments: Map<string, number>; usingDepartments: Map<string, number>; buildings: Map<string, number> };
  issues: Issue[];
}

async function assertEmptySystem(): Promise<void> {
  const [materials, transactions] = await Promise.all([prisma.material.count(), prisma.stockTransaction.count()]);
  if (materials || transactions) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'นำเข้าข้อมูลเริ่มต้นได้เฉพาะตอนที่ระบบยังไม่มีวัสดุ ของที่ซื้อเพิ่มให้นำเข้าจากหน้า "รับเข้า"',
    );
  }
}

export async function previewInitialImport(user: SessionUser, file: Buffer) {
  await assertEmptySystem();
  const wb = await loadWorkbook(file);
  const list = findSheet(wb, 'รายการ');
  const dd = findSheet(wb, 'Dropdowndata');
  if (!list || !dd) throw new AppError(400, 'VALIDATION_ERROR', 'ไฟล์ต้องมีชีต "รายการ" และ "Dropdowndata"');

  const rows = readRows(list, ['name', 'brand', 'model', 'serial', 'type', 'status', 'fiscalYear']);
  if (!rows.length) throw new AppError(400, 'VALIDATION_ERROR', 'ไม่พบข้อมูลในชีต "รายการ"');
  const main = columnList(dd, 'หน่วยงานหลัก');
  const lookups = {
    main,
    sub: columnList(dd, 'หน่วยงานย่อย').filter((s) => !main.includes(s)),
    buildings: columnList(dd, 'อาคาร'),
    storage: columnList(dd, 'สถานที่เก็บของ'),
    types: columnList(dd, 'ประเภทอุปกรณ์'),
  };

  const counts = serialCounts(rows);
  const codeSeq = new Map<string, number>();
  const materials: PlannedMaterial[] = groupMaterials(rows, counts).map((g) => {
    const prefix = prefixFor(g.category);
    codeSeq.set(prefix, (codeSeq.get(prefix) ?? 0) + 1);
    return { ...g, existingId: null, code: `${prefix}-${String(codeSeq.get(prefix)).padStart(3, '0')}` };
  });

  const issues: Issue[] = [];
  const unmatched = { requestingDepartments: new Map<string, number>(), usingDepartments: new Map<string, number>(), buildings: new Map<string, number>() };
  const bump = (m: Map<string, number>, v: string) => m.set(v, (m.get(v) ?? 0) + 1);
  const allDepartments = new Set([...lookups.main, ...lookups.sub]);
  for (const r of rows) {
    const fy = Number(r.fiscalYear);
    if (!Number.isInteger(fy) || fy < 2500) issues.push({ row: r.row, message: `ปีงบประมาณไม่ถูกต้อง "${r.fiscalYear}"`, blocking: true });
    if (r.price && numberOrNull(r.price) === null) issues.push({ row: r.row, message: `ราคาไม่ใช่ตัวเลข "${r.price}" (จะไม่บันทึกราคา)`, blocking: false });
    if (r.storage && !lookups.storage.includes(r.storage)) issues.push({ row: r.row, message: `สถานที่เก็บของ "${r.storage}" ไม่อยู่ในรายการ`, blocking: false });
    if (r.status !== WITHDRAWN) continue;
    if (!r.date) issues.push({ row: r.row, message: 'เบิกแล้วแต่ไม่มีวันที่เบิก (จะใช้วันเริ่มปีงบประมาณ)', blocking: false });
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) issues.push({ row: r.row, message: `วันที่เบิกไม่ถูกต้อง "${r.date}"`, blocking: true });
    if (!r.requester) issues.push({ row: r.row, message: 'เบิกแล้วแต่ไม่มีชื่อผู้เบิก (จะบันทึกเป็น "ไม่ระบุ")', blocking: false });
    if (r.requestingDept && !allDepartments.has(r.requestingDept)) bump(unmatched.requestingDepartments, r.requestingDept);
    if (r.usingDept && !allDepartments.has(r.usingDept)) bump(unmatched.usingDepartments, r.usingDept);
    if (r.building && !lookups.buildings.includes(r.building)) bump(unmatched.buildings, r.building);
    if (r.floor && !(FLOORS as readonly string[]).includes(r.floor)) issues.push({ row: r.row, message: `ชั้น "${r.floor}" ไม่อยู่ในรายการ (จะเก็บในหมายเหตุ)`, blocking: false });
  }

  const plan: InitialPlan = { kind: 'initial', materials, rows, serialCounts: counts, lookups, unmatched, issues };
  const importId = storePlan(user, plan);
  return { importId, ...describeInitial(plan) };
}

function describeInitial(plan: InitialPlan) {
  const withdrawn = plan.rows.filter((r) => r.status === WITHDRAWN);
  const toList = (m: Map<string, number>) => [...m.entries()].map(([value, rows]) => ({ value, rows })).sort((a, b) => b.rows - a.rows);
  return {
    summary: {
      rows: plan.rows.length,
      materials: plan.materials.length,
      inStockUnits: plan.rows.length - withdrawn.length,
      withdrawnUnits: withdrawn.length,
      receipts: new Set(plan.rows.map((r) => `${r.fiscalYear}|${r.project}`)).size,
      withdrawals: new Set(withdrawn.map(withdrawalKey)).size,
    },
    materials: plan.materials.map((m) => ({
      key: m.key,
      code: m.code,
      name: m.name,
      brand: m.brand,
      model: m.model,
      category: m.category,
      units: m.rows.length,
      withdrawn: m.rows.filter((r) => r.status === WITHDRAWN).length,
      validSerials: m.validSerials,
      proposed: m.proposed,
    })),
    unmatched: {
      requestingDepartments: toList(plan.unmatched.requestingDepartments),
      usingDepartments: toList(plan.unmatched.usingDepartments),
      buildings: toList(plan.unmatched.buildings),
    },
    options: {
      allDepartments: [...plan.lookups.main, ...plan.lookups.sub],
      buildings: plan.lookups.buildings,
    },
    issues: plan.issues,
  };
}

const withdrawalKey = (r: SheetRow) =>
  [r.date, r.requester, r.requestingDept, r.usingDept, r.building, r.floor, r.purpose].join('|');

export async function commitInitialImport(user: SessionUser, input: z.infer<typeof commitInitialImportSchema>) {
  const plan = takePlan(user, input.importId, 'initial');
  if (plan.issues.some((i) => i.blocking)) throw new AppError(400, 'VALIDATION_ERROR', 'ไฟล์มีปัญหาที่ต้องแก้ก่อนนำเข้า');
  await assertEmptySystem();

  return prisma.$transaction(
    async (tx) => {
      // Sample categories from the seed go; categories come from the file (spec v2.2 §7).
      await tx.category.deleteMany({ where: { materials: { none: {} } } });

      // Reference data from Dropdowndata (existing names are kept).
      const deptKinds = new Map<string, DepartmentKind>([
        ...plan.lookups.sub.map((n) => [n, 'SUB'] as const),
        ...plan.lookups.main.map((n) => [n, 'MAIN'] as const),
      ]);
      await tx.department.createMany({ data: [...deptKinds].map(([name, kind]) => ({ name, kind })), skipDuplicates: true });
      await tx.building.createMany({ data: plan.lookups.buildings.map((name) => ({ name })), skipDuplicates: true });
      await tx.storageLocation.createMany({ data: plan.lookups.storage.map((name) => ({ name })), skipDuplicates: true });
      const categoryNames = [...new Set([...plan.lookups.types, ...plan.materials.map((m) => m.category)])];
      await tx.category.createMany({ data: categoryNames.map((name) => ({ name })), skipDuplicates: true });

      const idMap = async <T extends { id: string; name: string }>(p: Promise<T[]>) =>
        new Map((await p).map((x) => [x.name, x.id]));
      const [departments, buildings, storage, categories] = await Promise.all([
        idMap(tx.department.findMany({ select: { id: true, name: true } })),
        idMap(tx.building.findMany({ select: { id: true, name: true } })),
        idMap(tx.storageLocation.findMany({ select: { id: true, name: true } })),
        idMap(tx.category.findMany({ select: { id: true, name: true } })),
      ]);

      // Materials, with the stock they end up with.
      const tracking = (m: PlannedMaterial) => input.tracking[m.key] ?? m.proposed;
      const materialIds = new Map(plan.materials.map((m) => [m.key, randomUUID()]));
      await tx.material.createMany({
        data: plan.materials.map((m) => ({
          id: materialIds.get(m.key)!,
          code: m.code,
          name: m.name,
          brand: m.brand,
          model: m.model,
          categoryId: categories.get(m.category)!,
          unit: IMPORT_DEFAULT_UNIT,
          minStock: IMPORT_DEFAULT_MIN_STOCK,
          trackingType: tracking(m),
          storageLocationId: m.storage ? (storage.get(m.storage) ?? null) : null,
          currentQuantity: m.rows.filter((r) => r.status !== WITHDRAWN).length,
        })),
      });

      // Units of SERIAL materials, keyed by sheet row.
      const taken = new Set([...plan.serialCounts.keys()]);
      const unitByRow = new Map<number, string>();
      const units = plan.materials
        .filter((m) => tracking(m) === 'SERIAL')
        .flatMap((m) =>
          assignSerials(m, plan.serialCounts, taken).map(({ row, serial, temp }) => {
            const id = randomUUID();
            unitByRow.set(row.row, id);
            return {
              id,
              materialId: materialIds.get(m.key)!,
              serialNumber: serial,
              isTempSerial: temp,
              status: row.status === WITHDRAWN ? ('ISSUED' as const) : ('IN_STOCK' as const),
              storageLocationId: (row.storage && storage.get(row.storage)) || (m.storage && storage.get(m.storage)) || null,
            };
          }),
        );
      if (units.length) await tx.materialUnit.createMany({ data: units });

      const keyOfRow = new Map(plan.materials.flatMap((m) => m.rows.map((r) => [r.row, m.key] as const)));
      const transactions: Prisma.StockTransactionCreateManyInput[] = [];
      const items: { transactionId: string; materialId: string; quantity: number; unitPrice: number | null }[] = [];
      const links: { transactionId: string; unitId: string; remark: string | null }[] = [];

      /** Adds one transaction with its rows grouped per material. */
      const addTransaction = (
        header: Omit<Prisma.StockTransactionCreateManyInput, 'id' | 'referenceNo' | 'createdById'>,
        rows: SheetRow[],
        withPrice: boolean,
      ) => {
        const id = randomUUID();
        transactions.push({ ...header, id, referenceNo: '', createdById: user.id });
        const perMaterial = new Map<string, SheetRow[]>();
        for (const r of rows) perMaterial.set(keyOfRow.get(r.row)!, [...(perMaterial.get(keyOfRow.get(r.row)!) ?? []), r]);
        for (const [key, rs] of perMaterial) {
          items.push({
            transactionId: id,
            materialId: materialIds.get(key)!,
            quantity: rs.length,
            unitPrice: withPrice ? (rs.map((r) => numberOrNull(r.price)).find((p) => p !== null) ?? null) : null,
          });
          for (const r of rs) {
            const unitId = unitByRow.get(r.row);
            if (unitId) links.push({ transactionId: id, unitId, remark: withPrice ? null : r.remark || null });
          }
        }
      };

      // Receipts: one per (fiscal year, project), dated the start of that fiscal year.
      const lots = new Map<string, SheetRow[]>();
      for (const r of plan.rows) lots.set(`${r.fiscalYear}|${r.project}`, [...(lots.get(`${r.fiscalYear}|${r.project}`) ?? []), r]);
      for (const rs of lots.values()) {
        const fy = Number(rs[0]!.fiscalYear);
        addTransaction(
          {
            type: 'IN',
            createdAt: atBangkok(fiscalYearStart(fy), 9),
            fiscalYear: fy,
            projectName: rs[0]!.project || null,
            requesterName: user.fullName,
            note: 'นำเข้าข้อมูลเริ่มต้นจาก Excel',
          },
          rs,
          true,
        );
      }

      // Past withdrawals, grouped by date + requester + departments + place + purpose.
      const map = (m: Record<string, string | null>, valid: (v: string) => boolean, ids: Map<string, string>, v: string) => {
        if (!v) return { id: null, unmatched: null };
        if (valid(v)) return { id: ids.get(v) ?? null, unmatched: null };
        const target = m[v];
        return target ? { id: ids.get(target) ?? null, unmatched: null } : { id: null, unmatched: v };
      };
      const allDepartments = new Set([...plan.lookups.main, ...plan.lookups.sub]);
      const outs = new Map<string, SheetRow[]>();
      for (const r of plan.rows.filter((x) => x.status === WITHDRAWN)) outs.set(withdrawalKey(r), [...(outs.get(withdrawalKey(r)) ?? []), r]);
      for (const rs of outs.values()) {
        const r = rs[0]!;
        const requesting = map(input.mapping.requestingDepartments, (v) => allDepartments.has(v), departments, r.requestingDept);
        const using = map(input.mapping.usingDepartments, (v) => allDepartments.has(v), departments, r.usingDept);
        const building = map(input.mapping.buildings, (v) => plan.lookups.buildings.includes(v), buildings, r.building);
        const floorOk = !r.floor || (FLOORS as readonly string[]).includes(r.floor);
        // Anything that could not be placed in a field is kept as text (decision D14).
        const notes = [
          requesting.unmatched && `หน่วยงานที่เบิก (เดิม): ${requesting.unmatched}`,
          using.unmatched && `หน่วยงานที่ใช้ (เดิม): ${using.unmatched}`,
          building.unmatched && `อาคาร (เดิม): ${building.unmatched}`,
          !floorOk && `ชั้น (เดิม): ${r.floor}`,
          ...new Set(rs.filter((x) => !unitByRow.has(x.row) && x.remark).map((x) => x.remark)),
        ].filter(Boolean);
        addTransaction(
          {
            type: 'OUT',
            createdAt: atBangkok(r.date || fiscalYearStart(Number(r.fiscalYear)), 10),
            requesterName: r.requester || 'ไม่ระบุ',
            requestingDepartmentId: requesting.id,
            usingDepartmentId: using.id,
            buildingId: building.id,
            floor: floorOk ? r.floor || null : null,
            purpose: r.purpose || null,
            note: notes.length ? notes.join(' · ') : null,
          },
          rs,
          false,
        );
      }

      // Reference numbers in date order, per Bangkok day, then seed the counters to match.
      transactions.sort((a, b) => +new Date(a.createdAt!) - +new Date(b.createdAt!));
      const perDay = new Map<string, number>();
      for (const t of transactions) {
        const day = bangkokDate(new Date(t.createdAt!)).replaceAll('-', '');
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
        t.referenceNo = `TXN-${day}-${String(perDay.get(day)).padStart(3, '0')}`;
      }
      await tx.stockTransaction.createMany({ data: transactions });
      await tx.stockTransactionItem.createMany({ data: items });
      if (links.length) await tx.transactionUnit.createMany({ data: links });
      for (const [date, lastValue] of perDay) {
        await tx.referenceCounter.upsert({ where: { date }, create: { date, lastValue }, update: { lastValue } });
      }

      return {
        materials: plan.materials.length,
        serialMaterials: plan.materials.filter((m) => tracking(m) === 'SERIAL').length,
        units: units.length,
        tempSerials: units.filter((u) => u.isTempSerial).length,
        receipts: lots.size,
        withdrawals: outs.size,
        inStock: plan.rows.length - plan.rows.filter((r) => r.status === WITHDRAWN).length,
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

// ---- receipt import (new purchases, spec v2.2 §5.4) ----

interface ReceiptPlan {
  kind: 'receipt';
  materials: PlannedMaterial[];
  serialCounts: Map<string, number>;
  issues: Issue[];
}

const RECEIPT_COLUMNS = ['name', 'brand', 'model', 'serial', 'type', 'fiscalYear', 'price', 'project', 'storage', 'remark'] as const;

export async function previewReceiptImport(user: SessionUser, file: Buffer) {
  const wb = await loadWorkbook(file);
  const ws = findSheet(wb, 'รายการ') ?? wb.worksheets[0];
  if (!ws) throw new AppError(400, 'VALIDATION_ERROR', 'ไม่พบชีตข้อมูลในไฟล์');
  const rows = readRows(ws, ['name', 'brand', 'model', 'serial', 'type']);
  if (!rows.length) throw new AppError(400, 'VALIDATION_ERROR', 'ไม่พบข้อมูลในไฟล์');

  const counts = serialCounts(rows);
  const [existing, storage] = await Promise.all([
    prisma.material.findMany({ select: { id: true, code: true, name: true, brand: true, model: true, trackingType: true } }),
    prisma.storageLocation.findMany({ where: { isActive: true }, select: { name: true } }),
  ]);
  const existingByKey = new Map(existing.map((m) => [materialKey(m.name, m.brand, m.model), m]));
  const nextCode = await codeAllocator(existing.map((m) => m.code));

  const materials: PlannedMaterial[] = groupMaterials(rows, counts).map((g) => {
    const found = existingByKey.get(g.key);
    return found
      ? { ...g, existingId: found.id, code: found.code, name: found.name, proposed: found.trackingType }
      : { ...g, existingId: null, code: nextCode(prefixFor(g.category)) };
  });

  const issues: Issue[] = [];
  const storageNames = new Set(storage.map((s) => s.name));
  for (const r of rows) {
    if (r.status === WITHDRAWN) issues.push({ row: r.row, message: 'ไฟล์รับเข้าต้องไม่มีแถวที่ "เบิกแล้ว"', blocking: true });
    if (r.fiscalYear && !(Number(r.fiscalYear) >= 2500 && Number(r.fiscalYear) <= 2700)) {
      issues.push({ row: r.row, message: `ปีงบประมาณไม่ถูกต้อง "${r.fiscalYear}"`, blocking: true });
    }
    if (r.price && numberOrNull(r.price) === null) issues.push({ row: r.row, message: `ราคาไม่ใช่ตัวเลข "${r.price}"`, blocking: true });
    if (r.storage && !storageNames.has(r.storage)) issues.push({ row: r.row, message: `สถานที่เก็บของ "${r.storage}" ไม่อยู่ในรายการ (จะไม่บันทึก)`, blocking: false });
  }
  // Serials that already exist in the system (only matters for materials tracked per unit).
  issues.push(...(await serialConflicts(prisma, materials, counts, {})));

  const plan: ReceiptPlan = { kind: 'receipt', materials, serialCounts: counts, issues };
  const importId = storePlan(user, plan);
  return {
    importId,
    summary: {
      rows: rows.length,
      materials: materials.length,
      newMaterials: materials.filter((m) => !m.existingId).length,
      receipts: new Set(rows.map((r) => `${r.fiscalYear}|${r.project}`)).size,
    },
    materials: materials.map((m) => ({
      key: m.key,
      existing: !!m.existingId,
      code: m.code,
      name: m.name,
      brand: m.brand,
      model: m.model,
      category: m.category,
      units: m.rows.length,
      validSerials: m.validSerials,
      proposed: m.proposed,
    })),
    issues,
  };
}

/** Next free code per prefix, e.g. HW-088 after HW-087. */
async function codeAllocator(codes: string[]) {
  const max = new Map<string, number>();
  for (const c of codes) {
    const m = /^([A-Z]+)-(\d+)$/.exec(c);
    if (m) max.set(m[1]!, Math.max(max.get(m[1]!) ?? 0, Number(m[2])));
  }
  return (prefix: string) => {
    max.set(prefix, (max.get(prefix) ?? 0) + 1);
    return `${prefix}-${String(max.get(prefix)).padStart(3, '0')}`;
  };
}

async function serialConflicts(
  db: Tx | typeof prisma,
  materials: PlannedMaterial[],
  counts: Map<string, number>,
  decisions: Record<string, TrackingType>,
): Promise<Issue[]> {
  const serialRows = materials
    .filter((m) => (m.existingId ? m.proposed : (decisions[m.key] ?? m.proposed)) === 'SERIAL')
    .flatMap((m) => m.rows.filter((r) => isRealSerial(r, counts)));
  if (!serialRows.length) return [];
  const existing = await db.$queryRaw<{ s: string }[]>`
    SELECT lower(serial_number) AS s FROM material_units
    WHERE lower(serial_number) = ANY(${serialRows.map((r) => r.serial.toLowerCase())}::text[])`;
  const taken = new Set(existing.map((e) => e.s));
  return serialRows
    .filter((r) => taken.has(r.serial.toLowerCase()))
    .map((r) => ({ row: r.row, message: `S/N "${r.serial}" มีอยู่ในระบบแล้ว`, blocking: true }));
}

export async function commitReceiptImport(user: SessionUser, input: z.infer<typeof commitReceiptImportSchema>) {
  const plan = takePlan(user, input.importId, 'receipt');
  if (plan.issues.some((i) => i.blocking && !i.message.includes('มีอยู่ในระบบแล้ว'))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ไฟล์มีปัญหาที่ต้องแก้ก่อนนำเข้า');
  }

  return prisma.$transaction(
    async (tx) => {
      const conflicts = await serialConflicts(tx, plan.materials, plan.serialCounts, input.tracking);
      if (conflicts.length) throw new AppError(409, 'DUPLICATE_SERIAL', conflicts.slice(0, 5).map((c) => `แถว ${c.row}: ${c.message}`).join(' · '));

      // New materials first (category created if the type is new).
      const storage = new Map((await tx.storageLocation.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id]));
      const materialIds = new Map<string, string>();
      const tracking = new Map<string, TrackingType>();
      for (const m of plan.materials) {
        if (m.existingId) {
          materialIds.set(m.key, m.existingId);
          tracking.set(m.key, m.proposed);
          continue;
        }
        const category =
          (await tx.category.findFirst({ where: { name: { equals: m.category, mode: 'insensitive' } } })) ??
          (await tx.category.create({ data: { name: m.category } }));
        const type = input.tracking[m.key] ?? m.proposed;
        const created = await tx.material.create({
          data: {
            code: m.code,
            name: m.name,
            brand: m.brand,
            model: m.model,
            categoryId: category.id,
            unit: IMPORT_DEFAULT_UNIT,
            minStock: IMPORT_DEFAULT_MIN_STOCK,
            trackingType: type,
            storageLocationId: m.storage ? (storage.get(m.storage) ?? null) : null,
          },
        });
        materialIds.set(m.key, created.id);
        tracking.set(m.key, type);
      }

      // One receipt per (fiscal year, project), through the normal stock rules.
      const existingSerials = await tx.$queryRaw<{ s: string }[]>`SELECT lower(serial_number) AS s FROM material_units`;
      const taken = new Set([...plan.serialCounts.keys(), ...existingSerials.map((e) => e.s)]);
      const lots = new Map<string, Map<string, SheetRow[]>>();
      for (const m of plan.materials) {
        for (const r of m.rows) {
          const lot = `${r.fiscalYear}|${r.project}`;
          const perMaterial = lots.get(lot) ?? new Map<string, SheetRow[]>();
          perMaterial.set(m.key, [...(perMaterial.get(m.key) ?? []), r]);
          lots.set(lot, perMaterial);
        }
      }
      const created = [];
      for (const perMaterial of lots.values()) {
        const first = [...perMaterial.values()][0]![0]!;
        const lines: Line[] = [...perMaterial].map(([key, rows]) => {
          const m = plan.materials.find((x) => x.key === key)!;
          const unitPrice = rows.map((r) => numberOrNull(r.price)).find((p) => p !== null) ?? undefined;
          if (tracking.get(key) !== 'SERIAL') return { materialId: materialIds.get(key)!, quantity: rows.length, unitPrice };
          const serials = assignSerials({ code: m.code, rows }, plan.serialCounts, taken);
          return {
            materialId: materialIds.get(key)!,
            quantity: serials.length,
            unitPrice,
            serialNumbers: serials.map((s) => s.serial),
            tempSerials: new Set(serials.filter((s) => s.temp).map((s) => s.serial)),
          };
        });
        created.push(
          await applyTransaction(
            user,
            'IN',
            {
              fiscalYear: first.fiscalYear ? Number(first.fiscalYear) : null,
              projectName: first.project || null,
              requesterName: user.fullName,
              note: 'นำเข้าจากไฟล์',
            },
            lines,
            null,
            tx,
          ),
        );
      }
      return { transactions: created.map((t) => ({ id: t.id, referenceNo: t.referenceNo })) };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

// ---- template ----

/** Blank receipt file with the expected headers and dropdowns from the current lookups. */
export async function receiptTemplate(): Promise<Buffer> {
  const [categories, storage] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
    prisma.storageLocation.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { name: true } }),
  ]);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('รายการ');
  const lists = wb.addWorksheet('Dropdowndata');
  ws.columns = RECEIPT_COLUMNS.map((k) => ({ header: COLUMNS[k], key: k, width: k === 'name' || k === 'storage' ? 40 : 18 }));
  ws.getRow(1).font = { bold: true };
  lists.getColumn(1).values = ['ประเภทอุปกรณ์', ...categories.map((c) => c.name)];
  lists.getColumn(2).values = ['สถานที่เก็บของ', ...storage.map((s) => s.name)];
  for (let r = 2; r <= 1000; r++) {
    ws.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Dropdowndata!$A$2:$A$${categories.length + 1}`] };
    ws.getCell(`I${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Dropdowndata!$B$2:$B$${storage.length + 1}`] };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Exposed for tests.
export const _internal = { fiscalYearStart, assignSerials, serialCounts };
