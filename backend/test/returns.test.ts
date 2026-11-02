import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { depts, loginAs, seedBasics, stockOf, withdraw } from './helpers.js';

// D18: staff record items handed back against an earlier withdrawal; partial and repeated returns allowed.

let fx: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => {
  fx = await seedBasics();
});

const TXN = '/api/v1/inventory/transactions';
const back = (materialId: string, quantity: number, extra: object = {}) => ({
  note: 'ไม่ตรงสเปก',
  items: [{ materialId, quantity, ...extra }],
});
const withdrawPaper = async (quantity: number) =>
  (await withdraw('user', { ...depts, items: [{ materialId: fx.paper.id, quantity }] })).body.data;

describe('returns of QUANTITY materials', () => {
  it('takes back part of a withdrawal and links it to the original', async () => {
    const original = await withdrawPaper(5);
    const staff = await loginAs('staff');
    const res = await staff.post(`${TXN}/${original.id}/return`).send(back(fx.paper.id, 2));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      type: 'IN',
      returnOf: { id: original.id, referenceNo: original.referenceNo },
      requesterName: original.requesterName,
      requester: { id: fx.user.id },
      createdBy: { fullName: 'ผู้ใช้ staff' },
      usingDepartment: { id: depts.usingDepartmentId },
    });
    expect(res.body.data.note).toBe(`คืนจาก ${original.referenceNo}: ไม่ตรงสเปก`);
    expect(res.body.data.items[0]).toMatchObject({ quantity: 2, unitPrice: null });
    expect(await stockOf(fx.paper.id)).toBe(17);

    const after = (await staff.get(`${TXN}/${original.id}`)).body.data;
    expect(after.returns).toEqual([
      { id: res.body.data.id, referenceNo: res.body.data.referenceNo, items: [{ materialId: fx.paper.id, quantity: 2 }] },
    ]);
    const returnable = (await staff.get(`${TXN}/${original.id}/return`)).body.data;
    expect(returnable.lines[0]).toMatchObject({ materialId: fx.paper.id, code: 'OFF-001', issued: 5, returned: 2 });

    // The user sees the return in their own history.
    const mine = (await (await loginAs('user')).get(`${TXN}/${res.body.data.id}`));
    expect(mine.status).toBe(200);
  });

  it('never returns more than was withdrawn in total', async () => {
    const original = await withdrawPaper(5);
    const staff = await loginAs('staff');
    expect((await staff.post(`${TXN}/${original.id}/return`).send(back(fx.paper.id, 2))).status).toBe(201);
    const res = await staff.post(`${TXN}/${original.id}/return`).send(back(fx.paper.id, 4));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('items.0.quantity');
    expect(await stockOf(fx.paper.id)).toBe(17);
  });

  it('rejects a material that is not on the withdrawal', async () => {
    const original = await withdrawPaper(5);
    const res = await (await loginAs('staff')).post(`${TXN}/${original.id}/return`).send(back(fx.pens.id, 1));
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('items.0.materialId');
  });

  it('lets two concurrent returns together stay within the withdrawn quantity', async () => {
    const original = await withdrawPaper(5);
    const [a, b] = await Promise.all([loginAs('staff'), loginAs('admin')]);
    const results = await Promise.all([
      a.post(`${TXN}/${original.id}/return`).send(back(fx.paper.id, 3)),
      b.post(`${TXN}/${original.id}/return`).send(back(fx.paper.id, 3)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await stockOf(fx.paper.id)).toBe(18);
  });

  it('needs a reason, STAFF or ADMIN, and an unreversed withdrawal', async () => {
    const original = await withdrawPaper(5);
    const staff = await loginAs('staff');
    const noReason = await staff.post(`${TXN}/${original.id}/return`).send({ ...back(fx.paper.id, 1), note: '' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.details[0].field).toBe('note');

    expect((await (await loginAs('user')).post(`${TXN}/${original.id}/return`).send(back(fx.paper.id, 1))).status).toBe(403);

    const receipt = (await staff.post(TXN).send({ type: 'IN', items: [{ materialId: fx.paper.id, quantity: 1 }] })).body.data;
    expect((await staff.post(`${TXN}/${receipt.id}/return`).send(back(fx.paper.id, 1))).status).toBe(400);

    const admin = await loginAs('admin');
    const reversal = (await admin.post(`${TXN}/${original.id}/reverse`).send({ note: 'ผิด' })).body.data;
    expect((await staff.post(`${TXN}/${original.id}/return`).send(back(fx.paper.id, 1))).status).toBe(400);
    expect((await staff.post(`${TXN}/${reversal.id}/return`).send(back(fx.paper.id, 1))).status).toBe(400);
  });

  it('blocks reversing a withdrawal that has returns until the return is reversed', async () => {
    const original = await withdrawPaper(5);
    const ret = (await (await loginAs('staff')).post(`${TXN}/${original.id}/return`).send(back(fx.paper.id, 2))).body.data;
    const admin = await loginAs('admin');
    const blocked = await admin.post(`${TXN}/${original.id}/reverse`).send({ note: 'ผิด' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('HAS_RETURNS');

    expect((await admin.post(`${TXN}/${ret.id}/reverse`).send({ note: 'บันทึกผิด' })).status).toBe(201);
    expect(await stockOf(fx.paper.id)).toBe(15);
    expect((await admin.get(`${TXN}/${original.id}`)).body.data.returns).toEqual([]);
    expect((await admin.post(`${TXN}/${original.id}/reverse`).send({ note: 'ผิด' })).status).toBe(201);
    expect(await stockOf(fx.paper.id)).toBe(20);
  });
});

describe('returns of SERIAL materials', () => {
  let ramId: string;
  let original: { id: string; items: { units: { id: string }[] }[] };
  beforeEach(async () => {
    ramId = (
      await prisma.material.create({
        data: { code: 'HW-001', name: 'RAM 16GB', unit: 'ชิ้น', minStock: 0, categoryId: fx.category.id, trackingType: 'SERIAL' },
      })
    ).id;
    const staff = await loginAs('staff');
    await staff.post(TXN).send({ type: 'IN', items: [{ materialId: ramId, serialNumbers: ['SN-A', 'SN-B', 'SN-C'] }] });
    const [a, b] = await prisma.materialUnit.findMany({ where: { materialId: ramId }, orderBy: { serialNumber: 'asc' } });
    original = (
      await withdraw('user', { ...depts, items: [{ materialId: ramId, units: [{ unitId: a!.id }, { unitId: b!.id }] }] })
    ).body.data;
  });
  const status = async (serialNumber: string) =>
    (await prisma.materialUnit.findFirstOrThrow({ where: { serialNumber } })).status;

  it('puts the chosen unit back in stock and offers only the rest', async () => {
    const staff = await loginAs('staff');
    const unitA = original.items[0]!.units[0]!.id;
    const res = await staff.post(`${TXN}/${original.id}/return`).send(back(ramId, 1, { units: [{ unitId: unitA }] }));
    expect(res.status).toBe(201);
    expect(res.body.data.items[0].units).toMatchObject([{ serialNumber: 'SN-A' }]);
    expect(await status('SN-A')).toBe('IN_STOCK');
    expect(await stockOf(ramId)).toBe(2);
    const line = (await staff.get(`${TXN}/${original.id}/return`)).body.data.lines[0];
    expect(line).toMatchObject({ issued: 2, returned: 1, units: [{ serialNumber: 'SN-B' }] });

    // Same unit again: already returned.
    const again = await staff.post(`${TXN}/${original.id}/return`).send(back(ramId, 1, { units: [{ unitId: unitA }] }));
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('UNIT_NOT_AVAILABLE');
  });

  it('rejects a unit from another withdrawal and a count that does not match', async () => {
    const staff = await loginAs('staff');
    const unitC = (await prisma.materialUnit.findFirstOrThrow({ where: { serialNumber: 'SN-C' } })).id;
    const foreign = await staff.post(`${TXN}/${original.id}/return`).send(back(ramId, 1, { units: [{ unitId: unitC }] }));
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('UNIT_NOT_AVAILABLE');
    const mismatch = await staff.post(`${TXN}/${original.id}/return`).send(back(ramId, 2, { units: [{ unitId: original.items[0]!.units[0]!.id }] }));
    expect(mismatch.status).toBe(400);
    const none = await staff.post(`${TXN}/${original.id}/return`).send(back(ramId, 1));
    expect(none.status).toBe(400);
    expect(await stockOf(ramId)).toBe(1);
  });

  it('reversing a return sends the unit back to ISSUED so it can be returned again', async () => {
    const staff = await loginAs('staff');
    const unitA = original.items[0]!.units[0]!.id;
    const ret = (await staff.post(`${TXN}/${original.id}/return`).send(back(ramId, 1, { units: [{ unitId: unitA }] }))).body.data;
    const undo = await (await loginAs('admin')).post(`${TXN}/${ret.id}/reverse`).send({ note: 'บันทึกผิด' });
    expect(undo.status).toBe(201);
    expect(await status('SN-A')).toBe('ISSUED');
    expect(await stockOf(ramId)).toBe(1);
    expect((await staff.post(`${TXN}/${original.id}/return`).send(back(ramId, 1, { units: [{ unitId: unitA }] }))).status).toBe(201);
  });
});
