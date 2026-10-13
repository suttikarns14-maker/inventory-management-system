import { TrackingType } from './material';

// Excel import (spec v2.2 §5)

export interface ImportIssue {
  /** Excel row number */
  row: number | null;
  message: string;
  /** Must be fixed in the file before the import can be saved. */
  blocking: boolean;
}

export interface ImportMaterial {
  key: string;
  code: string;
  name: string;
  brand: string | null;
  model: string | null;
  category: string;
  units: number;
  validSerials: number;
  proposed: TrackingType;
  /** initial import only */
  withdrawn?: number;
  /** receipt import only: matched an existing material */
  existing?: boolean;
}

export interface UnmatchedValue {
  value: string;
  rows: number;
}

export interface InitialImportPreview {
  importId: string;
  summary: {
    rows: number;
    materials: number;
    inStockUnits: number;
    withdrawnUnits: number;
    receipts: number;
    withdrawals: number;
  };
  materials: ImportMaterial[];
  unmatched: {
    requestingDepartments: UnmatchedValue[];
    usingDepartments: UnmatchedValue[];
    buildings: UnmatchedValue[];
  };
  options: { mainDepartments: string[]; allDepartments: string[]; buildings: string[] };
  issues: ImportIssue[];
}

export type Mapping = Record<string, string | null>;

export interface InitialImportCommit {
  importId: string;
  tracking: Record<string, TrackingType>;
  mapping: { requestingDepartments: Mapping; usingDepartments: Mapping; buildings: Mapping };
}

export interface InitialImportReport {
  materials: number;
  serialMaterials: number;
  units: number;
  tempSerials: number;
  receipts: number;
  withdrawals: number;
  inStock: number;
}

export interface ReceiptImportPreview {
  importId: string;
  summary: { rows: number; materials: number; newMaterials: number; receipts: number };
  materials: ImportMaterial[];
  issues: ImportIssue[];
}
