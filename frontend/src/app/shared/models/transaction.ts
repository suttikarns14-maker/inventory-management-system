export type TransactionType = 'IN' | 'OUT';

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  IN: 'รับเข้า',
  OUT: 'เบิกจ่าย',
};

export interface Ref {
  id: string;
  name: string;
}

export interface TransactionUnitInfo {
  id: string;
  serialNumber: string;
  isTempSerial: boolean;
  remark: string | null;
}

export interface TransactionItem {
  id: string;
  materialId: string;
  material: {
    id: string;
    code: string;
    name: string;
    unit: string;
    trackingType: 'QUANTITY' | 'SERIAL';
  };
  quantity: number;
  /** Prisma Decimal is serialized as a string. */
  unitPrice: string | null;
  /** Serial numbers moved by this line (SERIAL materials only). */
  units: TransactionUnitInfo[];
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
  // IN
  fiscalYear: number | null;
  projectName: string | null;
  // OUT (spec v2.2 §2.4); requesterName is always set
  requesterName: string;
  requester: { id: string; fullName: string } | null;
  requestingDepartment: Ref | null;
  usingDepartment: Ref | null;
  building: Ref | null;
  floor: string | null;
  purpose: string | null;
  items: TransactionItem[];
}

/**
 * One line per material: QUANTITY uses `quantity`; SERIAL + IN uses `serialNumbers`;
 * SERIAL + OUT uses `units`.
 */
export interface TransactionItemInput {
  materialId: string;
  quantity?: number;
  unitPrice?: number;
  serialNumbers?: string[];
  units?: { unitId: string; remark?: string | null }[];
}

export interface CreateTransactionInput {
  type: TransactionType;
  note?: string;
  fiscalYear?: number | null;
  projectName?: string | null;
  requesterId?: string | null;
  requesterName?: string | null;
  requestingDepartmentId?: string | null;
  usingDepartmentId?: string | null;
  buildingId?: string | null;
  floor?: string | null;
  purpose?: string | null;
  items: TransactionItemInput[];
}

export interface HistoryQuery {
  from?: string;
  to?: string;
  type?: TransactionType;
  materialId?: string;
  createdById?: string;
  requestingDepartmentId?: string;
  usingDepartmentId?: string;
  serial?: string;
  /** Withdrawals still missing a department (imported history). */
  missingDepartment?: boolean;
  page?: number;
  limit?: number;
}
