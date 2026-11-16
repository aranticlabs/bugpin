import { describe, expect, it } from 'bun:test';
import { resolve } from 'path';

const WIDGET_ROOT = resolve(import.meta.dir, '../..');
const SOURCE_GLOB = new Bun.Glob('**/*.{ts,tsx,css}');
const IGNORED_PREFIXES = ['node_modules/', 'dist/', 'tests/'];
const REM_LENGTH = /\d(?:\.\d+)?rem\b/;

describe('widget sizing', () => {
  it('uses no rem lengths, which would scale with the host page root font size', async () => {
    const offenders: string[] = [];

    for await (const path of SOURCE_GLOB.scan({ cwd: WIDGET_ROOT })) {
      if (IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;

      const lines = (await Bun.file(resolve(WIDGET_ROOT, path)).text()).split('\n');
      lines.forEach((line, index) => {
        if (REM_LENGTH.test(line)) offenders.push(`${path}:${index + 1}: ${line.trim()}`);
      });
    }

    expect(offenders).toEqual([]);
  });

  it('pins the Tailwind length tokens in px', async () => {
    const css = await Bun.file(resolve(WIDGET_ROOT, 'styles/main.css')).text();

    expect(css).toMatch(/--spacing:\s*4px\s*;/);
    expect(css).toMatch(/--text-sm:\s*14px\s*;/);
    expect(css).toMatch(/--container-4xl:\s*896px\s*;/);
    expect(css).toMatch(/--radius:\s*4px\s*;/);
  });
});
