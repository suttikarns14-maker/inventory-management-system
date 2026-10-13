import 'dotenv/config';
import { defineConfig } from 'vitest/config';

const testDb = process.env['TEST_DATABASE_URL'];
if (!testDb) throw new Error('TEST_DATABASE_URL is not set in .env');

export default defineConfig({
  test: {
    // Tests run against a separate database and must never touch real data.
    env: { DATABASE_URL: testDb, NODE_ENV: 'test' },
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
