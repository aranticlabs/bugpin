import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkDependencyAge,
  checkReleaseTimes,
  readLockedPackages,
} from '../../src/server/scripts/check-dependency-age';

const now = Date.parse('2026-10-24T12:00:00Z');
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function lockfile(...specs: string[]): string {
  return JSON.stringify({
    lockfileVersion: 1,
    packages: Object.fromEntries(specs.map((spec, index) => [`entry-${index}`, [spec, '', {}]])),
  });
}

test('accepts a release at exactly 72 hours and rejects it one millisecond earlier', () => {
  const metadata = { time: { '1.0.0': '2026-10-21T12:00:00Z' } };
  expect(checkReleaseTimes('example', new Set(['1.0.0']), metadata, now)).toEqual([]);
  expect(checkReleaseTimes('example', new Set(['1.0.0']), metadata, now - 1)).toEqual([
    'example@1.0.0: published 2026-10-21T12:00:00Z; eligible at 2026-10-24T12:00:00.000Z',
  ]);
});

test('rejects future releases and checks each locked version independently', () => {
  const issues = checkReleaseTimes(
    'example',
    new Set(['1.0.0', '1.1.0']),
    { time: { '1.0.0': '2026-10-01T00:00:00Z', '1.1.0': '2026-10-25T00:00:00Z' } },
    now
  );
  expect(issues).toHaveLength(1);
  expect(issues[0]).toStartWith('example@1.1.0:');
});

test('fails closed for missing or malformed registry timestamps', () => {
  for (const metadata of [null, {}, { time: null }, { time: { '1.0.0': 'invalid' } }]) {
    expect(checkReleaseTimes('example', new Set(['1.0.0']), metadata, now)).toEqual([
      'example@1.0.0: missing or invalid publication timestamp',
    ]);
  }
});

test('reads JSONC locks, deduplicates nested copies, and preserves scoped and prerelease versions', () => {
  const source = `{
    "lockfileVersion": 1,
    // Nested entries may have a different key from the package name.
    "packages": {
      "example": ["example@1.0.0", "", {}],
      "parent/example": ["example@1.0.0", "", {}],
      "other/example": ["example@1.1.0", "", {}],
      "alias": ["@scope/example@2.0.0-beta.1", "", {}],
      "local": ["@bugpin/server@workspace:src/server"],
      "unscoped-local": ["local@workspace:packages/local"],
    },
  }`;
  expect([...readLockedPackages(source)]).toEqual([
    ['example', new Set(['1.0.0', '1.1.0'])],
    ['@scope/example', new Set(['2.0.0-beta.1'])],
  ]);
});

test('rejects unsupported lockfiles and unverifiable package sources', () => {
  for (const source of [
    '{}',
    '{"lockfileVersion": 2, "packages": {}}',
    '{"lockfileVersion": 1, "packages": {"example": []}}',
    lockfile(),
    lockfile('example@https://example.com/package.tgz'),
    lockfile('xlsx@https://cdn.sheetjs.com/xlsx-0.20.4/xlsx-0.20.4.tgz'),
  ]) {
    expect(() => readLockedPackages(source)).toThrow();
  }
});

test('allows only the existing pinned SheetJS tarball exemption', () => {
  expect([
    ...readLockedPackages(
      lockfile('example@1.0.0', 'xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz')
    ),
  ]).toEqual([['example', new Set(['1.0.0'])]]);
});

test('rejects external URLs containing a workspace marker instead of silently skipping them', () => {
  for (const spec of [
    'unverified@https://example.com/@workspace:payload.tgz',
    '@scope/unverified@https://example.com/@workspace:payload.tgz',
  ]) {
    expect(() => readLockedPackages(lockfile('safe@1.0.0', spec))).toThrow(
      `Cannot verify publication age for ${spec}`
    );
  }
});

test('the default CLI requires the EE lockfile before querying the registry', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bugpin dependency age cli-'));
  directories.push(directory);
  await Bun.write(join(directory, 'bun.lock'), lockfile('example@1.0.0'));
  const script = new URL('../../src/server/scripts/check-dependency-age.ts', import.meta.url);
  const child = Bun.spawn([process.execPath, decodeURIComponent(script.pathname)], {
    cwd: directory,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode).toBe(1);
  expect(stderr).toContain('ee/bun.lock');
  expect(stdout).not.toContain('Checked');
});

test('the required PR job checks both locks and checks out EE at the recorded submodule revision', async () => {
  const manifest = await Bun.file(new URL('../../package.json', import.meta.url)).json();
  const command: string = manifest.scripts['check:dependency-age'];
  expect(command.split(/\s+/)).toContain('bun.lock');
  expect(command.split(/\s+/)).toContain('ee/bun.lock');
  const workflow = Bun.YAML.parse(
    await Bun.file(new URL('../../.github/workflows/dependency-age.yml', import.meta.url)).text()
  ) as {
    jobs: {
      'dependency-age': {
        steps: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }>;
      };
    };
  };
  const steps = workflow.jobs['dependency-age'].steps;
  const checkout = steps.findIndex((step) => step.with?.repository === 'aranticlabs/bugpin-ee');
  const check = steps.findIndex((step) => step.run === 'bun run check:dependency-age');
  expect(checkout).toBeGreaterThan(-1);
  expect(check).toBeGreaterThan(checkout);
  expect(steps[checkout].with?.ref).toBe('${{ steps.ee-revision.outputs.sha }}');
  expect(steps[checkout].with?.['persist-credentials']).toBe(false);
  expect(steps.some((step) => step.run?.includes('git rev-parse HEAD:ee'))).toBe(true);
});

test('merges lockfiles and reports registry failures without skipping remaining packages', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'bugpin dependency age-'));
  directories.push(directory);
  const first = join(directory, 'bun.lock');
  const second = join(directory, 'ee.lock');
  await Bun.write(first, lockfile('example@1.0.0', 'unavailable@1.0.0'));
  await Bun.write(second, lockfile('example@1.1.0', 'other@1.0.0'));
  const requested: string[] = [];
  const issues = await checkDependencyAge(
    [first, second],
    async (name) => {
      requested.push(name);
      if (name === 'unavailable') throw new Error('Registry unavailable');
      return { time: { '1.0.0': '2026-10-01T00:00:00Z', '1.1.0': '2026-10-24T00:00:00Z' } };
    },
    now
  );
  expect(requested.sort()).toEqual(['example', 'other', 'unavailable']);
  expect(issues).toHaveLength(2);
  expect(issues[0]).toStartWith('example@1.1.0:');
  expect(issues[1]).toBe('unavailable: Registry unavailable');
});
