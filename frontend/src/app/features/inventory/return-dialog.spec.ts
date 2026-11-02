import { ReturnLine } from '../../shared/models/transaction';
import { returnPayload } from './return-dialog';

const line = (extra: Partial<ReturnLine>): ReturnLine => ({
  materialId: 'm',
  code: 'C',
  name: 'n',
  unit: 'ชิ้น',
  trackingType: 'QUANTITY',
  issued: 5,
  returned: 0,
  units: [],
  ...extra,
});

describe('returnPayload', () => {
  it('drops lines with nothing coming back and counts ticked serials', () => {
    const lines = [
      line({ materialId: 'paper', issued: 5 }),
      line({ materialId: 'pens', issued: 2 }),
      line({ materialId: 'ram', trackingType: 'SERIAL', issued: 2, units: [{ id: 'u1', serialNumber: 'A' }, { id: 'u2', serialNumber: 'B' }] }),
      line({ materialId: 'ssd', trackingType: 'SERIAL', issued: 1, units: [{ id: 'u3', serialNumber: 'C' }] }),
    ];
    const payload = returnPayload(lines, { paper: 2, pens: 0 }, new Set(['u2']), '  ไม่ตรงสเปก ');
    expect(payload).toEqual({
      note: 'ไม่ตรงสเปก',
      items: [
        { materialId: 'paper', quantity: 2 },
        { materialId: 'ram', quantity: 1, units: [{ unitId: 'u2' }] },
      ],
    });
  });
});
