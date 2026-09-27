import { bangkokDate, DAY_MS } from '../../shared/utils/date';
import { MaterialStatus } from '../../shared/models/material';
import {
  CategoryRow,
  MaterialRow,
  MockData,
  TransactionItemRow,
  TransactionRow,
  UserRow,
} from './mock-db';

export const MOCK_PASSWORD = 'password123';

export const MOCK_ACCOUNTS = [
  { email: 'admin@example.com', label: 'ADMIN' },
  { email: 'staff@example.com', label: 'STAFF' },
  { email: 'user@example.com', label: 'USER' },
] as const;

/** Deterministic PRNG so every reset produces the same story. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How a material behaves over the simulated period:
 * normal = used and restocked, low = restocking stops ~40 days ago,
 * out = heavy use and no restock for 60 days, unused = never withdrawn,
 * inactive = used until ~90 days ago, then switched off.
 */
type Profile = 'normal' | 'low' | 'out' | 'unused' | 'inactive';

type MaterialSpec = [code: string, name: string, cat: number, unit: string, minStock: number, avgDaily: number, price: number, profile: Profile];

const CATEGORIES: [string, string][] = [
  ['วัสดุสำนักงาน', 'กระดาษ เครื่องเขียน และของใช้ในสำนักงาน'],
  ['อุปกรณ์ไฟฟ้า', 'หลอดไฟ สายไฟ และอุปกรณ์ไฟฟ้าทั่วไป'],
  ['วัสดุทำความสะอาด', 'น้ำยาและอุปกรณ์ทำความสะอาด'],
  ['อุปกรณ์คอมพิวเตอร์', 'อุปกรณ์ต่อพ่วงและวัสดุสิ้นเปลืองคอมพิวเตอร์'],
  ['วัสดุซ่อมบำรุง', 'อะไหล่และวัสดุสำหรับงานซ่อมบำรุงอาคาร'],
];

const MATERIALS: MaterialSpec[] = [
  ['OFF-001', 'กระดาษ A4 80 แกรม', 0, 'รีม', 20, 3, 115, 'normal'],
  ['OFF-002', 'ปากกาลูกลื่น สีน้ำเงิน', 0, 'ด้าม', 50, 5, 6, 'normal'],
  ['OFF-003', 'แฟ้มเอกสาร 2 ห่วง', 0, 'เล่ม', 15, 1, 45, 'low'],
  ['OFF-004', 'ลวดเย็บกระดาษ No.10', 0, 'กล่อง', 10, 1, 12, 'normal'],
  ['OFF-005', 'กระดาษโน้ต Post-it', 0, 'แพ็ก', 10, 1, 35, 'out'],
  ['OFF-006', 'ซองเอกสารสีน้ำตาล A4', 0, 'ซอง', 100, 6, 2, 'normal'],
  ['OFF-007', 'เทปใส 1 นิ้ว', 0, 'ม้วน', 12, 1, 18, 'normal'],
  ['OFF-008', 'ตรายางวันที่', 0, 'อัน', 2, 0, 250, 'unused'],
  ['ELE-001', 'หลอด LED 18W', 1, 'หลอด', 10, 1, 89, 'normal'],
  ['ELE-002', 'ปลั๊กพ่วง 4 ช่อง 3 เมตร', 1, 'อัน', 5, 0.3, 350, 'low'],
  ['ELE-003', 'ถ่าน AA', 1, 'แพ็ก', 10, 1, 60, 'normal'],
  ['ELE-004', 'สายไฟ VAF 2x1.5', 1, 'ม้วน', 2, 0, 1450, 'unused'],
  ['ELE-005', 'เบรกเกอร์ 20A', 1, 'ตัว', 3, 0.1, 280, 'inactive'],
  ['CLN-001', 'น้ำยาล้างจาน 3.6 ลิตร', 2, 'แกลลอน', 5, 0.5, 145, 'normal'],
  ['CLN-002', 'น้ำยาถูพื้น 5 ลิตร', 2, 'แกลลอน', 4, 0.4, 189, 'normal'],
  ['CLN-003', 'ถุงขยะดำ 30x40', 2, 'แพ็ก', 20, 2, 55, 'out'],
  ['CLN-004', 'กระดาษชำระม้วนใหญ่', 2, 'ม้วน', 24, 3, 95, 'normal'],
  ['CLN-005', 'ไม้ถูพื้นพร้อมผ้า', 2, 'ชุด', 3, 0.1, 220, 'low'],
  ['CLN-006', 'ผ้าไมโครไฟเบอร์', 2, 'ผืน', 10, 0, 39, 'unused'],
  ['COM-001', 'เมาส์ USB', 3, 'ตัว', 5, 0.3, 190, 'normal'],
  ['COM-002', 'คีย์บอร์ด USB', 3, 'ตัว', 3, 0.2, 350, 'normal'],
  ['COM-003', 'หมึกพิมพ์ HP 85A', 3, 'ตลับ', 4, 0.5, 1890, 'low'],
  ['COM-004', 'แฟลชไดร์ฟ 64GB', 3, 'อัน', 5, 0.2, 229, 'normal'],
  ['COM-005', 'สาย LAN CAT6 5 เมตร', 3, 'เส้น', 5, 0, 120, 'unused'],
  ['COM-006', 'เว็บแคม HD', 3, 'ตัว', 2, 0.05, 890, 'inactive'],
  ['MNT-001', 'สีน้ำอะคริลิก สีขาว', 4, 'แกลลอน', 3, 0.2, 890, 'normal'],
  ['MNT-002', 'ซิลิโคนยาแนว', 4, 'หลอด', 6, 0.4, 85, 'normal'],
  ['MNT-003', 'ก๊อกน้ำอ่างล้างมือ', 4, 'ตัว', 2, 0.1, 450, 'out'],
  ['MNT-004', 'กุญแจลูกบิด', 4, 'ชุด', 3, 0, 320, 'unused'],
  ['MNT-005', 'เทปพันเกลียว', 4, 'ม้วน', 10, 0.5, 15, 'normal'],
];

const LOCATIONS = ['A-01-01', 'A-01-02', 'A-02-01', 'B-01-01', 'B-02-03', 'C-01-01', null];
const SIM_DAYS = 180;

export function createSeedData(now: Date = new Date()): MockData {
  const rand = mulberry32(20260928);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  let idSeq = 0;
  const id = (prefix: string) => `${prefix}-${(++idSeq).toString(36).padStart(6, '0')}`;
  const at = (daysBack: number, hour = 9) =>
    new Date(now.getTime() - daysBack * DAY_MS - (now.getTime() % DAY_MS) + (hour - 7) * 3_600_000);
  const created = at(SIM_DAYS + 1).toISOString();

  const users: UserRow[] = [
    ['admin@example.com', 'สมชาย ใจดี', 'ADMIN', true],
    ['staff@example.com', 'สมหญิง รักงาน', 'STAFF', true],
    ['user@example.com', 'วิชัย ขยันเบิก', 'USER', true],
    ['user2@example.com', 'มานี มีสุข', 'USER', true],
    ['former@example.com', 'ประเสริฐ ลาออกแล้ว', 'USER', false],
  ].map(([email, fullName, role, isActive]) => ({
    id: `user-${String(email).split('@')[0]}`,
    email: email as string,
    password: MOCK_PASSWORD,
    fullName: fullName as string,
    role: role as UserRow['role'],
    isActive: isActive as boolean,
    createdAt: created,
    updatedAt: created,
  }));
  const [admin, staff, ...requesters] = users;
  const withdrawers = [staff, requesters[0], requesters[1], requesters[0]];

  const categories: CategoryRow[] = CATEGORIES.map(([name, description]) => ({
    id: id('cat'),
    name,
    description,
    createdAt: created,
    updatedAt: created,
  }));

  const specs = MATERIALS.map(([code, name, cat, unit, minStock, avgDaily, price, profile]) => ({
    row: {
      id: id('mat'),
      code,
      name,
      categoryId: categories[cat].id,
      unit,
      currentQuantity: 0,
      minStock,
      location: pick(LOCATIONS),
      status: 'ACTIVE' as MaterialStatus,
      createdAt: created,
      updatedAt: created,
    } satisfies MaterialRow,
    avgDaily,
    price,
    profile,
  }));

  const transactions: TransactionRow[] = [];
  const counters: Record<string, number> = {};
  const record = (
    type: TransactionRow['type'],
    when: Date,
    by: UserRow,
    items: Omit<TransactionItemRow, 'id'>[],
    note: string | null = null,
    reversalOfId: string | null = null,
  ): TransactionRow => {
    const day = bangkokDate(when).replaceAll('-', '');
    counters[day] = (counters[day] ?? 0) + 1;
    for (const item of items) {
      const m = specs.find((s) => s.row.id === item.materialId)!.row;
      m.currentQuantity += type === 'IN' ? item.quantity : -item.quantity;
    }
    const txn: TransactionRow = {
      id: id('txn'),
      type,
      referenceNo: `TXN-${day}-${String(counters[day]).padStart(3, '0')}`,
      createdById: by.id,
      note,
      reversalOfId,
      createdAt: when.toISOString(),
      items: items.map((i) => ({ ...i, id: id('item') })),
    };
    transactions.push(txn);
    return txn;
  };
  const priced = (s: (typeof specs)[number], quantity: number) => ({
    materialId: s.row.id,
    quantity,
    unitPrice: (s.price * (0.95 + rand() * 0.1)).toFixed(2),
  });

  // Opening balance: one big receipt for everything.
  record(
    'IN',
    at(SIM_DAYS, 8),
    admin,
    specs.map((s) => priced(s, Math.max(s.row.minStock * 2, Math.ceil(s.avgDaily * 45)) + 5)),
    'ยอดยกมาเริ่มต้นระบบ',
  );

  const outs: TransactionRow[] = [];
  for (let daysBack = SIM_DAYS - 1; daysBack >= 0; daysBack--) {
    const weekday = at(daysBack).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;

    const usable = specs.filter(
      (s) =>
        s.avgDaily > 0 &&
        s.row.currentQuantity > 0 &&
        !(s.profile === 'inactive' && daysBack < 90),
    );
    const hours = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => 8 + Math.floor(rand() * 9))
      .sort((a, b) => a - b)
      .filter((h) => at(daysBack, h) <= now);
    for (const hour of hours) {
      const chosen = new Set<(typeof specs)[number]>();
      const lines = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < lines && usable.length; i++) chosen.add(pick(usable));
      const items = [...chosen]
        .map((s) => ({
          materialId: s.row.id,
          quantity: Math.min(s.row.currentQuantity, Math.max(1, Math.round(s.avgDaily * (1 + rand() * 3)))),
          unitPrice: null,
        }))
        .filter((i) => i.quantity > 0);
      if (items.length) outs.push(record('OUT', at(daysBack, hour), pick(withdrawers), items));
    }

    // Weekly restock on Mondays, except where the profile says the shelf should run dry.
    if (weekday === 1 && at(daysBack, 10) <= now) {
      const restock = specs.filter(
        (s) =>
          s.avgDaily > 0 &&
          s.row.currentQuantity <= s.row.minStock * 1.5 &&
          !(s.profile === 'low' && daysBack < 40) &&
          !(s.profile === 'out' && daysBack < 60) &&
          !(s.profile === 'inactive' && daysBack < 90),
      );
      if (restock.length) {
        record(
          'IN',
          at(daysBack, 10),
          staff,
          restock.map((s) => priced(s, Math.ceil(s.avgDaily * 30) + s.row.minStock)),
          'เติมสต็อกประจำสัปดาห์',
        );
      }
    }
  }

  // Two withdrawals entered by mistake and reversed by the admin the same day.
  for (const original of [outs[40], outs[outs.length - 15]].filter(Boolean)) {
    record(
      'IN',
      new Date(Date.parse(original.createdAt) + 3_600_000),
      admin,
      original.items.map(({ materialId, quantity }) => ({ materialId, quantity, unitPrice: null })),
      `ยกเลิก ${original.referenceNo}: บันทึกจำนวนผิด`,
      original.id,
    );
  }

  for (const s of specs) if (s.profile === 'inactive') s.row.status = 'INACTIVE';

  transactions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    users,
    categories,
    materials: specs.map((s) => s.row),
    transactions,
    counters,
  };
}
