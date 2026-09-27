import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import type { createUserSchema, listUsersSchema, loginSchema, updateUserSchema } from '../dtos/index.js';
import { prisma } from '../lib/prisma.js';
import type { SessionUser } from '../middlewares/auth.middleware.js';
import { AppError, duplicate, notFound } from '../utils/app-error.js';
import { skipTake, type Paged } from '../utils/http.js';

const BCRYPT_COST = 12;
// Compared against when the username does not exist, so both failures take the same time.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_COST);

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

/** Usernames are unique case-insensitively ("Admin" and "admin" are one account). */
const findByUsername = (username: string) =>
  prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    omit: { passwordHash: false },
  });

export async function login({ username, password }: z.infer<typeof loginSchema>): Promise<SessionUser> {
  const user = await findByUsername(username);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  if (!user.isActive) throw new AppError(403, 'USER_INACTIVE', 'บัญชีนี้ถูกปิดการใช้งาน');
  const { passwordHash: _, ...sessionUser } = user;
  return sessionUser;
}

export async function listUsers(q: z.infer<typeof listUsersSchema>): Promise<Paged<SessionUser>> {
  const where = {
    ...(q.search && {
      OR: [
        { username: { contains: q.search, mode: 'insensitive' as const } },
        { fullName: { contains: q.search, mode: 'insensitive' as const } },
      ],
    }),
    ...(q.role && { role: q.role }),
    ...(q.isActive !== undefined && { isActive: q.isActive }),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { fullName: 'asc' }, ...skipTake(q) }),
    prisma.user.count({ where }),
  ]);
  return { items, total };
}

export async function createUser(input: z.infer<typeof createUserSchema>): Promise<SessionUser> {
  if (await findByUsername(input.username)) throw duplicate('username', 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');
  return prisma.user.create({
    data: {
      username: input.username,
      fullName: input.fullName,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
  });
}

export async function updateUser(
  me: SessionUser,
  id: string,
  input: z.infer<typeof updateUserSchema>,
): Promise<SessionUser> {
  await getUser(id);
  // Keep at least one working admin: nobody can lock themselves out (spec US-0.2).
  if (id === me.id && (input.role !== 'ADMIN' || !input.isActive)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ไม่สามารถลดสิทธิ์หรือปิดบัญชีของตัวเองได้');
  }
  return prisma.user.update({ where: { id }, data: input });
}

export async function resetPassword(id: string, password: string): Promise<void> {
  await getUser(id);
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
}

async function getUser(id: string): Promise<SessionUser> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFound('ไม่พบผู้ใช้');
  return user;
}
