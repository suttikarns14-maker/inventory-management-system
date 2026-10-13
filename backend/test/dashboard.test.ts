import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { loginAs, seedBasics } from './helpers.js';

let fx: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => {
  fx = await seedBasics();
});

const out = (materialId: string, quantity: number) => ({ type: 'OUT', items: [{ materialId, quantity }] });

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
    });
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
