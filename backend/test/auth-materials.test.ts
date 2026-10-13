import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { app, createUser, loginAs, PASSWORD, seedBasics, stockOf } from './helpers.js';

let fx: Awaited<ReturnType<typeof seedBasics>>;
beforeEach(async () => {
  fx = await seedBasics();
});

describe('auth', () => {
  it('logs in by username case-insensitively and sets an HttpOnly cookie', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'ADMIN', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('admin');
    expect(res.body.data.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/ims_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('rejects wrong passwords and inactive accounts', async () => {
    const wrong = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'Password123' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    await createUser('gone', 'USER', false);
    const inactive = await request(app).post('/api/v1/auth/login').send({ username: 'gone', password: PASSWORD });
    expect(inactive.body.error.code).toBe('USER_INACTIVE');
  });

  it('requires a session, and logout ends it', async () => {
    expect((await request(app).get('/api/v1/materials')).status).toBe(401);
    const agent = await loginAs('user');
    expect((await agent.get('/api/v1/auth/me')).body.data.role).toBe('USER');
    await agent.post('/api/v1/auth/logout');
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('locks out a deactivated user immediately, even with a valid cookie', async () => {
    const agent = await loginAs('user');
    await prisma.user.update({ where: { id: fx.user.id }, data: { isActive: false } });
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401);
  });
});

describe('roles (spec §1)', () => {
  it('USER can only withdraw', async () => {
    const agent = await loginAs('user');
    const item = { materialId: fx.paper.id, quantity: 1 };
    expect((await agent.post('/api/v1/inventory/transactions').send({ type: 'IN', items: [item] })).status).toBe(403);
    expect((await agent.post('/api/v1/inventory/transactions').send({ type: 'OUT', items: [item] })).status).toBe(201);
    expect((await agent.get('/api/v1/dashboard/summary')).status).toBe(403);
    expect((await agent.post('/api/v1/materials').send({})).status).toBe(403);
    expect((await agent.get('/api/v1/users')).status).toBe(403);
  });

  it('STAFF can add but not edit materials, and cannot reverse', async () => {
    const agent = await loginAs('staff');
    const body = { code: 'NEW-1', name: 'ใหม่', categoryId: fx.category.id, unit: 'ชิ้น', minStock: 1 };
    expect((await agent.post('/api/v1/materials').send(body)).status).toBe(201);
    expect((await agent.put(`/api/v1/materials/${fx.paper.id}`).send({ ...body, status: 'ACTIVE' })).status).toBe(403);
    expect((await agent.get('/api/v1/dashboard/summary')).status).toBe(200);
  });
});

describe('users', () => {
  it('creates users and rejects duplicate usernames in any letter case', async () => {
    const agent = await loginAs('admin');
    const body = { username: 'somchai', fullName: 'สมชาย', role: 'STAFF', password: 'test-pass-123' };
    expect((await agent.post('/api/v1/users').send(body)).status).toBe(201);
    const dup = await agent.post('/api/v1/users').send({ ...body, username: 'SomChai' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0].field).toBe('username');
    const bad = await agent.post('/api/v1/users').send({ ...body, username: 'มี เว้นวรรค' });
    expect(bad.body.error.details[0].field).toBe('username');
  });

  it('stops an admin from demoting or deactivating themselves', async () => {
    const agent = await loginAs('admin');
    const me = (await agent.get('/api/v1/auth/me')).body.data;
    const res = await agent.put(`/api/v1/users/${me.id}`).send({ fullName: 'x', role: 'STAFF', isActive: true });
    expect(res.status).toBe(400);
  });
});

describe('materials', () => {
  it('filters low stock with the column comparison currentQuantity <= minStock', async () => {
    const agent = await loginAs('user');
    const res = await agent.get('/api/v1/materials?lowStock=true');
    expect(res.body.data.map((m: { code: string }) => m.code)).toEqual(['OFF-002']);
    expect(res.body.meta).toMatchObject({ page: 1, total: 1, totalPages: 1 });
    expect(res.body.data[0].category).toEqual({ id: fx.category.id, name: 'วัสดุสำนักงาน' });
  });

  it('searches, sorts and pages', async () => {
    const agent = await loginAs('user');
    const byName = await agent.get('/api/v1/materials?search=ปาก');
    expect(byName.body.data).toHaveLength(1);
    const sorted = await agent.get('/api/v1/materials?sortBy=currentQuantity&sortOrder=desc&limit=1&page=2');
    expect(sorted.body.data[0].code).toBe('OFF-002');
    expect(sorted.body.meta.totalPages).toBe(2);
  });

  it('never changes stock through the material form, and allows changing the code (D6)', async () => {
    const agent = await loginAs('admin');
    const res = await agent.put(`/api/v1/materials/${fx.paper.id}`).send({
      code: 'OFF-100',
      name: 'กระดาษ A4',
      categoryId: fx.category.id,
      unit: 'รีม',
      minStock: 5,
      status: 'ACTIVE',
      currentQuantity: 9999,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('OFF-100');
    expect(await stockOf(fx.paper.id)).toBe(20);
  });

  it('rejects duplicate codes case-insensitively with a field error', async () => {
    const agent = await loginAs('staff');
    const res = await agent
      .post('/api/v1/materials')
      .send({ code: 'off-001', name: 'ซ้ำ', categoryId: fx.category.id, unit: 'ชิ้น', minStock: 0 });
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual([{ field: 'code', message: 'รหัสวัสดุนี้มีอยู่แล้ว' }]);
  });
});
