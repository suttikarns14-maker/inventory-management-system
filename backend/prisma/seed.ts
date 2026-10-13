import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

// Creates the first admin only. Categories, departments, buildings and storage locations come
// from the Excel import (spec v2.2 §5). Safe to run more than once: an existing admin is left
// unchanged (and keeps the password they already changed).

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

}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
