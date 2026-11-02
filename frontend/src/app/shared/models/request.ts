import { Ref, StockTransaction, TransactionRef } from './transaction';

/** D17: every withdrawal is a signed request that STAFF/ADMIN (not the requester) approve. */
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  PENDING: 'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว',
  REJECTED: 'ไม่อนุมัติ',
  CANCELLED: 'ยกเลิกแล้ว',
};

type Person = { id: string; fullName: string };

export interface WithdrawalRequestItem {
  id: string;
  materialId: string;
  material: { id: string; code: string; name: string; unit: string; trackingType: 'QUANTITY' | 'SERIAL'; currentQuantity: number };
  quantity: number;
  /** Set on approval; may be lower than quantity (0 = not given). */
  approvedQuantity: number | null;
}

/** Signatures are never listed; they come only with the document. */
export interface WithdrawalRequest {
  id: string;
  requestNo: string;
  status: RequestStatus;
  createdAt: string;
  createdBy: Person;
  requester: Person | null;
  requesterName: string;
  requestingDepartment: Ref;
  usingDepartment: Ref;
  building: Ref | null;
  floor: string | null;
  purpose: string | null;
  note: string | null;
  decidedBy: Person | null;
  decidedAt: string | null;
  rejectReason: string | null;
  transaction: TransactionRef | null;
  items: WithdrawalRequestItem[];
}

export interface CreateRequestInput {
  requesterId?: string | null;
  requesterName?: string | null;
  requestingDepartmentId: string | null;
  usingDepartmentId: string | null;
  buildingId?: string | null;
  floor?: string | null;
  purpose?: string | null;
  note?: string;
  /** PNG data URL */
  signature: string;
  items: { materialId: string; quantity: number }[];
}

export interface ApproveRequestInput {
  signature: string;
  items: { materialId: string; quantity: number; units?: { unitId: string; remark: string | null }[] }[];
}

export interface RequestQuery {
  status?: RequestStatus;
  page?: number;
  limit?: number;
}

/** GET /inventory/transactions/:id/document; request is null for receipts, reversals and old withdrawals. */
export interface WithdrawalDocument {
  transaction: StockTransaction;
  request: {
    requestNo: string;
    createdAt: string;
    requesterName: string;
    requesterSignature: string;
    decidedBy: Person | null;
    decidedAt: string | null;
    approverSignature: string | null;
  } | null;
}
