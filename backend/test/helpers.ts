import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { Role } from '../src/generated/prisma/client.js';
import { prisma } from '../src/lib/prisma.js';

export const app = createApp();
export const PASSWORD = 'password123';
const hash = bcrypt.hashSync(PASSWORD, 4); // low cost: test speed only

/** Empties every table so each test starts from a known state. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE withdrawal_request_items, withdrawal_requests, transaction_units, material_units, stock_transaction_items, stock_transactions,
             reference_counters, materials, categories, departments, buildings, storage_locations,
             users RESTART IDENTITY CASCADE`);
}

export async function createUser(username: string, role: Role, isActive = true) {
  return prisma.user.create({
    data: { username, role, isActive, fullName: `ผู้ใช้ ${username}`, passwordHash: hash },
  });
}

/** A supertest agent that keeps the session cookie, like a browser. */
export async function loginAs(username: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ username, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${JSON.stringify(res.body)}`);
  return agent;
}

/** Department ids every withdrawal needs (spec v2.2 Q2); filled by seedBasics(). */
export const depts = { requestingDepartmentId: '', usingDepartmentId: '', requesterName: 'ผู้เบิกทดสอบ' };

/** Body of a simple withdrawal of a QUANTITY material. */
export const out = (materialId: string, quantity: number, extra: object = {}) => ({
  type: 'OUT',
  ...depts,
  ...extra,
  items: [{ materialId, quantity }],
});

/** Standard fixture: one user per role, a category and two materials in stock. */
export async function seedBasics() {
  await resetDb();
  await createUser('admin', 'ADMIN');
  await createUser('staff', 'STAFF');
  const user = await createUser('user', 'USER');
  await createUser('user2', 'USER');
  const category = await prisma.category.create({ data: { name: 'วัสดุสำนักงาน' } });
  const main = await prisma.department.create({ data: { name: 'ฝ่ายเทคโนโลยีสารสนเทศ', kind: 'MAIN' } });
  const sub = await prisma.department.create({ data: { name: 'งานธุรการ', kind: 'SUB' } });
  Object.assign(depts, { requestingDepartmentId: main.id, usingDepartmentId: sub.id });
  const paper = await prisma.material.create({
    data: { code: 'OFF-001', name: 'กระดาษ A4', unit: 'รีม', minStock: 5, categoryId: category.id, currentQuantity: 20 },
  });
  const pens = await prisma.material.create({
    data: { code: 'OFF-002', name: 'ปากกา', unit: 'ด้าม', minStock: 10, categoryId: category.id, currentQuantity: 3 },
  });
  return { category, paper, pens, user, main, sub };
}

export const stockOf = async (id: string) =>
  (await prisma.material.findUniqueOrThrow({ where: { id } })).currentQuantity;

/** A tiny valid PNG data URL, standing in for a drawn signature (D17). */
export const SIG = 'data:image/png;base64,iVBORw0KGgo=';

type OutItem = { materialId: string; quantity?: number; units?: { unitId: string; remark?: string | null }[] };

/**
 * D17: a withdrawal is a signed request that someone else approves. Creates the request as
 * `by`, has admin (staff when `by` is admin) approve all of it, and answers like the old direct
 * OUT: { status: 201, body: { data: transaction } }, or the first failing response.
 */
// Reused per user id (new on every seed): many parallel logins would trip the login rate limit.
const sessions = new Map<string, ReturnType<typeof loginAs>>();
async function session(username: string) {
  const { id } = await prisma.user.findFirstOrThrow({ where: { username } });
  if (!sessions.has(id)) sessions.set(id, loginAs(username));
  return sessions.get(id)!;
}

export async function withdraw(by: string, body: { items: OutItem[] } & Record<string, unknown>) {
  const items = body.items.map((i) => ({ ...i, quantity: i.units?.length ?? i.quantity }));
  const created = await (await session(by))
    .post('/api/v1/inventory/requests')
    .send({ ...body, signature: SIG, items: items.map(({ materialId, quantity }) => ({ materialId, quantity })) });
  if (created.status !== 201) return created;
  const approver = await session(by === 'admin' ? 'staff' : 'admin');
  const approved = await approver
    .post(`/api/v1/inventory/requests/${created.body.data.id}/approve`)
    .send({ signature: SIG, items });
  if (approved.status !== 200) return approved;
  const txn = await approver.get(`/api/v1/inventory/transactions/${approved.body.data.transaction.id}`);
  return { status: 201, body: txn.body };
}
