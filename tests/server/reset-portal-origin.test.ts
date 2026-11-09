import { expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('refuses portal origin recovery when no database exists without creating one', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bugpin-origin-recovery-'));
  try {
    const result = Bun.spawnSync(['bun', 'run', 'reset-portal-origin'], {
      env: { ...process.env, NODE_ENV: 'test', DATA_DIR: directory },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain('No existing BugPin database found');
    expect(existsSync(join(directory, 'bugpin.db'))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
