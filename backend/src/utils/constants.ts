/** Floors from the Dropdowndata sheet (spec v2.2 §2.1). Fixed list; the front-end has the same one. */
export const FLOORS = [
  '19', '18', '17', '16', '15', '14', '13', '12', '11', '10',
  '9', '8', '7', '6', '5', '4', '3', '2', 'M', 'G', 'B1', 'B2', 'B3',
] as const;

/** Defaults for materials created by an import (decision D13). */
export const IMPORT_DEFAULT_UNIT = 'ชิ้น';
export const IMPORT_DEFAULT_MIN_STOCK = 5;
