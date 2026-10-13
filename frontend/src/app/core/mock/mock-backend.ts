import { Injectable } from '@angular/core';
import { LocalStorageStore } from './mock-db';
import { MockApi } from './mock-api';
import { createSeedData } from './mock-seed';

/**
 * true  = in-browser mock API (no back-end needed, data in localStorage).
 * false = real back-end: `ng serve` proxies /api to localhost:3000 (proxy.conf.json).
 */
export const USE_MOCK_API = false;

@Injectable({ providedIn: 'root' })
export class MockBackend {
  private readonly store = new LocalStorageStore(() => createSeedData());
  readonly api = new MockApi(this.store);

  /** Restores the sample data. The session survives because seeded user ids are stable. */
  reset(): void {
    this.store.reset();
  }
}
