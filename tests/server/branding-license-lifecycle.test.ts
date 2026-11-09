import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { isEEAvailable } from '../../src/server/utils/ee';

test('inactive branding uses defaults and renewal restores saved customization across assets and emails', async () => {
  const child = Bun.spawn(
    [process.execPath, resolve(import.meta.dir, '../fixtures/branding-license-lifecycle.ts')],
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
  expect(stdout).toContain('PASS branding lifecycle');
});
