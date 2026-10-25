import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { depts, loginAs, seedBasics, stockOf } from './helpers.js';

let fx: Awaited<ReturnType<typeof seedBasics>>;
let ramId: string;

beforeEach(async () => {
  fx = await seedBasics();
  ramId = (
    await prisma.material.create({
      data: { code: 'HW-001', name: 'RAM 16GB', brand: 'Apacer', unit: 'ชิ้น', minStock: 5, categoryId: fx.category.id, trackingType: 'SERIAL' },
    })
  ).id;
});

const receive = (serialNumbers: string[]) => ({ type: 'IN', fiscalYear: 2568, items: [{ materialId: ramId, serialNumbers }] });
const issue = (unitIds: string[], extra: object = {}) => ({
  type: 'OUT',
  ...depts,
  ...extra,
  items: [{ materialId: ramId, units: unitIds.map((unitId) => ({ unitId, remark: 'VJRNB0300' })) }],
});
const unitsOf = async (status?: 'IN_STOCK' | 'ISSUED' | 'VOID') =>
  prisma.materialUnit.findMany({ where: { materialId: ramId, ...(status && { status }) }, orderBy: { serialNumber: 'asc' } });

describe('serial-tracked materials (spec v2.2 §2.3)', () => {
  it('receives units by serial number and keeps the count in sync', async () => {
    const staff = await loginAs('staff');
    const res = await staff.post('/api/v1/inventory/transactions').send(receive(['SN-A', 'SN-B', 'SN-C']));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ fiscalYear: 2568, requesterName: 'ผู้ใช้ staff' });
    expect(res.body.data.items[0]).toMatchObject({ quantity: 3, units: [{ serialNumber: 'SN-A' }, { serialNumber: 'SN-B' }, { serialNumber: 'SN-C' }] });
    expect(await stockOf(ramId)).toBe(3);
    expect(await unitsOf('IN_STOCK')).toHaveLength(3);
  });

  it('rejects duplicate serial numbers in any letter case, and requires serials', async () => {
    const staff = await loginAs('staff');
    await staff.post('/api/v1/inventory/transactions').send(receive(['SN-A']));
    const dup = await staff.post('/api/v1/inventory/transactions').send(receive(['sn-a', 'SN-Z']));
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_SERIAL');
    expect(await stockOf(ramId)).toBe(1);
    const missing = await staff.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [{ materialId: ramId, quantity: 2 }] });
    expect(missing.body.error.details[0].field).toBe('items.0.serialNumbers');
  });

  it('issues chosen units, records per-unit remarks, and refuses a unit twice', async () => {
    const staff = await loginAs('staff');
    await staff.post('/api/v1/inventory/transactions').send(receive(['SN-A', 'SN-B']));
    const [a] = await unitsOf();
    const res = await staff.post('/api/v1/inventory/transactions').send(issue([a!.id], { purpose: 'Notebook นศพ', floor: '3' }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      requestingDepartment: { name: 'ฝ่ายเทคโนโลยีสารสนเทศ' },
      usingDepartment: { name: 'งานธุรการ' },
      purpose: 'Notebook นศพ',
      floor: '3',
    });
    expect(res.body.data.items[0].units).toEqual([{ id: a!.id, serialNumber: 'SN-A', isTempSerial: false, remark: 'VJRNB0300' }]);
    expect(await stockOf(ramId)).toBe(1);
    const again = await staff.post('/api/v1/inventory/transactions').send(issue([a!.id]));
    expect(again.body.error.code).toBe('UNIT_NOT_AVAILABLE');
    expect(await stockOf(ramId)).toBe(1);
  });

  it('lets only one of two simultaneous withdrawals take the same unit', async () => {
    const staff = await loginAs('staff');
    await staff.post('/api/v1/inventory/transactions').send(receive(['SN-A', 'SN-B']));
    const [a] = await unitsOf();
    const results = await Promise.all([
      staff.post('/api/v1/inventory/transactions').send(issue([a!.id])),
      staff.post('/api/v1/inventory/transactions').send(issue([a!.id])),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await stockOf(ramId)).toBe(1);
    expect(await unitsOf('ISSUED')).toHaveLength(1);
  });

  it('reverses a withdrawal (units back in stock) and a receipt (units void)', async () => {
    const staff = await loginAs('staff');
    const admin = await loginAs('admin');
    const receipt = (await staff.post('/api/v1/inventory/transactions').send(receive(['SN-A', 'SN-B']))).body.data;
    const [a] = await unitsOf();
    const withdrawal = (await staff.post('/api/v1/inventory/transactions').send(issue([a!.id]))).body.data;

    // Receipt cannot be reversed while one of its units is out.
    const blocked = await admin.post(`/api/v1/inventory/transactions/${receipt.id}/reverse`).send({ note: 'ผิด' });
    expect(blocked.body.error.code).toBe('INSUFFICIENT_STOCK');

    const back = await admin.post(`/api/v1/inventory/transactions/${withdrawal.id}/reverse`).send({ note: 'ผิด' });
    expect(back.status).toBe(201);
    expect(back.body.data.items[0].units[0].serialNumber).toBe('SN-A');
    expect(await unitsOf('IN_STOCK')).toHaveLength(2);

    expect((await admin.post(`/api/v1/inventory/transactions/${receipt.id}/reverse`).send({ note: 'ผิด' })).status).toBe(201);
    expect(await unitsOf('VOID')).toHaveLength(2);
    expect(await stockOf(ramId)).toBe(0);
  });

  it('blocks changing the tracking type once the material has movements', async () => {
    const admin = await loginAs('admin');
    await admin.post('/api/v1/inventory/transactions').send(receive(['SN-A']));
    const res = await admin.put(`/api/v1/materials/${ramId}`).send({
      code: 'HW-001', name: 'RAM 16GB', brand: 'Apacer', categoryId: fx.category.id, unit: 'ชิ้น', minStock: 5,
      status: 'ACTIVE', trackingType: 'QUANTITY',
    });
    expect(res.body.error.details[0].field).toBe('trackingType');
  });
});

describe('withdrawal details (spec v2.2 D10, D11, Q2)', () => {
  it('requires both departments; either may be a main or a sub department', async () => {
    const staff = await loginAs('staff');
    const base = { type: 'OUT', requesterName: 'x', items: [{ materialId: fx.paper.id, quantity: 1 }] };
    const none = await staff.post('/api/v1/inventory/transactions').send(base);
    expect(none.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'requestingDepartmentId',
      'usingDepartmentId',
    ]);
    const subAsRequesting = await staff
      .post('/api/v1/inventory/transactions')
      .send({ ...base, requestingDepartmentId: fx.sub.id, usingDepartmentId: fx.main.id });
    expect(subAsRequesting.status).toBe(201);
  });

  it('USER is always the requester; STAFF may pick a user, who then sees it in their history', async () => {
    const user = await loginAs('user');
    const own = await user
      .post('/api/v1/inventory/transactions')
      .send({ ...depts, type: 'OUT', requesterName: 'คนอื่น', items: [{ materialId: fx.paper.id, quantity: 1 }] });
    expect(own.body.data.requesterName).toBe('ผู้ใช้ user');

    const staff = await loginAs('staff');
    const options = (await staff.get('/api/v1/users/options')).body.data;
    const target = options.find((u: { username: string }) => u.username === 'user');
    const onBehalf = await staff
      .post('/api/v1/inventory/transactions')
      .send({ ...depts, type: 'OUT', requesterName: undefined, requesterId: target.id, items: [{ materialId: fx.paper.id, quantity: 1 }] });
    expect(onBehalf.body.data).toMatchObject({ requesterName: 'ผู้ใช้ user', requester: { id: target.id } });
    expect((await user.get('/api/v1/inventory/history')).body.meta.total).toBe(2);

    const nobody = await staff
      .post('/api/v1/inventory/transactions')
      .send({ ...depts, requesterName: undefined, type: 'OUT', items: [{ materialId: fx.paper.id, quantity: 1 }] });
    expect(nobody.body.error.details[0].field).toBe('requesterName');
  });
});

describe('serial search and fixes (spec v2.2 §3)', () => {
  it('finds where a serial went, filters placeholders, and lets ADMIN fix them', async () => {
    const staff = await loginAs('staff');
    const admin = await loginAs('admin');
    await staff.post('/api/v1/inventory/transactions').send(receive(['SN-A', 'SN-A-TEMP-SN-01']));
    await prisma.materialUnit.updateMany({ where: { serialNumber: 'SN-A-TEMP-SN-01' }, data: { isTempSerial: true } });
    const [a] = await unitsOf();
    await staff.post('/api/v1/inventory/transactions').send(issue([a!.id]));

    const found = (await staff.get('/api/v1/units?search=sn-a')).body.data;
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({
      serialNumber: 'SN-A',
      status: 'ISSUED',
      material: { code: 'HW-001' },
      lastMovement: { type: 'OUT', requesterName: 'ผู้เบิกทดสอบ', usingDepartment: { name: 'งานธุรการ' }, remark: 'VJRNB0300' },
    });

    const temp = (await staff.get('/api/v1/units?tempOnly=true')).body.data;
    expect(temp.map((u: { serialNumber: string }) => u.serialNumber)).toEqual(['SN-A-TEMP-SN-01']);
    expect((await staff.put(`/api/v1/units/${temp[0].id}`).send({ serialNumber: 'REAL-1' })).status).toBe(403);
    const fixed = await admin.put(`/api/v1/units/${temp[0].id}`).send({ serialNumber: 'REAL-1' });
    expect(fixed.body.data).toMatchObject({ serialNumber: 'REAL-1', isTempSerial: false });
    expect((await admin.put(`/api/v1/units/${temp[0].id}`).send({ serialNumber: 'sn-a' })).status).toBe(409);

    const history = (await staff.get('/api/v1/inventory/history?serial=SN-A')).body.data;
    expect(history.every((t: { items: { units: { serialNumber: string }[] }[] }) =>
      t.items.some((i) => i.units.some((u) => u.serialNumber === 'SN-A')))).toBe(true);
  });
});

describe('lookups (spec v2.2 §2.1, Q4)', () => {
  it('lists reference data for everyone and lets only ADMIN change it', async () => {
    const user = await loginAs('user');
    const lookups = (await user.get('/api/v1/lookups')).body.data;
    expect(lookups.departments.map((d: { name: string }) => d.name)).toContain('ฝ่ายเทคโนโลยีสารสนเทศ');
    expect(lookups.floors).toContain('B1');
    expect((await user.post('/api/v1/lookups/buildings').send({ name: 'อาคารใหม่' })).status).toBe(403);

    const admin = await loginAs('admin');
    const created = await admin.post('/api/v1/lookups/buildings').send({ name: 'อาคารใหม่' });
    expect(created.status).toBe(201);
    expect((await admin.post('/api/v1/lookups/buildings').send({ name: 'อาคารใหม่' })).status).toBe(409);
    const off = await admin.put(`/api/v1/lookups/buildings/${created.body.data.id}`).send({ name: 'อาคารใหม่', isActive: false });
    expect(off.body.data.isActive).toBe(false);
    const dept = await admin.post('/api/v1/lookups/departments').send({ name: 'ER', kind: 'SUB' });
    expect(dept.body.data.kind).toBe('SUB');
  });
});
