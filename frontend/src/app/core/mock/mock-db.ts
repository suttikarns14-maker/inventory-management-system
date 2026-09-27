import { Role } from '../../shared/models/user';
import { MaterialStatus } from '../../shared/models/material';
import { TransactionType } from '../../shared/models/transaction';

// Row shapes mirror the Prisma schema (spec §3). They are what a real DB would hold,
// not what the API returns — the API serializes them (see mock-api.ts).

export interface UserRow {
  id: string;
  username: string;
  password: string; // ponytail: plain text, mock only. The real BE stores a bcrypt hash.
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialRow {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  unit: string;
  currentQuantity: number;
  minStock: number;
  location: string | null;
  status: MaterialStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionItemRow {
  id: string;
  materialId: string;
  quantity: number;
  unitPrice: string | null;
}

export interface TransactionRow {
  id: string;
  type: TransactionType;
  referenceNo: string;
  createdById: string;
  note: string | null;
  reversalOfId: string | null;
  createdAt: string;
  items: TransactionItemRow[];
}

export interface MockData {
  users: UserRow[];
  categories: CategoryRow[];
  materials: MaterialRow[];
  transactions: TransactionRow[];
  /** YYYYMMDD -> last sequence number used (ReferenceCounter). */
  counters: Record<string, number>;
}

/** Persistence for the mock backend. `session` plays the role of the auth cookie. */
export interface MockStore {
  data: MockData;
  session: string | null;
  save(): void;
}

export class MemoryStore implements MockStore {
  session: string | null = null;
  constructor(public data: MockData) {}
  save(): void {}
}

// Bump the version whenever the row shape changes so old browser data is replaced by a fresh seed.
const DATA_KEY = 'ims-mock-data-v2'; // v2: email -> username
const SESSION_KEY = 'ims-mock-session';

export class LocalStorageStore implements MockStore {
  data: MockData;

  constructor(private seed: () => MockData) {
    this.data = this.read() ?? this.fresh();
  }

  get session(): string | null {
    return localStorage.getItem(SESSION_KEY);
  }

  set session(id: string | null) {
    if (id) localStorage.setItem(SESSION_KEY, id);
    else localStorage.removeItem(SESSION_KEY);
  }

  save(): void {
    localStorage.setItem(DATA_KEY, JSON.stringify(this.data));
  }

  reset(): void {
    this.data = this.fresh();
  }

  private fresh(): MockData {
    const data = this.seed();
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return data;
  }

  private read(): MockData | null {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      return raw ? (JSON.parse(raw) as MockData) : null;
    } catch {
      return null;
    }
  }
}
