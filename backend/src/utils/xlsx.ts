import ExcelJS from 'exceljs';
import { AppError } from './app-error.js';

// Reading IT_Inventory-style workbooks (spec v2.2 §5). Columns are found by header text,
// so reordering columns in Excel does not break the import.

export const COLUMNS = {
  seq: 'ลำดับ',
  fiscalYear: 'ปีงบประมาณ',
  name: 'ชื่อวัสดุ',
  brand: 'ยี่ห้อ',
  model: 'รุ่น',
  serial: 'รหัสสินค้า(S/N)',
  type: 'ประเภทอุปกรณ์',
  status: 'สถานะการเบิก',
  requester: 'ผู้เบิก',
  requestingDept: 'หน่วยงานที่เบิก',
  date: 'วัน/เดือน/ปี (ค.ศ.) ที่เบิก',
  usingDept: 'หน่วยงานที่ใช้',
  building: 'อาคาร',
  floor: 'ชั้น',
  purpose: 'ระบบงานที่ใช้',
  price: 'ราคาต่อหน่วย',
  project: 'ชื่อโครงการ (TOR)',
  storage: 'สถานที่เก็บของ',
  remark: 'หมายเหตุ',
} as const;
export type Column = keyof typeof COLUMNS;

export const WITHDRAWN = 'เบิกแล้ว';

export type SheetRow = { row: number } & Record<Column, string>;

/** Plain text of a cell: rich text joined, formulas resolved, dates as YYYY-MM-DD (UTC). */
export function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
    if ('result' in v) {
      const r = v.result;
      return r instanceof Date ? r.toISOString().slice(0, 10) : r == null ? '' : String(r).trim();
    }
    if ('text' in v) return String(v.text).trim();
    return '';
  }
  return String(v).trim();
}

export async function loadWorkbook(file: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as unknown as ArrayBuffer);
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'อ่านไฟล์ไม่ได้ กรุณาใช้ไฟล์ Excel (.xlsx)');
  }
  return wb;
}

export function findSheet(wb: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  return wb.worksheets.find((w) => w.name.trim().toLowerCase() === name.toLowerCase());
}

/** Rows with a material name, keyed by column. Throws if a required header is missing. */
export function readRows(ws: ExcelJS.Worksheet, required: Column[]): SheetRow[] {
  const index = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, i) => {
    index.set(cellText(c).replace(/\s+/g, ' '), i);
  });
  const missing = required.filter((k) => !index.has(COLUMNS[k]));
  if (missing.length) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `ไม่พบคอลัมน์ในชีต "${ws.name}": ${missing.map((k) => COLUMNS[k]).join(', ')}`,
    );
  }
  const rows: SheetRow[] = [];
  ws.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    const row = { row: n } as SheetRow;
    for (const key of Object.keys(COLUMNS) as Column[]) {
      const i = index.get(COLUMNS[key]);
      row[key] = i ? cellText(r.getCell(i)) : '';
    }
    if (row.name) rows.push(row);
  });
  return rows;
}

/** Non-empty values of one column (header on row 1), in sheet order, trimmed and de-duplicated. */
export function columnList(ws: ExcelJS.Worksheet, header: string): string[] {
  let col = 0;
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, i) => {
    if (cellText(c) === header) col = i;
  });
  if (!col) return [];
  const out: string[] = [];
  ws.getColumn(col).eachCell({ includeEmpty: false }, (c, n) => {
    const v = cellText(c).replace(/\s+/g, ' ');
    if (n > 1 && v && !out.includes(v)) out.push(v);
  });
  return out;
}
