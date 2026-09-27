import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProduction } from '../config/env.js';
import type { Role, User } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/app-error.js';

export type SessionUser = Omit<User, 'passwordHash'>;

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const SESSION_COOKIE = 'ims_session';

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/api',
});

/** Spec §7: the JWT lives in an HttpOnly cookie; the browser never sees the token. */
export function setSessionCookie(res: Response, userId: string): void {
  const token = jwt.sign({ sub: userId }, env.JWT_SECRET, { expiresIn: `${env.SESSION_HOURS}h` });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: env.SESSION_HOURS * 3_600_000 });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'กรุณาเข้าสู่ระบบ');

/**
 * Loads the user on every request so a deactivated account or a role change
 * takes effect immediately, not when the token expires.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') throw unauthorized();
  let userId: string;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || typeof payload.sub !== 'string') throw new Error('bad payload');
    userId = payload.sub;
  } catch {
    throw unauthorized();
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw unauthorized();
  req.user = user;
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'คุณไม่มีสิทธิ์ทำรายการนี้');
    }
    next();
  };

/** The authenticated user; only call behind requireAuth. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
