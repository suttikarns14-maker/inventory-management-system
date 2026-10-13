import { rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/app-error.js';

/** Spec US-0.1: at most 5 failed logins per 15 minutes per IP. Successful logins don't count. */
export const loginLimiter = () =>
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError(429, 'TOO_MANY_REQUESTS', 'เข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่')),
  });
