import { SortOrder } from './api';


/** Spec v2.2 D9: total count only, or one unit per serial number. */
export type TrackingType = 'QUANTITY' | 'SERIAL';

export const TRACKING_LABELS: Record<TrackingType, string> = {
  QUANTITY: 'ยอดรวม',
  SERIAL: 'รายชิ้น (S/N)',
};

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
  brand: string | null;
  model: string | null;
  trackingType: TrackingType;
  storageLocationId: string | null;
  storageLocation: { id: string; name: string } | null;
  unit: string;
  currentQuantity: number;
  minStock: number;
  createdAt: string;
  updatedAt: string;
}

/** currentQuantity is never accepted: stock changes only through transactions. */
export interface MaterialInput {
  code: string;
  name: string;
  categoryId: string;
  brand: string | null;
  model: string | null;
  unit: string;
  minStock: number;
  /** Cannot change once the material has movements (server checks). */
  trackingType: TrackingType;
  storageLocationId: string | null;
}

export type MaterialSortBy = 'code' | 'name' | 'currentQuantity' | 'updatedAt';

export interface MaterialQuery {
  search?: string;
  categoryId?: string;
  storageLocationId?: string;
  trackingType?: TrackingType;
  lowStock?: boolean;
  outOfStock?: boolean;
  sortBy?: MaterialSortBy;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
}

export const isLowStock = (m: Pick<Material, 'currentQuantity' | 'minStock'>): boolean =>
  m.currentQuantity <= m.minStock;
