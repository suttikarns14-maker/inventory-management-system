import { SortOrder } from './api';

export type MaterialStatus = 'ACTIVE' | 'INACTIVE';

export interface Category {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryInput {
  name: string;
  description: string | null;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  category: { id: string; name: string };
  unit: string;
  currentQuantity: number;
  minStock: number;
  location: string | null;
  status: MaterialStatus;
  createdAt: string;
  updatedAt: string;
}

/** currentQuantity is never accepted: stock changes only through transactions. */
export interface MaterialInput {
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  minStock: number;
  location: string | null;
  /** ADMIN only (PUT). */
  status?: MaterialStatus;
}

export type MaterialSortBy = 'code' | 'name' | 'currentQuantity' | 'updatedAt';

export interface MaterialQuery {
  search?: string;
  categoryId?: string;
  status?: MaterialStatus;
  lowStock?: boolean;
  sortBy?: MaterialSortBy;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
}

export const isLowStock = (m: Pick<Material, 'currentQuantity' | 'minStock'>): boolean =>
  m.currentQuantity <= m.minStock;
