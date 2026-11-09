import { expect, it } from 'bun:test';
import { resolve } from 'node:path';

it('validates bootstrap and configured-origin writes through the real development proxy in isolation', () => {
  const result = Bun.spawnSync(
    [process.execPath, 'test', resolve(import.meta.dir, '../fixtures/dev-proxy.test.ts')],
    { env: { ...process.env, NODE_ENV: 'test' }, timeout: 25000 }
  );
  expect(result.exitCode, result.stdout.toString() + result.stderr.toString()).toBe(0);
}, 30000);
