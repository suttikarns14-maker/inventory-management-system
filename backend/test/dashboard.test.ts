import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { loginAs, out, seedBasics } from './helpers.js';

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
});
