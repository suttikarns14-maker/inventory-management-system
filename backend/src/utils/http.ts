import type { Response } from 'express';
import { z } from 'zod';

/** `{ success: true, data }` envelope (spec §4.2). */
export function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PageQuery = z.infer<typeof pageQuery>;

export interface Paged<T> {
  items: T[];
  total: number;
}

export function sendPage<T>(res: Response, { items, total }: Paged<T>, { page, limit }: PageQuery): void {
  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  });
}

export const skipTake = ({ page, limit }: PageQuery) => ({ skip: (page - 1) * limit, take: limit });
