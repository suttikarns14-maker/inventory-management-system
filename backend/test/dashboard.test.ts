import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { depts, loginAs, out, seedBasics } from './helpers.js';

let fx: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => {
  fx = await seedBasics();
});


describe('dashboard (spec §6)', () => {
  it('ranks withdrawals, ignores reversed ones, and lists never-used materials', async () => {
    const staff = await loginAs('staff');
    const admin = await loginAs('admin');
    const unusedMat = await prisma.material.create({
      data: { code: 'OFF-003', name: 'แฟ้ม', unit: 'เล่ม', minStock: 0, categoryId: fx.category.id, currentQuantity: 9 },
    });
    await staff.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 2));
    await staff.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 3));
    await staff.post('/api/v1/inventory/transactions').send(out(fx.pens.id, 1));
    // A mistaken withdrawal of 2 pens, then reversed: it must not count as usage.
    const mistake = (await staff.post('/api/v1/inventory/transactions').send(out(fx.pens.id, 2))).body.data;
    await admin.post(`/api/v1/inventory/transactions/${mistake.id}/reverse`).send({ note: 'ผิด' });

    const byQty = (await staff.get('/api/v1/dashboard/top-withdrawn')).body.data;
    expect(byQty.map((t: { code: string; totalQuantity: number }) => [t.code, t.totalQuantity])).toEqual([
      ['OFF-001', 5],
      ['OFF-002', 1],
    ]);
    const byCount = (await staff.get('/api/v1/dashboard/top-withdrawn?sortBy=count')).body.data;
    expect(byCount[0]).toMatchObject({ code: 'OFF-001', withdrawalCount: 2 });

    const unused = (await staff.get('/api/v1/dashboard/unused')).body.data;
    expect(unused.map((u: { id: string }) => u.id)).toEqual([unusedMat.id]);
    expect(unused[0].lastOutAt).toBeNull();
    // With a window, recently used materials still don't appear.
    expect((await staff.get('/api/v1/dashboard/unused?days=90')).body.data).toHaveLength(1);

    const summary = (await staff.get('/api/v1/dashboard/summary')).body.data;
    expect(summary).toEqual({
      activeMaterials: 3,
      outOfStockCount: 0,
      neverWithdrawnCount: 1,
      withdrawalsThisMonth: 3,
      reorderCount: 1,
      stockValue: 0,
      unpricedCount: 3,
      valueByCategory: [{ id: fx.category.id, name: 'วัสดุสำนักงาน', value: 0 }],
      // OFF-001 still has the import default min stock of 5
      dataQuality: { tempSerials: 0, defaultMinStock: 1, missingDepartments: 0 },
    });
  });

  it('values stock at the latest non-reversed purchase price, idle stock most valuable first', async () => {
    const admin = await loginAs('admin');
    const receive = (materialId: string, quantity: number, unitPrice: number) =>
      admin.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [{ materialId, quantity, unitPrice }] });
    await receive(fx.paper.id, 10, 100);
    await receive(fx.paper.id, 5, 120); // latest price wins: (20 + 10 + 5) * 120
    const wrong = (await receive(fx.paper.id, 1, 999)).body.data;
    await admin.post(`/api/v1/inventory/transactions/${wrong.id}/reverse`).send({ note: 'ราคาผิด' });

    const idleCheap = await prisma.material.create({
      data: { code: 'OFF-003', name: 'แฟ้ม', unit: 'เล่ม', minStock: 0, categoryId: fx.category.id, currentQuantity: 9 },
    });
    const idleDear = await prisma.material.create({
      data: { code: 'OFF-004', name: 'เครื่องเย็บ', unit: 'อัน', minStock: 0, categoryId: fx.category.id },
    });
    await receive(idleDear.id, 2, 50.5);

    const summary = (await admin.get('/api/v1/dashboard/summary')).body.data;
    expect(summary.stockValue).toBe(35 * 120 + 101);
    expect(summary.unpricedCount).toBe(2); // pens and OFF-003 are in stock with no price

    const unused = (await admin.get('/api/v1/dashboard/unused')).body.data;
    expect(unused.map((u: { id: string; unitPrice: number | null; value: number }) => [u.id, u.unitPrice, u.value]))
      .toEqual([
        [fx.paper.id, 120, 4200],
        [idleDear.id, 50.5, 101],
        [idleCheap.id, null, 0],
        [fx.pens.id, null, 0],
      ]);
  });

  it('suggests reorders, out-of-stock first', async () => {
    const staff = await loginAs('staff');
    await staff.post('/api/v1/inventory/transactions').send(out(fx.pens.id, 3)); // pens -> 0
    const list = (await staff.get('/api/v1/dashboard/reorder-suggestions')).body.data;
    expect(list[0]).toMatchObject({ code: 'OFF-002', currentQuantity: 0, minStock: 10, daysLeft: 0 });
    // minStock 10 + 3/90 per day * 30 days = 11 after rounding up
    expect(list[0].suggestedQty).toBe(11);
    expect(list.map((r: { code: string }) => r.code)).not.toContain('OFF-001');
  });

  it('summarises purchases per fiscal year and project, per unit at its own receipt price', async () => {
    const admin = await loginAs('admin');
    const ram = await prisma.material.create({
      data: { code: 'HW-001', name: 'RAM', unit: 'ชิ้น', minStock: 0, categoryId: fx.category.id, trackingType: 'SERIAL' },
    });
    const receive = (serialNumbers: string[], extra: object) =>
      admin.post('/api/v1/inventory/transactions').send({ type: 'IN', ...extra, items: [{ materialId: ram.id, serialNumbers }] });
    const tor = (await receive(['A1', 'A2', 'A3'], { fiscalYear: 2567, projectName: 'TOR 1' })).body.data;
    await receive(['B1', 'B2'], { fiscalYear: 2568 }); // no price
    const wrong = (await receive(['C1'], { fiscalYear: 2568, projectName: 'ผิด' })).body.data;
    await admin.post(`/api/v1/inventory/transactions/${wrong.id}/reverse`).send({ note: 'ผิด' });
    await receive(['D1'], {}); // no fiscal year: falls in the current one (starts 1 Oct)
    await prisma.stockTransactionItem.updateMany({ where: { transactionId: tor.id }, data: { unitPrice: 100 } });
    const a1 = await prisma.materialUnit.findFirstOrThrow({ where: { serialNumber: 'A1' } });
    await admin.post('/api/v1/inventory/transactions').send({ type: 'OUT', ...depts, requesterName: 'ก', items: [{ materialId: ram.id, units: [{ unitId: a1.id }] }] });

    const now = new Date(Date.now() + 7 * 3_600_000); // Bangkok
    const currentFy = now.getUTCFullYear() + 543 + (now.getUTCMonth() >= 9 ? 1 : 0);
    const rows = (await admin.get('/api/v1/dashboard/procurement')).body.data;
    expect(rows).toEqual([
      { fiscalYear: currentFy, projectName: null, receivedQty: 1, receivedValue: 0, unpricedQty: 1, remainingQty: 1, remainingValue: 0 },
      { fiscalYear: 2568, projectName: null, receivedQty: 2, receivedValue: 0, unpricedQty: 2, remainingQty: 2, remainingValue: 0 },
      { fiscalYear: 2567, projectName: 'TOR 1', receivedQty: 3, receivedValue: 300, unpricedQty: 0, remainingQty: 2, remainingValue: 200 },
    ]);
  });

  it('compares monthly withdrawals with the same month last year', async () => {
    const staff = await loginAs('staff');
    const admin = await loginAs('admin');
    await staff.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 2));
    const old = (await staff.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 3))).body.data;
    await prisma.stockTransaction.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 365 * 86_400_000) } });
    const mistake = (await staff.post('/api/v1/inventory/transactions').send(out(fx.pens.id, 1))).body.data;
    await admin.post(`/api/v1/inventory/transactions/${mistake.id}/reverse`).send({ note: 'ผิด' });

    const months = (await staff.get('/api/v1/dashboard/monthly-withdrawals')).body.data;
    expect(months).toHaveLength(12);
    const thisMonth = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7);
    expect(months.at(-1)).toMatchObject({ month: thisMonth, quantity: 2 });
    // 365 days ago is last year's same month (or the one before, in a leap year): checked by the total.
    expect(months.reduce((s: number, m: { previousYearQuantity: number }) => s + m.previousYearQuantity, 0)).toBe(3);
    expect((await (await loginAs('user')).get('/api/v1/dashboard/monthly-withdrawals')).status).toBe(403);
  });

  it('totals withdrawals per using department within a period', async () => {
    const admin = await loginAs('admin');
    await admin.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [{ materialId: fx.paper.id, quantity: 1, unitPrice: 10 }] });
    await admin.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 2, { requesterName: 'ก' })); // -> sub
    const old = (await admin.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 3, { requesterName: 'ก' }))).body.data;
    await prisma.stockTransaction.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 100 * 86_400_000) } });
    await admin.post('/api/v1/inventory/transactions').send(out(fx.pens.id, 1, { requesterName: 'ก', usingDepartmentId: fx.main.id }));
    const mistake = (await admin.post('/api/v1/inventory/transactions').send(out(fx.pens.id, 2, { requesterName: 'ก' }))).body.data;
    await admin.post(`/api/v1/inventory/transactions/${mistake.id}/reverse`).send({ note: 'ผิด' });

    const all = (await admin.get('/api/v1/dashboard/by-department')).body.data;
    expect(all).toEqual([
      { id: fx.sub.id, name: 'งานธุรการ', withdrawalCount: 2, quantity: 5, value: 50 },
      { id: fx.main.id, name: 'ฝ่ายเทคโนโลยีสารสนเทศ', withdrawalCount: 1, quantity: 1, value: 0 },
    ]);
    const recent = (await admin.get('/api/v1/dashboard/by-department?days=30')).body.data;
    expect(recent[0]).toMatchObject({ id: fx.sub.id, withdrawalCount: 1, quantity: 2, value: 20 });
  });

  it('totals stock per storage location: units where they are, other materials at their own location', async () => {
    const admin = await loginAs('admin');
    const [l1, l2] = await Promise.all(['ห้อง 1', 'ห้อง 2'].map((name) => prisma.storageLocation.create({ data: { name } })));
    await prisma.material.update({ where: { id: fx.paper.id }, data: { storageLocationId: l1.id } });
    await admin.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [{ materialId: fx.paper.id, quantity: 10, unitPrice: 5 }] });
    const ram = await prisma.material.create({
      data: { code: 'HW-001', name: 'RAM', unit: 'ชิ้น', minStock: 0, categoryId: fx.category.id, trackingType: 'SERIAL', storageLocationId: l1.id },
    });
    await admin.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [{ materialId: ram.id, serialNumbers: ['A1', 'A2'], unitPrice: 100 }] });
    await prisma.materialUnit.updateMany({ where: { materialId: ram.id }, data: { storageLocationId: l2.id } });

    const rows = (await admin.get('/api/v1/dashboard/by-location')).body.data;
    expect(rows).toEqual([
      { id: l1.id, name: 'ห้อง 1', materials: 1, quantity: 30, value: 150 },
      { id: l2.id, name: 'ห้อง 2', materials: 1, quantity: 2, value: 200 },
      { id: null, name: null, materials: 1, quantity: 3, value: 0 }, // pens: no location, last
    ]);

    // What is stored there: RAM's own location is ห้อง 1, but its units are in ห้อง 2.
    const brief = (rows: { code: string; quantity: number; value: number }[]) => rows.map((r) => [r.code, r.quantity, r.value]);
    expect(brief((await admin.get(`/api/v1/dashboard/by-location/${l1.id}/materials`)).body.data)).toEqual([['OFF-001', 30, 150]]);
    expect(brief((await admin.get(`/api/v1/dashboard/by-location/${l2.id}/materials`)).body.data)).toEqual([['HW-001', 2, 200]]);
    expect(brief((await admin.get('/api/v1/dashboard/by-location/none/materials')).body.data)).toEqual([['OFF-002', 3, 0]]);
  });

  it('exports the dashboard as an Excel workbook (ADMIN, STAFF)', async () => {
    const staff = await loginAs('staff');
    const res = await staff.get('/api/v1/dashboard/export').buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/dashboard-\d{4}-\d{2}-\d{2}\.xlsx/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'สรุป', 'ควรสั่งซื้อ', 'จัดซื้อตามปีงบ', 'เบิกรายเดือน', 'แยกตามหน่วยงาน', 'แยกตามสถานที่เก็บ', 'ไม่เคยถูกเบิก',
    ]);
    expect(wb.getWorksheet('ควรสั่งซื้อ')!.getCell('A2').value).toBe('OFF-002'); // pens are below min stock
    expect((await (await loginAs('user')).get('/api/v1/dashboard/export')).status).toBe(403);
  });
});
