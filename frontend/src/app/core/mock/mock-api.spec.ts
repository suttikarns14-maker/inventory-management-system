import { MemoryStore } from './mock-db';
import { MockApi, MockRequest } from './mock-api';
import { createSeedData } from './mock-seed';

// The UI trusts these rules, so they get a check. The real ones are re-tested against the BE in Part 2.

function setup(as: 'admin' | 'staff' | 'user' | null = 'admin') {
  const store = new MemoryStore(createSeedData(new Date('2026-09-28T10:00:00+07:00')));
  store.session = as ? `user-${as}` : null;
  const api = new MockApi(store);
  const call = (method: string, path: string, body?: unknown, query = '') =>
    api.handle({
      method,
      path: `/api/v1${path}`,
      query: new URLSearchParams(query),
      body,
    } satisfies MockRequest) as { status: number; body: any };
  const material = (code: string) => store.data.materials.find((m) => m.code === code)!;
  return { store, call, material };
}

describe('MockApi', () => {
  it('seed data is consistent: stock = IN - OUT and never negative', () => {
    const { store } = setup();
    for (const m of store.data.materials) {
      const net = store.data.transactions
        .flatMap((t) => t.items.filter((i) => i.materialId === m.id).map((i) => (t.type === 'IN' ? i.quantity : -i.quantity)))
        .reduce((a, b) => a + b, 0);
      expect(m.currentQuantity).toBe(net);
      expect(m.currentQuantity).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(store.data.transactions.map((t) => t.referenceNo)).size).toBe(store.data.transactions.length);
  });

  it('logs in by username (case-insensitive) and rejects wrong passwords', () => {
    const { call, store } = setup(null);
    expect(call('POST', '/auth/login', { username: 'ADMIN', password: 'password123' }).status).toBe(200);
    expect(store.session).toBe('user-admin');
    const wrong = call('POST', '/auth/login', { username: 'admin', password: 'Password123' });
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(call('POST', '/auth/login', { username: 'former', password: 'password123' }).body.error.code).toBe('USER_INACTIVE');
  });

  it('validates new usernames and rejects duplicates in any letter case', () => {
    const { call } = setup('admin');
    const base = { fullName: 'ทดสอบ', role: 'USER', password: 'P@ssw0rd' };
    expect(call('POST', '/users', { ...base, username: 'new.user_1' }).status).toBe(201);
    expect(call('POST', '/users', { ...base, username: 'New.User_1' }).status).toBe(409);
    const bad = call('POST', '/users', { ...base, username: 'มี เว้นวรรค' });
    expect(bad.body.error.details[0].field).toBe('username');
  });

  it('rejects unauthenticated requests', () => {
    const { call } = setup(null);
    expect(call('GET', '/materials').status).toBe(401);
    expect(call('GET', '/auth/me').body.error.code).toBe('UNAUTHORIZED');
  });

  it('withdraws stock and returns a reference number', () => {
    const { call, material } = setup('user');
    const paper = material('OFF-001');
    const before = paper.currentQuantity;
    const res = call('POST', '/inventory/transactions', {
      type: 'OUT',
      items: [{ materialId: paper.id, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.referenceNo).toMatch(/^TXN-\d{8}-\d{3,}$/);
    expect(paper.currentQuantity).toBe(before - 1);
  });

  it('is all-or-nothing when one line exceeds stock', () => {
    const { call, material } = setup('staff');
    const paper = material('OFF-001');
    const pens = material('OFF-002');
    const [p0, q0] = [paper.currentQuantity, pens.currentQuantity];
    const res = call('POST', '/inventory/transactions', {
      type: 'OUT',
      items: [
        { materialId: paper.id, quantity: 1 },
        { materialId: pens.id, quantity: q0 + 1 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect([paper.currentQuantity, pens.currentQuantity]).toEqual([p0, q0]);
  });

  it('validates quantities and duplicate lines', () => {
    const { call, material } = setup('staff');
    const id = material('OFF-001').id;
    const negative = call('POST', '/inventory/transactions', { type: 'IN', items: [{ materialId: id, quantity: -5 }] });
    expect(negative.body.error.code).toBe('VALIDATION_ERROR');
    expect(negative.body.error.details[0].field).toBe('items.0.quantity');
    const dup = call('POST', '/inventory/transactions', {
      type: 'IN',
      items: [
        { materialId: id, quantity: 1 },
        { materialId: id, quantity: 1 },
      ],
    });
    expect(dup.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces role permissions', () => {
    const { call, material } = setup('user');
    const id = material('OFF-001').id;
    expect(call('POST', '/inventory/transactions', { type: 'IN', items: [{ materialId: id, quantity: 1 }] }).status).toBe(403);
    expect(call('GET', '/dashboard/summary').status).toBe(403);
    expect(call('POST', '/materials', {}).status).toBe(403);
    expect(call('GET', '/users').status).toBe(403);
  });

  it('shows USER only their own history', () => {
    const { call } = setup('user');
    const res = call('GET', '/inventory/history', undefined, 'limit=100');
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((t: any) => t.createdBy.id === 'user-user')).toBe(true);
  });

  it('reverses a transaction exactly once and restores stock', () => {
    const { call, material } = setup('admin');
    const paper = material('OFF-001');
    const before = paper.currentQuantity;
    const txn = call('POST', '/inventory/transactions', {
      type: 'OUT',
      items: [{ materialId: paper.id, quantity: 2 }],
    }).body.data;
    const reversal = call('POST', `/inventory/transactions/${txn.id}/reverse`, { note: 'ทดสอบ' });
    expect(reversal.status).toBe(201);
    expect(reversal.body.data.type).toBe('IN');
    expect(paper.currentQuantity).toBe(before);
    expect(call('POST', `/inventory/transactions/${txn.id}/reverse`, { note: 'ซ้ำ' }).body.error.code).toBe('ALREADY_REVERSED');
  });

  it('never changes stock through the material form and rejects duplicate codes', () => {
    const { call, material } = setup('admin');
    const paper = material('OFF-001');
    const before = paper.currentQuantity;
    const res = call('PUT', `/materials/${paper.id}`, {
      code: 'OFF-001',
      name: paper.name,
      categoryId: paper.categoryId,
      unit: paper.unit,
      minStock: 5,
      location: null,
      status: 'ACTIVE',
      currentQuantity: 9999,
    });
    expect(res.status).toBe(200);
    expect(paper.currentQuantity).toBe(before);
    const dup = call('PUT', `/materials/${paper.id}`, { ...res.body.data, code: 'OFF-002', location: null });
    expect(dup.status).toBe(409);
  });

  it('lists out-of-stock materials first in reorder suggestions', () => {
    const { call } = setup('staff');
    const list = call('GET', '/dashboard/reorder-suggestions').body.data;
    expect(list.length).toBeGreaterThan(0);
    const firstNonZero = list.findIndex((r: any) => r.currentQuantity > 0);
    expect(list.slice(firstNonZero === -1 ? list.length : firstNonZero).every((r: any) => r.currentQuantity > 0)).toBe(true);
  });
});
