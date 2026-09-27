export interface DashboardSummary {
  activeMaterials: number;
  reorderCount: number;
  outOfStockCount: number;
  neverWithdrawnCount: number;
  withdrawalsThisMonth: number;
}

export interface MaterialBrief {
  id: string;
  code: string;
  name: string;
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
}

export type TopWithdrawnSort = 'quantity' | 'count';
