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
    TRUNCATE stock_transaction_items, stock_transactions, reference_counters,
             materials, categories, users RESTART IDENTITY CASCADE`);
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

/** Standard fixture: one user per role, a category and two materials in stock. */
export async function seedBasics() {
  await resetDb();
  await createUser('admin', 'ADMIN');
  await createUser('staff', 'STAFF');
  const user = await createUser('user', 'USER');
  await createUser('user2', 'USER');
  const category = await prisma.category.create({ data: { name: 'วัสดุสำนักงาน' } });
  const paper = await prisma.material.create({
    data: { code: 'OFF-001', name: 'กระดาษ A4', unit: 'รีม', minStock: 5, categoryId: category.id, currentQuantity: 20 },
  });
  const pens = await prisma.material.create({
    data: { code: 'OFF-002', name: 'ปากกา', unit: 'ด้าม', minStock: 10, categoryId: category.id, currentQuantity: 3 },
  });
  return { category, paper, pens, user };
}

export const stockOf = async (id: string) =>
  (await prisma.material.findUniqueOrThrow({ where: { id } })).currentQuantity;
