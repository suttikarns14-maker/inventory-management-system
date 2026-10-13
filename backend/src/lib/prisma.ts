import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
  // Never return password hashes unless a query asks for them explicitly (login only).
  omit: { user: { passwordHash: true } },
});

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
