import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ageCheckOutcome,
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

async function runAgeCLI(metadata: unknown, requestApproval: boolean) {
  const directory = mkdtempSync(join(tmpdir(), 'bugpin age approval-'));
  directories.push(directory);
  await Bun.write(join(directory, 'bun.lock'), lockfile('example@1.0.0'));
  await Bun.write(join(directory, 'ee/bun.lock'), lockfile('example@2.0.0'));
  const output = join(directory, 'output');
  await Bun.write(output, 'existing=value\n');
  const preload = join(directory, 'registry.ts');
  await Bun.write(
    preload,
    `globalThis.fetch = async () => Response.json(${JSON.stringify(metadata)});`
  );
  const script = new URL('../../src/server/scripts/check-dependency-age.ts', import.meta.url);
  const child = Bun.spawn(
    [
      process.execPath,
      '--preload',
      preload,
      decodeURIComponent(script.pathname),
      ...(requestApproval ? ['--request-approval'] : []),
    ],
    {
      cwd: directory,
      env: { ...process.env, GITHUB_OUTPUT: output },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr, output: await Bun.file(output).text() };
}

test('only verified young releases are eligible for admin approval', () => {
  expect(ageCheckOutcome([])).toBe('passed');
  expect(ageCheckOutcome([{ kind: 'age', message: 'young' }])).toBe('approval-required');
  expect(ageCheckOutcome([{ kind: 'validation', message: 'invalid' }])).toBe('failed');
  expect(
    ageCheckOutcome([
      { kind: 'age', message: 'young' },
      { kind: 'validation', message: 'invalid' },
    ])
  ).toBe('failed');
  const future = checkReleaseTimes(
    'example',
    new Set(['1.0.0']),
    { time: { '1.0.0': '2026-10-25T00:00:00Z' } },
    now
  );
  expect(ageCheckOutcome(future)).toBe('failed');
});

test('strict mode blocks young EE releases while CI mode requests approval for them', async () => {
  const metadata = { time: { '1.0.0': '2026-01-01T00:00:00Z', '2.0.0': new Date().toISOString() } };
  const strict = await runAgeCLI(metadata, false);
  expect(strict.exitCode).toBe(1);
  expect(strict.stderr).toContain('example@2.0.0:');
  expect(strict.output).toBe('existing=value\n');
  const pending = await runAgeCLI(metadata, true);
  expect(pending.exitCode).toBe(0);
  expect(pending.output).toBe('existing=value\napproval_required=true\n');
});

test('CI mode requires no approval for mature versions but cannot waive invalid metadata', async () => {
  const mature = await runAgeCLI(
    { time: { '1.0.0': '2026-01-01T00:00:00Z', '2.0.0': '2026-01-01T00:00:00Z' } },
    true
  );
  expect(mature.exitCode).toBe(0);
  expect(mature.output).toContain('approval_required=false');
  for (const metadata of [
    { time: { '1.0.0': '2026-01-01T00:00:00Z' } },
    { time: { '1.0.0': 'invalid', '2.0.0': new Date().toISOString() } },
    {
      time: {
        '1.0.0': '2026-01-01T00:00:00Z',
        '2.0.0': new Date(Date.now() + 60_000).toISOString(),
      },
    },
  ]) {
    const invalid = await runAgeCLI(metadata, true);
    expect(invalid.exitCode).toBe(1);
    expect(invalid.output).not.toContain('approval_required=');
  }
});

test('workflow enforcement cannot pass on rejected, missing, canceled, or skipped approvals', async () => {
  const policy = Bun.YAML.parse(
    await Bun.file(
      new URL('../../.github/workflows/dependency-age-policy.yml', import.meta.url)
    ).text()
  ) as {
    jobs: {
      enforce: { steps: Array<{ run: string }> };
      'approve-young-releases': { environment: string; if: string; needs: string };
    };
  };
  expect(policy.jobs['approve-young-releases'].environment).toBe('dependency-age-override');
  expect(policy.jobs['approve-young-releases'].needs).toBe('validate');
  expect(policy.jobs['approve-young-releases'].if).toBe(
    "needs.validate.outputs.approval_required == 'true'"
  );
  for (const [validation, required, approval, expected] of [
    ['success', 'false', 'skipped', 0],
    ['success', 'true', 'success', 0],
    ['failure', 'true', 'success', 1],
    ['success', 'true', 'failure', 1],
    ['success', 'true', 'cancelled', 1],
    ['success', 'true', 'skipped', 1],
    ['success', '', 'skipped', 1],
  ] as const) {
    const child = Bun.spawn(['bash', '-e', '-c', policy.jobs.enforce.steps[0].run], {
      env: {
        ...process.env,
        VALIDATION_RESULT: validation,
        APPROVAL_REQUIRED: required,
        APPROVAL_RESULT: approval,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await child.exited).toBe(expected);
  }
});

test('PR and Docker workflows share the age policy without skipping build validation', async () => {
  const read = async (name: string) =>
    Bun.YAML.parse(
      await Bun.file(new URL(`../../.github/workflows/${name}`, import.meta.url)).text()
    ) as {
      jobs: Record<
        string,
        { uses?: string; needs?: string; if?: string; steps?: Array<{ run?: string }> }
      >;
    };
  const pr = await read('dependency-age.yml');
  const docker = await read('docker-publish.yml');
  expect(pr.jobs['age-policy'].uses).toBe('./.github/workflows/dependency-age-policy.yml');
  expect(docker.jobs['age-policy'].uses).toBe(pr.jobs['age-policy'].uses);
  expect(pr.jobs['dependency-age'].needs).toBe('age-policy');
  expect(pr.jobs['dependency-age'].if).toBe('${{ always() }}');
  expect(docker.jobs['build-and-push'].needs).toBe('age-policy');
  expect(
    docker.jobs['build-and-push'].steps?.some(
      (step) => step.run === 'bun install --frozen-lockfile'
    )
  ).toBe(true);
  expect(
    docker.jobs['build-and-push'].steps?.some(
      (step) => step.run?.includes('bun run typecheck') && step.run?.includes('bun run test')
    )
  ).toBe(true);
});

test('approval protection fails when the environment is unavailable or a reviewer is not an admin', async () => {
  const policy = Bun.YAML.parse(
    await Bun.file(
      new URL('../../.github/workflows/dependency-age-policy.yml', import.meta.url)
    ).text()
  ) as {
    jobs: { validate: { steps: Array<{ name?: string; run?: string; if?: string }> } };
  };
  const guard = policy.jobs.validate.steps.find(
    (step) => step.name === 'Verify admin approval protection'
  );
  expect(guard?.if).toBe("steps.age.outputs.approval_required == 'true'");
  if (!guard?.run) throw new Error('Missing approval protection verification');
  const directory = mkdtempSync(join(tmpdir(), 'bugpin approval protection-'));
  directories.push(directory);
  const gh = join(directory, 'gh');
  await Bun.write(
    gh,
    `#!/bin/sh
case "$2" in
  */environments/*)
    if [ "$MOCK_ENVIRONMENT" = missing ]; then exit 1; fi
    echo admin-user
    ;;
  *) echo "$MOCK_PERMISSION" ;;
esac
`
  );
  chmodSync(gh, 0o755);
  for (const [environment, permission, expected] of [
    ['present', 'admin', 0],
    ['missing', 'admin', 1],
    ['present', 'write', 1],
  ] as const) {
    const child = Bun.spawn(['bash', '-e', '-c', guard.run], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_REPOSITORY: 'aranticlabs/bugpin',
        MOCK_ENVIRONMENT: environment,
        MOCK_PERMISSION: permission,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(expected);
  }
});

test('accepts a release at exactly 72 hours and rejects it one millisecond earlier', () => {
  const metadata = { time: { '1.0.0': '2026-10-21T12:00:00Z' } };
  expect(checkReleaseTimes('example', new Set(['1.0.0']), metadata, now)).toEqual([]);
  expect(checkReleaseTimes('example', new Set(['1.0.0']), metadata, now - 1)).toEqual([
    {
      kind: 'age',
      message:
        'example@1.0.0: published 2026-10-21T12:00:00Z; eligible at 2026-10-24T12:00:00.000Z',
    },
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
  expect(issues[0].message).toStartWith('example@1.1.0:');
});

test('fails closed for missing or malformed registry timestamps', () => {
  for (const metadata of [null, {}, { time: null }, { time: { '1.0.0': 'invalid' } }]) {
    expect(checkReleaseTimes('example', new Set(['1.0.0']), metadata, now)).toEqual([
      { kind: 'validation', message: 'example@1.0.0: missing or invalid publication timestamp' },
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
    await Bun.file(
      new URL('../../.github/workflows/dependency-age-policy.yml', import.meta.url)
    ).text()
  ) as {
    jobs: {
      validate: {
        steps: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }>;
      };
    };
  };
  const steps = workflow.jobs.validate.steps;
  const checkout = steps.findIndex((step) => step.with?.repository === 'aranticlabs/bugpin-ee');
  const check = steps.findIndex((step) =>
    step.run?.includes('bun run check:dependency-age --request-approval')
  );
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
  expect(issues[0].message).toStartWith('example@1.1.0:');
  expect(issues[1]).toEqual({ kind: 'validation', message: 'unavailable: Registry unavailable' });
});
