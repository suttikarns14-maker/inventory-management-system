import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { depts, loginAs, seedBasics, SIG, stockOf } from './helpers.js';

// D17: a withdrawal is a signed request; STAFF/ADMIN other than the requester approve and sign it.

let fx: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => {
  fx = await seedBasics();
});

const REQ = '/api/v1/inventory/requests';
const request = (materialId: string, quantity: number, extra: object = {}) => ({
  ...depts,
  signature: SIG,
  items: [{ materialId, quantity }],
  ...extra,
});
const approval = (materialId: string, quantity: number, extra: object = {}) => ({
  signature: SIG,
  items: [{ materialId, quantity, ...extra }],
});

describe('withdrawal requests: create, read, cancel', () => {
  it('creates a pending request without touching stock', async () => {
    const user = await loginAs('user');
    const res = await user.post(REQ).send(request(fx.paper.id, 5));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'PENDING', requesterName: 'ผู้ใช้ user', transaction: null });
    expect(res.body.data.requestNo).toMatch(/^REQ-\d{8}-001$/);
    expect(res.body.data.items[0]).toMatchObject({ quantity: 5, approvedQuantity: null, material: { code: 'OFF-001' } });
    expect(res.body.data).not.toHaveProperty('requesterSignature');
    expect(await stockOf(fx.paper.id)).toBe(20);
  });

  it('requires a png signature', async () => {
    const user = await loginAs('user');
    for (const signature of [undefined, 'abc', SIG + 'A'.repeat(200_000)]) {
      const res = await user.post(REQ).send(request(fx.paper.id, 1, { signature }));
      expect(res.status).toBe(400);
      expect(res.body.error.details[0].field).toBe('signature');
    }
  });

  it('rejects quantity above stock at request time', async () => {
    const user = await loginAs('user');
    const res = await user.post(REQ).send(request(fx.pens.id, 4));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('USER sees only own requests; others get 404 by id', async () => {
    const user = await loginAs('user');
    const mine = (await user.post(REQ).send(request(fx.paper.id, 1))).body.data;
    const user2 = await loginAs('user2');
    expect((await user2.get(`${REQ}/${mine.id}`)).status).toBe(404);
    expect((await user2.get(REQ)).body.meta.total).toBe(0);
    expect((await user.get(REQ)).body.meta.total).toBe(1);
    expect((await (await loginAs('staff')).get(`${REQ}?status=PENDING`)).body.meta.total).toBe(1);
  });

  it('lets the requester cancel a pending request once; nobody else can', async () => {
    const user = await loginAs('user');
    const mine = (await user.post(REQ).send(request(fx.paper.id, 1))).body.data;
    expect((await (await loginAs('staff')).post(`${REQ}/${mine.id}/cancel`)).status).toBe(404);
    const cancelled = await user.post(`${REQ}/${mine.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    const again = await user.post(`${REQ}/${mine.id}/cancel`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('REQUEST_NOT_PENDING');
  });

  it('refuses a direct OUT transaction', async () => {
    const admin = await loginAs('admin');
    const res = await admin
      .post('/api/v1/inventory/transactions')
      .send({ type: 'OUT', ...depts, items: [{ materialId: fx.paper.id, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(await stockOf(fx.paper.id)).toBe(20);
  });
});

describe('withdrawal requests: approve, reject', () => {
  const pending = async (quantity = 5, materialId = fx.paper.id) =>
    (await (await loginAs('user')).post(REQ).send(request(materialId, quantity))).body.data as { id: string };

  it('approval deducts stock and links the transaction', async () => {
    const req = await pending(5);
    const staff = await loginAs('staff');
    const res = await staff.post(`${REQ}/${req.id}/approve`).send(approval(fx.paper.id, 5));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'APPROVED', decidedBy: { fullName: 'ผู้ใช้ staff' } });
    expect(res.body.data.transaction.referenceNo).toMatch(/^TXN-/);
    expect(await stockOf(fx.paper.id)).toBe(15);
    const history = (await staff.get('/api/v1/inventory/history?type=OUT')).body.data;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ requesterName: 'ผู้ใช้ user', requester: { fullName: 'ผู้ใช้ user' } });
  });

  it('lets the approver reduce the quantity', async () => {
    const req = await pending(5);
    const res = await (await loginAs('staff')).post(`${REQ}/${req.id}/approve`).send(approval(fx.paper.id, 3));
    expect(res.body.data.items[0]).toMatchObject({ quantity: 5, approvedQuantity: 3 });
    expect(await stockOf(fx.paper.id)).toBe(17);
  });

  it('refuses an approval of nothing, more than requested, or other materials', async () => {
    const req = await pending(5);
    const staff = await loginAs('staff');
    for (const body of [approval(fx.paper.id, 0), approval(fx.paper.id, 6), approval(fx.pens.id, 1), { signature: SIG, items: [] }]) {
      expect((await staff.post(`${REQ}/${req.id}/approve`).send(body)).status).toBe(400);
    }
    expect((await staff.post(`${REQ}/${req.id}/approve`).send({ items: approval(fx.paper.id, 1).items })).status).toBe(400);
    expect(await stockOf(fx.paper.id)).toBe(20);
    expect((await staff.get(`${REQ}/${req.id}`)).body.data.status).toBe('PENDING');
  });

  it('forbids approving your own request, and USER approving at all', async () => {
    const staff = await loginAs('staff');
    const own = (await staff.post(REQ).send(request(fx.paper.id, 1, { requesterName: 'คนนอก' }))).body.data;
    const self = await staff.post(`${REQ}/${own.id}/approve`).send(approval(fx.paper.id, 1));
    expect(self.status).toBe(403);
    expect((await staff.post(`${REQ}/${own.id}/reject`).send({ reason: 'x' })).status).toBe(403);
    expect((await (await loginAs('admin')).post(`${REQ}/${own.id}/approve`).send(approval(fx.paper.id, 1))).status).toBe(200);

    const req = await pending(1);
    expect((await (await loginAs('user2')).post(`${REQ}/${req.id}/approve`).send(approval(fx.paper.id, 1))).status).toBe(403);
  });

  it('lets only one of two simultaneous approvals win', async () => {
    const req = await pending(5);
    const [staff, admin] = await Promise.all([loginAs('staff'), loginAs('admin')]);
    const results = await Promise.all([
      staff.post(`${REQ}/${req.id}/approve`).send(approval(fx.paper.id, 5)),
      admin.post(`${REQ}/${req.id}/approve`).send(approval(fx.paper.id, 5)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await stockOf(fx.paper.id)).toBe(15);
    expect(await prisma.stockTransaction.count()).toBe(1);
  });

  it('keeps a request pending when the stock ran out before approval', async () => {
    const a = await pending(15);
    const b = await pending(15);
    const staff = await loginAs('staff');
    expect((await staff.post(`${REQ}/${a.id}/approve`).send(approval(fx.paper.id, 15))).status).toBe(200);
    const late = await staff.post(`${REQ}/${b.id}/approve`).send(approval(fx.paper.id, 15));
    expect(late.status).toBe(400);
    expect(late.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await staff.get(`${REQ}/${b.id}`)).body.data).toMatchObject({ status: 'PENDING', decidedBy: null });
    expect(await stockOf(fx.paper.id)).toBe(5);
  });

  it('SERIAL: the approver picks units and their count must match', async () => {
    const ram = await prisma.material.create({
      data: { code: 'HW-001', name: 'RAM', unit: 'ชิ้น', categoryId: fx.category.id, trackingType: 'SERIAL' },
    });
    const staff = await loginAs('staff');
    await staff.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [{ materialId: ram.id, serialNumbers: ['A', 'B', 'C'] }] });
    const [a, b] = await prisma.materialUnit.findMany({ where: { materialId: ram.id }, orderBy: { serialNumber: 'asc' } });
    const req = await pending(2, ram.id);
    const short = await staff.post(`${REQ}/${req.id}/approve`).send(approval(ram.id, 2, { units: [{ unitId: a!.id }] }));
    expect(short.status).toBe(400);
    const ok = await staff
      .post(`${REQ}/${req.id}/approve`)
      .send(approval(ram.id, 2, { units: [{ unitId: a!.id, remark: 'PC-01' }, { unitId: b!.id }] }));
    expect(ok.status).toBe(200);
    expect(await stockOf(ram.id)).toBe(1);
    expect((await prisma.materialUnit.findUniqueOrThrow({ where: { id: a!.id } })).status).toBe('ISSUED');
  });

  it('needs a reason to reject, and a rejected request cannot be approved', async () => {
    const req = await pending(1);
    const staff = await loginAs('staff');
    expect((await staff.post(`${REQ}/${req.id}/reject`).send({})).status).toBe(400);
    const rejected = await staff.post(`${REQ}/${req.id}/reject`).send({ reason: 'ของสำรองไว้ใช้งานด่วน' });
    expect(rejected.body.data).toMatchObject({ status: 'REJECTED', rejectReason: 'ของสำรองไว้ใช้งานด่วน' });
    const late = await staff.post(`${REQ}/${req.id}/approve`).send(approval(fx.paper.id, 1));
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('REQUEST_NOT_PENDING');
  });
});
