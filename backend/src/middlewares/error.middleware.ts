import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError, type FieldError } from '../utils/app-error.js';

/** Turns every error into the spec §4.2 envelope. Stack traces never leave the server. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const e = toAppError(err);
  if (e.status >= 500) console.error(err);
  res.status(e.status).json({
    success: false,
    error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) },
  });
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', 'ไม่พบ API ที่เรียก'));
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const details: FieldError[] = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return new AppError(400, 'VALIDATION_ERROR', 'ข้อมูลไม่ถูกต้อง', details);
  }

  // Malformed JSON body from express.json()
  if (isBodyParserError(err)) return new AppError(400, 'VALIDATION_ERROR', 'รูปแบบข้อมูลไม่ถูกต้อง');

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Services check uniqueness first for friendly messages; this catches the rare race.
    if (err.code === 'P2002') return new AppError(409, 'DUPLICATE_CODE', 'ข้อมูลนี้มีอยู่แล้ว');
    if (err.code === 'P2025') return new AppError(404, 'NOT_FOUND', 'ไม่พบข้อมูล');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่');
}

function isBodyParserError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed';
}
