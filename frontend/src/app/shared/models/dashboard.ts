export interface DashboardSummary {
  activeMaterials: number;
  reorderCount: number;
  outOfStockCount: number;
  neverWithdrawnCount: number;
  withdrawalsThisMonth: number;
  /** Baht: remaining quantity × latest purchase price, active materials only. */
  stockValue: number;
  /** Active materials in stock that were never received with a price (counted as 0 baht). */
  unpricedCount: number;
  /** Most valuable first. */
  valueByCategory: { id: string; name: string; value: number }[];
  /** Data clean-up still to do. */
  dataQuality: {
    /** Placeholder S/N from the import (not VOID). */
    tempSerials: number;
    /** Active materials whose min stock is still the import default. */
    defaultMinStock: number;
    /** Withdrawals missing the requesting or using department (old history that was not matched). */
    missingDepartments: number;
  };
}

export interface MaterialBrief {
  id: string;
  code: string;
  name: string;
  /** Shown next to the name: materials with the same name differ by brand/model. */
  brand: string | null;
  model: string | null;
  unit: string;
}

export interface ReorderSuggestion extends MaterialBrief {
  currentQuantity: number;
  minStock: number;
  avgDailyUsage: number;
  daysLeft: number | null;
  suggestedQty: number;
}

export interface TopWithdrawn extends MaterialBrief {
  totalQuantity: number;
  withdrawalCount: number;
}

export interface UnusedMaterial extends MaterialBrief {
  currentQuantity: number;
  createdAt: string;
  lastOutAt: string | null;
  /** Latest purchase price; null = never received with a price. */
  unitPrice: number | null;
  /** currentQuantity × unitPrice (0 when unpriced). The list is sorted by this, highest first. */
  value: number;
}

export type TopWithdrawnSort = 'quantity' | 'count';

/**
 * One fiscal year + project (TOR). Counted per unit (SERIAL materials), each at the price on its own
 * receipt line; reversed receipts and inactive materials are left out. Newest year first.
 */
export interface ProcurementRow {
  /** Thai fiscal year (B.E.); receipts saved without one use the fiscal year of their date. */
  fiscalYear: number;
  projectName: string | null;
  receivedQty: number;
  /** Baht; unpriced units count as 0. */
  receivedValue: number;
  unpricedQty: number;
  /** Still IN_STOCK: the stock-age view. */
  remainingQty: number;
  remainingValue: number;
}

/** Last 12 months, oldest first. Pieces withdrawn (reversed withdrawals excluded). */
export interface MonthlyWithdrawals {
  /** YYYY-MM (Bangkok time). */
  month: string;
  quantity: number;
  /** Same month one year earlier. */
  previousYearQuantity: number;
}
