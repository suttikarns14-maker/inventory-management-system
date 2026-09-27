import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { loginAs, seedBasics, stockOf } from './helpers.js';

let fx: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => {
  fx = await seedBasics();
});

const out = (materialId: string, quantity: number) => ({ type: 'OUT', items: [{ materialId, quantity }] });

describe('stock transactions (spec §5)', () => {
  it('withdraws, returns the API contract shape and a daily reference number', async () => {
    const agent = await loginAs('user');
    const res = await agent.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 4));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: 'OUT',
      referenceNo: expect.stringMatching(/^TXN-\d{8}-001$/),
      createdBy: { fullName: 'ผู้ใช้ user' },
      reversalOf: null,
      reversedBy: null,
      items: [{ quantity: 4, unitPrice: null, material: { code: 'OFF-001', unit: 'รีม' } }],
    });
    expect(await stockOf(fx.paper.id)).toBe(16);
  });

  it('stores unitPrice as a decimal string for IN only', async () => {
    const agent = await loginAs('staff');
    const res = await agent
      .post('/api/v1/inventory/transactions')
      .send({ type: 'IN', items: [{ materialId: fx.pens.id, quantity: 10, unitPrice: 6.5 }] });
    expect(res.body.data.items[0].unitPrice).toBe('6.5');
    expect(await stockOf(fx.pens.id)).toBe(13);
  });

  it('is all-or-nothing: one short line rolls back every line', async () => {
    const agent = await loginAs('staff');
    const res = await agent.post('/api/v1/inventory/transactions').send({
      type: 'OUT',
      items: [
        { materialId: fx.paper.id, quantity: 1 },
        { materialId: fx.pens.id, quantity: 4 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.message).toContain('คงเหลือ 3 ด้าม');
    expect([await stockOf(fx.paper.id), await stockOf(fx.pens.id)]).toEqual([20, 3]);
    expect(await prisma.stockTransaction.count()).toBe(0);
  });

  it('never oversells under concurrent withdrawals', async () => {
    const agents = await Promise.all([loginAs('user'), loginAs('user2'), loginAs('staff')]);
    // 12 simultaneous requests for 1 pen each, but only 3 pens in stock.
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => agents[i % 3]!.post('/api/v1/inventory/transactions').send(out(fx.pens.id, 1))),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(3);
    expect(statuses.filter((s) => s === 400)).toHaveLength(9);
    expect(await stockOf(fx.pens.id)).toBe(0);
    const refs = results.filter((r) => r.status === 201).map((r) => r.body.data.referenceNo);
    expect(new Set(refs).size).toBe(3);
  });

  it('keeps reference numbers unique under concurrent receipts', async () => {
    const agent = await loginAs('staff');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        agent.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [{ materialId: fx.paper.id, quantity: 1 }] }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.data.referenceNo)).size).toBe(8);
    expect(await stockOf(fx.paper.id)).toBe(28);
  });

  it('validates quantities and duplicate lines', async () => {
    const agent = await loginAs('staff');
    const negative = await agent.post('/api/v1/inventory/transactions').send(out(fx.paper.id, -5));
    expect(negative.body.error.code).toBe('VALIDATION_ERROR');
    expect(negative.body.error.details[0].field).toBe('items.0.quantity');
    const fraction = await agent.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 1.5));
    expect(fraction.body.error.code).toBe('VALIDATION_ERROR');
    const dup = await agent.post('/api/v1/inventory/transactions').send({
      type: 'IN',
      items: [
        { materialId: fx.paper.id, quantity: 1 },
        { materialId: fx.paper.id, quantity: 1 },
      ],
    });
    expect(dup.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses inactive materials', async () => {
    await prisma.material.update({ where: { id: fx.paper.id }, data: { status: 'INACTIVE' } });
    const agent = await loginAs('staff');
    const res = await agent.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 1));
    expect(res.body.error.code).toBe('MATERIAL_INACTIVE');
  });

  it('has a database CHECK as the last line of defence against negative stock', async () => {
    await expect(
      prisma.material.update({ where: { id: fx.pens.id }, data: { currentQuantity: -1 } }),
    ).rejects.toThrow();
  });
});

describe('reversal (spec §5.3)', () => {
  it('restores stock, links both records, and can only happen once', async () => {
    const user = await loginAs('user');
    const admin = await loginAs('admin');
    const txn = (await user.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 5))).body.data;
    const rev = await admin.post(`/api/v1/inventory/transactions/${txn.id}/reverse`).send({ note: 'บันทึกผิด' });
    expect(rev.status).toBe(201);
    expect(rev.body.data).toMatchObject({ type: 'IN', reversalOf: { id: txn.id } });
    expect(rev.body.data.note).toContain(txn.referenceNo);
    expect(await stockOf(fx.paper.id)).toBe(20);
    const again = await admin.post(`/api/v1/inventory/transactions/${txn.id}/reverse`).send({ note: 'ซ้ำ' });
    expect(again.body.error.code).toBe('ALREADY_REVERSED');
    const ofReversal = await admin.post(`/api/v1/inventory/transactions/${rev.body.data.id}/reverse`).send({ note: 'x' });
    expect(ofReversal.body.error.code).toBe('ALREADY_REVERSED');
  });

  it('lets only one of two simultaneous reversals win', async () => {
    const admin = await loginAs('admin');
    const txn = (await admin.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 2))).body.data;
    const results = await Promise.all([
      admin.post(`/api/v1/inventory/transactions/${txn.id}/reverse`).send({ note: 'a' }),
      admin.post(`/api/v1/inventory/transactions/${txn.id}/reverse`).send({ note: 'b' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(fx.paper.id)).toBe(20);
  });

  it('refuses to reverse a receipt whose stock was already used', async () => {
    const admin = await loginAs('admin');
    const receipt = (
      await admin.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [{ materialId: fx.pens.id, quantity: 5 }] })
    ).body.data;
    await admin.post('/api/v1/inventory/transactions').send(out(fx.pens.id, 7));
    const res = await admin.post(`/api/v1/inventory/transactions/${receipt.id}/reverse`).send({ note: 'x' });
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });
});

describe('history', () => {
  it('shows USER only their own transactions, and hides others by id', async () => {
    const staff = await loginAs('staff');
    const user = await loginAs('user');
    const theirs = (await staff.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 1))).body.data;
    await user.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 1));
    const mine = await user.get('/api/v1/inventory/history?createdById=' + theirs.createdBy.id);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].createdBy.fullName).toBe('ผู้ใช้ user');
    expect((await user.get(`/api/v1/inventory/transactions/${theirs.id}`)).status).toBe(404);
    expect((await staff.get('/api/v1/inventory/history')).body.meta.total).toBe(2);
  });

  it('filters by Bangkok calendar day', async () => {
    const staff = await loginAs('staff');
    await staff.post('/api/v1/inventory/transactions').send(out(fx.paper.id, 1));
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    expect((await staff.get(`/api/v1/inventory/history?from=${today}&to=${today}`)).body.data).toHaveLength(1);
    expect((await staff.get('/api/v1/inventory/history?to=2000-01-01')).body.data).toHaveLength(0);
  });
});
