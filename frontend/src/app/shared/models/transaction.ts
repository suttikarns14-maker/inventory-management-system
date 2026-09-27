export type TransactionType = 'IN' | 'OUT';

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  IN: 'รับเข้า',
  OUT: 'เบิกจ่าย',
};

export interface TransactionItem {
  id: string;
  materialId: string;
  material: { id: string; code: string; name: string; unit: string };
  quantity: number;
  /** Prisma Decimal is serialized as a string. */
  unitPrice: string | null;
}

export interface TransactionRef {
  id: string;
  referenceNo: string;
}

export interface StockTransaction {
  id: string;
  type: TransactionType;
  referenceNo: string;
  createdBy: { id: string; fullName: string };
  note: string | null;
  reversalOf: TransactionRef | null;
  reversedBy: TransactionRef | null;
  createdAt: string;
  items: TransactionItem[];
}

export interface CreateTransactionInput {
  type: TransactionType;
  note?: string;
  items: { materialId: string; quantity: number; unitPrice?: number }[];
}

export interface HistoryQuery {
  from?: string;
  to?: string;
  type?: TransactionType;
  materialId?: string;
  createdById?: string;
  page?: number;
  limit?: number;
}
