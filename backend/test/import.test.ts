import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createUser, loginAs, resetDb } from './helpers.js';

// A small workbook in the IT_Inventory.xlsx layout (spec v2.2 §5). The real file holds
// organisation data and stays out of git; it is checked separately against the import report.

const HEADERS = [
  'ลำดับ', 'SKU', 'ปีงบประมาณ', 'ชื่อวัสดุ', 'ยี่ห้อ', 'รุ่น', 'รหัสสินค้า(S/N)', 'ประเภทอุปกรณ์', 'สถานะการเบิก',
  'ผู้เบิก', 'หน่วยงานที่เบิก', 'วัน/เดือน/ปี (ค.ศ.) ที่เบิก', 'หน่วยงานที่ใช้', 'อาคาร', 'ชั้น', 'ระบบงานที่ใช้',
  'ราคาต่อหน่วย', 'ชื่อโครงการ (TOR)', 'จำนวนที่ซื้อในรายการนี้', 'รูป', 'สถานที่เก็บของ', 'หมายเหตุ',
];
type Row = Partial<Record<'fy' | 'name' | 'brand' | 'model' | 'sn' | 'type' | 'status' | 'by' | 'reqDept' | 'date' | 'useDept' | 'building' | 'floor' | 'purpose' | 'price' | 'project' | 'storage' | 'remark', string | number | Date>>;

const HW = 'อุปกรณ์หลัก (Hardware)';
const CON = 'วัสดุสิ้นเปลือง / อุปกรณ์ประกอบ';
const STORE = 'ห้องเก็บของ IT ชั้น 3';

async function workbook(rows: Row[], withDropdown = true): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('รายการ');
  ws.addRow(HEADERS);
  rows.forEach((r, i) =>
    ws.addRow([
      i + 1, '', r.fy ?? 2568, r.name, r.brand ?? '-', r.model ?? '-', r.sn ?? '', r.type ?? HW, r.status ?? 'ยังไม่เบิก',
      r.by ?? '', r.reqDept ?? '', r.date ?? '', r.useDept ?? '', r.building ?? '', r.floor ?? '', r.purpose ?? '',
      r.price ?? 100, r.project ?? 'วัสดุปลายเปิดปี 2568', '', '', r.storage ?? STORE, r.remark ?? '',
    ]),
  );
  if (withDropdown) {
    const dd = wb.addWorksheet('Dropdowndata');
    const cols = [
      ['ปีงบประมาณ', '2567', '2568'],
      ['ประเภทอุปกรณ์', HW, CON],
      ['สถานะการเบิก', 'ยังไม่เบิก', 'เบิกแล้ว'],
      ['หน่วยงานหลัก', 'ฝ่ายเทคโนโลยีสารสนเทศ', 'ภาควิชาเวชศาสตร์ฉุกเฉิน'],
      ['หน่วยงานย่อย', 'งานธุรการ', 'ฝ่ายเทคโนโลยีสารสนเทศ', 'งานธุรการ'],
      ['อาคาร', 'อาคารพัชรกิติยาภา'],
      ['ชั้น', '3', 'G'],
      ['สถานที่เก็บของ', STORE],
    ];
    cols.forEach((values, i) => values.forEach((v, r) => (dd.getRow(r + 1).getCell(i + 1).value = v)));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const upload = (agent: Awaited<ReturnType<typeof loginAs>>, path: string, file: Buffer) =>
  agent.post(path).set('Content-Type', 'application/octet-stream').send(file);

const IT = 'ฝ่ายเทคโนโลยีสารสนเทศ';
const sample: Row[] = [
  // RAM: 3 real serials, one row without -> placeholder from the nearest row (D15)
  { name: 'RAM 16 GB', brand: 'Apacer', model: 'AS16', sn: 'R1', price: 2100 },
  { name: 'RAM 16 GB', brand: 'Apacer', model: 'AS16', sn: 'R2', status: 'เบิกแล้ว', by: 'สมชาย', reqDept: IT, useDept: 'ER', date: new Date('2025-01-14'), building: 'อาคารพัชรกิติยาภา', floor: '3', purpose: 'Notebook นศพ', remark: 'VJRNB0300' },
  { name: 'RAM  16 GB', brand: 'Apacer', model: 'AS16', sn: '-' },
  { name: 'RAM 16 GB', brand: 'Apacer', model: 'AS16', sn: 'R3', fy: 2567, project: 'วัสดุปลายเปิดปี 2567' },
  // Cable ties: repeated product barcode is not a serial; proposed SERIAL, the admin picks QUANTITY
  { name: 'Cable Tie', brand: 'UGREEN', type: CON, sn: '8859596018072', price: 110 },
  { name: 'Cable Tie', brand: 'UGREEN', type: CON, sn: '8859596018072', status: 'เบิกแล้ว', by: 'สมชาย', reqDept: IT, useDept: 'ER', date: new Date('2025-01-14'), building: 'อาคารพัชรกิติยาภา', floor: '3', purpose: 'Notebook นศพ', remark: 'ใช้รัดสาย' },
  { name: 'Cable Tie', brand: 'UGREEN', type: CON, sn: '8859596018072', status: 'เบิกแล้ว', by: '', reqDept: 'ER', useDept: IT, date: '' },
];

beforeEach(async () => {
  await resetDb();
  await createUser('admin', 'ADMIN');
  await createUser('staff', 'STAFF');
  // The seed's sample category must disappear on the first import.
  await prisma.category.create({ data: { name: 'วัสดุสำนักงาน' } });
});

describe('initial import (spec v2.2 §5.1-5.3)', () => {
  it('previews, then imports materials, serials, receipts and past withdrawals', async () => {
    const admin = await loginAs('admin');
    const preview = await upload(admin, '/api/v1/import/initial/preview', await workbook(sample));
    expect(preview.status).toBe(200);
    const p = preview.body.data;
    expect(p.summary).toEqual({ rows: 7, materials: 2, inStockUnits: 4, withdrawnUnits: 3, receipts: 2, withdrawals: 2 });
    expect(p.materials.map((m: { code: string; proposed: string; validSerials: number }) => [m.code, m.proposed, m.validSerials])).toEqual([
      ['HW-001', 'SERIAL', 3],
      ['CON-001', 'SERIAL', 0],
    ]);
    // "ER" is not in Dropdowndata: listed for the admin to map (decision D14).
    expect(p.unmatched.usingDepartments).toEqual([{ value: 'ER', rows: 2 }]);
    expect(p.unmatched.requestingDepartments).toEqual([{ value: 'ER', rows: 1 }]);
    expect(p.issues.map((i: { message: string }) => i.message)).toEqual(
      expect.arrayContaining([expect.stringContaining('ไม่มีวันที่เบิก'), expect.stringContaining('ไม่มีชื่อผู้เบิก')]),
    );

    const commit = await admin.post('/api/v1/import/initial/commit').send({
      importId: p.importId,
      // Admin maps "ER" for the requesting department to the emergency department.
      mapping: { requestingDepartments: { ER: 'ภาควิชาเวชศาสตร์ฉุกเฉิน' } },
      tracking: { [p.materials[1].key]: 'QUANTITY' },
    });
    expect(commit.status).toBe(201);
    expect(commit.body.data).toMatchObject({ materials: 2, serialMaterials: 1, units: 4, tempSerials: 1, receipts: 2, withdrawals: 2, inStock: 4 });

    // Sample category replaced by the types from Dropdowndata.
    expect((await prisma.category.findMany({ orderBy: { name: 'asc' } })).map((c) => c.name)).toEqual([HW, CON].sort());
    expect(await prisma.department.count()).toBe(3); // 2 main + 1 sub (the duplicate name is merged)

    const ram = await prisma.material.findUniqueOrThrow({ where: { code: 'HW-001' }, include: { units: { orderBy: { serialNumber: 'asc' } } } });
    expect(ram).toMatchObject({ name: 'RAM 16 GB', unit: 'ชิ้น', minStock: 5, trackingType: 'SERIAL', currentQuantity: 3 });
    expect(ram.units.map((u) => [u.serialNumber, u.status, u.isTempSerial])).toEqual([
      ['R1', 'IN_STOCK', false],
      ['R2', 'ISSUED', false],
      ['R2-TEMP-SN-01', 'IN_STOCK', true],
      ['R3', 'IN_STOCK', false],
    ]);
    const ties = await prisma.material.findUniqueOrThrow({ where: { code: 'CON-001' } });
    expect(ties).toMatchObject({ trackingType: 'QUANTITY', currentQuantity: 1 });

    const staff = await loginAs('staff');
    const history = (await staff.get('/api/v1/inventory/history?limit=10')).body.data;
    const jan = history.find((t: { referenceNo: string }) => t.referenceNo === 'TXN-20250114-001');
    expect(jan).toMatchObject({
      type: 'OUT',
      requesterName: 'สมชาย',
      requestingDepartment: { name: IT },
      usingDepartment: null, // "ER" as a using department was not mapped -> kept as text
      building: { name: 'อาคารพัชรกิติยาภา' },
      floor: '3',
      purpose: 'Notebook นศพ',
    });
    expect(jan.note).toContain('หน่วยงานที่ใช้ (เดิม): ER');
    expect(jan.note).toContain('ใช้รัดสาย');
    const ramLine = jan.items.find((i: { material: { code: string } }) => i.material.code === 'HW-001');
    expect(ramLine.units).toEqual([expect.objectContaining({ serialNumber: 'R2', remark: 'VJRNB0300' })]);
    const noName = history.find((t: { requesterName: string }) => t.requesterName === 'ไม่ระบุ');
    expect(noName.requestingDepartment.name).toBe('ภาควิชาเวชศาสตร์ฉุกเฉิน');
    // Receipt dated at the start of fiscal year 2568 = 1 Oct 2024.
    expect(history.some((t: { referenceNo: string; fiscalYear: number }) => t.referenceNo === 'TXN-20241001-001' && t.fiscalYear === 2568)).toBe(true);

    // New transactions continue the imported numbering instead of colliding.
    expect((await prisma.referenceCounter.findUniqueOrThrow({ where: { date: '20250114' } })).lastValue).toBe(1);

    // Only once: the system is no longer empty.
    const again = await upload(admin, '/api/v1/import/initial/preview', await workbook(sample));
    expect(again.status).toBe(400);
  });

  it('is ADMIN-only and validates the file', async () => {
    const staff = await loginAs('staff');
    expect((await upload(staff, '/api/v1/import/initial/preview', await workbook(sample))).status).toBe(403);
    const admin = await loginAs('admin');
    const noLists = await upload(admin, '/api/v1/import/initial/preview', await workbook(sample, false));
    expect(noLists.body.error.message).toContain('Dropdowndata');
    expect((await upload(admin, '/api/v1/import/initial/preview', Buffer.from('not excel'))).status).toBe(400);
    expect((await admin.post('/api/v1/import/initial/commit').send({ importId: 'nope' })).status).toBe(400);
  });
});

describe('receipt import from the receive page (spec v2.2 §5.4)', () => {
  it('adds stock to existing materials, creates new ones, and refuses known serials', async () => {
    const admin = await loginAs('admin');
    const first = (await upload(admin, '/api/v1/import/initial/preview', await workbook(sample))).body.data;
    await admin.post('/api/v1/import/initial/commit').send({ importId: first.importId });

    const template = await admin.get('/api/v1/import/receipt/template').buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(template.status).toBe(200);
    expect(template.headers['content-disposition']).toContain('receipt-template.xlsx');

    const purchase = await workbook([
      { name: 'RAM 16 GB', brand: 'Apacer', model: 'AS16', sn: 'R9', fy: 2569, project: 'วัสดุปี 2569' },
      { name: 'RAM 16 GB', brand: 'Apacer', model: 'AS16', sn: '', fy: 2569, project: 'วัสดุปี 2569' },
      { name: 'Mouse', brand: 'Logitech', model: 'M90', type: HW, sn: 'M1', fy: 2569, project: 'วัสดุปี 2569' },
    ]);
    const preview = (await upload(admin, '/api/v1/import/receipt/preview', purchase)).body.data;
    expect(preview.summary).toMatchObject({ rows: 3, materials: 2, newMaterials: 1, receipts: 1 });
    expect(preview.materials.find((m: { existing: boolean }) => !m.existing)).toMatchObject({ code: 'HW-002', proposed: 'SERIAL' });
    expect(preview.issues.filter((i: { blocking: boolean }) => i.blocking)).toEqual([]);

    const commit = await admin.post('/api/v1/import/receipt/commit').send({ importId: preview.importId });
    expect(commit.status).toBe(201);
    expect(commit.body.data.transactions).toHaveLength(1);
    const ram = await prisma.material.findUniqueOrThrow({ where: { code: 'HW-001' }, include: { units: true } });
    expect(ram.currentQuantity).toBe(5);
    expect(ram.units.map((u) => u.serialNumber)).toEqual(expect.arrayContaining(['R9', 'R9-TEMP-SN-01']));
    const receipt = await prisma.stockTransaction.findUniqueOrThrow({ where: { id: commit.body.data.transactions[0].id } });
    expect(receipt).toMatchObject({ type: 'IN', fiscalYear: 2569, projectName: 'วัสดุปี 2569' });

    // The same serial again is blocked before anything is written.
    const dup = (await upload(admin, '/api/v1/import/receipt/preview', await workbook([{ name: 'Mouse', brand: 'Logitech', model: 'M90', sn: 'm1' }]))).body.data;
    expect(dup.issues).toEqual([expect.objectContaining({ blocking: true, message: expect.stringContaining('มีอยู่ในระบบแล้ว') })]);
    const blocked = await admin.post('/api/v1/import/receipt/commit').send({ importId: dup.importId });
    expect(blocked.body.error.code).toBe('DUPLICATE_SERIAL');

    // Withdrawn rows do not belong in a receipt file.
    const withdrawn = (await upload(admin, '/api/v1/import/receipt/preview', await workbook([{ name: 'X', sn: 'X1', status: 'เบิกแล้ว' }]))).body.data;
    expect(withdrawn.issues[0]).toMatchObject({ blocking: true });
  });
});
