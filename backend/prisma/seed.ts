import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Safe to run more than once: it only creates what is missing and never changes existing data
// (an existing admin keeps the password they already changed).

const CATEGORIES: [string, string][] = [
  ['วัสดุสำนักงาน', 'กระดาษ เครื่องเขียน และของใช้ในสำนักงาน'],
  ['อุปกรณ์ไฟฟ้า', 'หลอดไฟ สายไฟ และอุปกรณ์ไฟฟ้าทั่วไป'],
  ['วัสดุทำความสะอาด', 'น้ำยาและอุปกรณ์ทำความสะอาด'],
  ['อุปกรณ์คอมพิวเตอร์', 'อุปกรณ์ต่อพ่วงและวัสดุสิ้นเปลืองคอมพิวเตอร์'],
  ['วัสดุซ่อมบำรุง', 'อะไหล่และวัสดุสำหรับงานซ่อมบำรุงอาคาร'],
];

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }) });

async function main() {
  const username = required('SEED_ADMIN_USERNAME');
  const password = required('SEED_ADMIN_PASSWORD');
  if (password.length < 8) throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters');

  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });
  if (existing) {
    console.log(`Admin "${existing.username}" already exists - left unchanged`);
  } else {
    await prisma.user.create({
      data: {
        username,
        fullName: process.env['SEED_ADMIN_NAME'] || 'ผู้ดูแลระบบ',
        role: 'ADMIN',
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
    console.log(`Created admin "${username}"`);
  }

  for (const [name, description] of CATEGORIES) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name, description } });
  }
  console.log(`Categories: ${await prisma.category.count()}`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
