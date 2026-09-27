import { Injectable } from '@angular/core';
import { LocalStorageStore } from './mock-db';
import { MockApi } from './mock-api';
import { createSeedData } from './mock-seed';

/**
 * Part 1 runs the whole app against an in-browser mock of the API.
 * Part 2: set to false and `ng serve` proxies /api to the real back-end (proxy.conf.json).
 */
export const USE_MOCK_API = true;

@Injectable({ providedIn: 'root' })
export class MockBackend {
  private readonly store = new LocalStorageStore(() => createSeedData());
  readonly api = new MockApi(this.store);

  /** Restores the sample data. The session survives because seeded user ids are stable. */
  reset(): void {
    this.store.reset();
  }
}
