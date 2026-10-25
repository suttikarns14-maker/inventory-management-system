/** Reference lists (spec v2.2 §2.1). Rows are deactivated, never deleted. */
export interface LookupItem {
  id: string;
  name: string;
  isActive: boolean;
}

/** MAIN = หน่วยงานหลัก, SUB = หน่วยงานย่อย. Either can request and use. */
export type DepartmentKind = 'MAIN' | 'SUB';

export interface Department extends LookupItem {
  kind: DepartmentKind;
}

export interface Lookups {
  departments: Department[];
  buildings: LookupItem[];
  storageLocations: LookupItem[];
  floors: string[];
}

export type LookupKind = 'departments' | 'buildings' | 'storage-locations';

export interface LookupInput {
  name: string;
  isActive: boolean;
  kind?: DepartmentKind;
}

/** Floors from Dropdowndata; the back-end has the same fixed list (utils/constants.ts). */
export const FLOORS = [
  '19', '18', '17', '16', '15', '14', '13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'M', 'G', 'B1', 'B2', 'B3',
] as const;
