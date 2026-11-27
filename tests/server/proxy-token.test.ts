import { expect, it } from 'bun:test';
import { resolve } from 'node:path';

it('verifies proxy tokens and the full application gate in an isolated process', async () => {
  const child = Bun.spawn(
    [process.execPath, 'test', resolve(import.meta.dir, '../fixtures/proxy-token-cases.ts')],
    {
      env: { ...process.env, NODE_ENV: 'test' },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, stdout + stderr).toBe(0);
}, 15000);
