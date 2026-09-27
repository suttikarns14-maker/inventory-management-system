import { MatPaginatorIntl } from '@angular/material/paginator';

export function thaiPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'แสดงต่อหน้า';
  intl.nextPageLabel = 'หน้าถัดไป';
  intl.previousPageLabel = 'หน้าก่อนหน้า';
  intl.firstPageLabel = 'หน้าแรก';
  intl.lastPageLabel = 'หน้าสุดท้าย';
  intl.getRangeLabel = (page, pageSize, length) => {
    if (length === 0) return 'ไม่มีข้อมูล';
    const start = page * pageSize + 1;
    return `${start}-${Math.min(start + pageSize - 1, length)} จาก ${length}`;
  };
  return intl;
}
