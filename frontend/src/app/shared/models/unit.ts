export type UnitStatus = 'IN_STOCK' | 'ISSUED' | 'VOID';

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  IN_STOCK: 'อยู่ในคลัง',
  ISSUED: 'เบิกแล้ว',
  VOID: 'ยกเลิก',
};

/** One physical item of a SERIAL material (spec v2.2 §2.3). */
export interface MaterialUnit {
  id: string;
  serialNumber: string;
  /** Import placeholder (…-TEMP-SN-NN) waiting for the real serial. */
  isTempSerial: boolean;
  status: UnitStatus;
  createdAt: string;
  material: { id: string; code: string; name: string; brand: string | null; model: string | null };
  storageLocation: { id: string; name: string } | null;
  lastMovement: {
    id: string;
    type: 'IN' | 'OUT';
    referenceNo: string;
    createdAt: string;
    requesterName: string;
    usingDepartment: { id: string; name: string } | null;
    remark: string | null;
  } | null;
}

export interface UnitQuery {
  search?: string;
  status?: UnitStatus;
  tempOnly?: boolean;
  page?: number;
  limit?: number;
}
