import { expect, test } from 'bun:test';
import { resolve } from 'node:path';

test('request bounds preserve legacy limits and the authenticated message exception', async () => {
  const child = Bun.spawn(
    [process.execPath, 'test', resolve(import.meta.dir, '../fixtures/request-body-limits.test.ts')],
    { env: { ...process.env, NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe' }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, stdout + stderr).toBe(0);
});
