import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ageCheckOutcome,
  checkDependencyAge,
  checkReleaseTimes,
  dependencyAgeSummary,
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

async function runAgeCLI(
  metadata: unknown,
  requestApproval: boolean,
  eeSpecs = ['example@2.0.0'],
  registrySource?: string
) {
  const directory = mkdtempSync(join(tmpdir(), 'bugpin age approval-'));
  directories.push(directory);
  await Bun.write(join(directory, 'bun.lock'), lockfile('example@1.0.0'));
  await Bun.write(join(directory, 'ee/bun.lock'), lockfile(...eeSpecs));
  const output = join(directory, 'output');
  await Bun.write(output, 'existing=value\n');
  const summary = join(directory, 'summary');
  await Bun.write(summary, 'CE and EE revisions\n');
  const preload = join(directory, 'registry.ts');
  await Bun.write(
    preload,
    registrySource ?? `globalThis.fetch = async () => Response.json(${JSON.stringify(metadata)});`
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
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return {
    exitCode,
    stdout,
    stderr,
    output: await Bun.file(output).text(),
    summary: await Bun.file(summary).text(),
  };
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

test('registry retries recover from throttling, server errors, and network timeouts', async () => {
  for (const failure of ['429', '503', 'timeout']) {
    const result = await runAgeCLI(
      {},
      true,
      undefined,
      `
      let calls = 0;
      globalThis.fetch = async () => {
        console.error('registry-request');
        if (++calls === 1) {
          ${failure === 'timeout' ? "throw new DOMException('Timed out', 'TimeoutError');" : `return new Response('', { status: ${failure} });`}
        }
        return Response.json({ time: { '1.0.0': '2026-01-01T00:00:00Z', '2.0.0': '2026-01-01T00:00:00Z' } });
      };
    `
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr.match(/registry-request/g)).toHaveLength(2);
    expect(result.output).toContain('approval_required=false');
  }
});

test('429 retries honor bounded Retry-After seconds and HTTP dates, otherwise using backoff', async () => {
  for (const [status, header, delay] of [
    [429, '2', 2000],
    [429, '0', 0],
    [429, '3600', 30_000],
    [429, 'Sat, 24 Oct 2026 12:00:07 GMT', 7000],
    [429, 'Sun, 25 Oct 2026 12:00:00 GMT', 30_000],
    [429, 'Fri, 23 Oct 2026 12:00:00 GMT', 0],
    [429, '', 250],
    [429, 'invalid', 250],
    [429, '-1', 250],
    [503, '2', 250],
  ] as const) {
    const result = await runAgeCLI(
      {},
      true,
      undefined,
      `
      Date.now = () => Date.parse('2026-10-24T12:00:00Z');
      Bun.sleep = async (delay) => console.error('retry-delay=' + delay);
      let calls = 0;
      globalThis.fetch = async () => {
        if (++calls === 1) return new Response('', {
          status: ${status}, headers: { 'Retry-After': ${JSON.stringify(header)} }
        });
        return Response.json({ time: { '1.0.0': '2026-01-01T00:00:00Z', '2.0.0': '2026-01-01T00:00:00Z' } });
      };
    `
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr.trim()).toBe('retry-delay=' + delay);
    expect(result.output).toContain('approval_required=false');
  }
});

test('exhausted retries and permanent registry failures still block approval', async () => {
  for (const [status, requests] of [
    [503, 3],
    [429, 3],
    ['timeout', 3],
    ['invalid-json', 1],
    [404, 1],
    [403, 1],
  ] as const) {
    const result = await runAgeCLI(
      {},
      true,
      undefined,
      `
      globalThis.fetch = async () => {
        console.error('registry-request');
        ${status === 'timeout' ? "throw new DOMException('Timed out', 'TimeoutError');" : status === 'invalid-json' ? "return new Response('invalid-json');" : `return new Response('', { status: ${status} });`}
      };
    `
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.match(/registry-request/g)).toHaveLength(requests);
    expect(result.output).not.toContain('approval_required=');
    expect(result.summary).toBe('CE and EE revisions\n');
  }
});

test('EE revision lookup stops before emitting an output when Git fails', async () => {
  const policy = Bun.YAML.parse(
    await Bun.file(
      new URL('../../.github/workflows/dependency-age-policy.yml', import.meta.url)
    ).text()
  ) as { jobs: { validate: { steps: Array<{ name?: string; run?: string }> } } };
  const step = policy.jobs.validate.steps.find(
    (step) => step.name === 'Resolve pinned EE revision'
  );
  if (!step?.run) throw new Error('Missing EE revision lookup');
  const directory = mkdtempSync(join(tmpdir(), 'bugpin ee revision-'));
  directories.push(directory);
  for (const [cwd, expected] of [
    [decodeURIComponent(new URL('../../', import.meta.url).pathname), 0],
    [directory, 1],
  ] as const) {
    const output = join(directory, 'revision');
    await Bun.write(output, '');
    const child = Bun.spawn(['bash', '-e', '-c', step.run], {
      cwd,
      env: { ...process.env, GITHUB_OUTPUT: output },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (expected === 0) {
      expect(code).toBe(0);
      expect(await Bun.file(output).text()).toMatch(/^sha=[a-f0-9]{40}\n$/);
    } else {
      expect(code).not.toBe(0);
      expect(await Bun.file(output).text()).toBe('');
    }
  }
});

test('strict mode blocks young EE releases while CI mode requests approval for them', async () => {
  const metadata = { time: { '1.0.0': '2026-01-01T00:00:00Z', '2.0.0': new Date().toISOString() } };
  const strict = await runAgeCLI(metadata, false);
  expect(strict.exitCode).toBe(1);
  expect(strict.stderr).toContain('example@2.0.0:');
  expect(strict.output).toBe('existing=value\n');
  const pending = await runAgeCLI(metadata, true);
  expect(pending.exitCode).toBe(0);
  expect(pending.output).toContain('approval_required=true');
  expect(pending.summary).toContain('| [example]');
  expect(pending.summary).toContain('| 2.0.0 |');
  expect(pending.summary).toContain('**Review deployments**');
  expect(pending.summary).toContain('only to this run and revision');
});

test('CI mode requires no approval for mature versions but cannot waive invalid metadata', async () => {
  const mature = await runAgeCLI(
    { time: { '1.0.0': '2026-01-01T00:00:00Z', '2.0.0': '2026-01-01T00:00:00Z' } },
    true
  );
  expect(mature.exitCode).toBe(0);
  expect(mature.output).toContain('approval_required=false');
  expect(mature.summary).toContain('No npm releases younger than 72 hours.');
  expect(mature.summary).not.toContain('**Review deployments**');
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

test('approval summaries include every young version, including scoped packages', async () => {
  const pending = await runAgeCLI(
    { time: { '1.0.0': '2026-01-01T00:00:00Z', '1.4.4': new Date().toISOString() } },
    true,
    ['@types/bun@1.4.4', 'bun-types@1.4.4']
  );
  expect(pending.exitCode).toBe(0);
  expect(pending.summary).toContain('[@types/bun]');
  expect(pending.summary).toContain('[bun-types]');
  expect(pending.summary.match(/\| 1\.4\.4 \|/g)).toHaveLength(2);
  expect(pending.stderr).toContain('published ');
  expect(pending.stderr).toContain('eligible at ');
  expect(pending.summary).toContain('[@types/bun](');
  expect(pending.summary).toContain('[bun-types](');
  expect(pending.summary).not.toContain('example');
});

test('age report shows exact release details and escapes registry descriptions', () => {
  const issues = checkReleaseTimes(
    '@types/bun',
    new Set(['1.4.4']),
    {
      time: { '1.4.4': '2026-10-23T00:00:00Z' },
      versions: { '1.4.4': { description: 'Bun types | <details>\n[link]' } },
    },
    now
  );
  const summary = dependencyAgeSummary(issues);
  expect(summary).toContain('https://www.npmjs.com/package/%40types%2Fbun/v/1.4.4');
  expect(summary).toContain(
    '| 1.4.4 | Bun types &#124; &#60;details&#62; &#91;link&#93; | 36.0 h |'
  );
  expect(summary).toContain('2026-10-23T00:00:00.000Z');
  expect(summary).toContain('2026-10-26T00:00:00.000Z');
  expect(dependencyAgeSummary([])).toBe('No npm releases younger than 72 hours.\n');
});

test('workflow enforcement cannot pass on rejected, missing, canceled, or skipped approvals', async () => {
  const policy = Bun.YAML.parse(
    await Bun.file(
      new URL('../../.github/workflows/dependency-age-policy.yml', import.meta.url)
    ).text()
  ) as {
    jobs: {
      validate: { name: string };
      enforce: { name: string; needs: string[]; if: string; steps: Array<{ run: string }> };
      'approve-young-releases': {
        name: string;
        environment: { name: string; url: string };
        if: string;
        needs: string;
      };
    };
  };
  expect(policy.jobs.validate.name).toBe('Check dependency ages');
  expect(policy.jobs.enforce.name).toBe('Dependency policy');
  expect(policy.jobs.enforce.needs).toEqual(['validate', 'approve-young-releases']);
  expect(policy.jobs.enforce.if).toBe('${{ always() }}');
  expect(policy.jobs['approve-young-releases'].environment.name).toBe('dependency-age-override');
  expect(policy.jobs['approve-young-releases'].environment.url).toBe(
    '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}#summary'
  );
  expect(policy.jobs['approve-young-releases'].name).toBe('Approve age exception');
  expect(policy.jobs['approve-young-releases'].needs).toBe('validate');
  expect(policy.jobs['approve-young-releases'].if).toBe(
    "needs.validate.outputs.approval_required == 'true'"
  );
  const directory = mkdtempSync(join(tmpdir(), 'bugpin policy summary-'));
  directories.push(directory);
  const summary = join(directory, 'summary');
  for (const [validation, required, approval, expected, message] of [
    ['success', 'false', 'skipped', 0, 'No age exception was needed'],
    ['success', 'true', 'success', 0, 'administrator approved'],
    ['failure', 'true', 'success', 1, 'rerun failed jobs'],
    ['cancelled', 'false', 'skipped', 1, 'validation did not succeed'],
    ['skipped', 'false', 'skipped', 1, 'validation did not succeed'],
    ['success', 'true', 'failure', 1, 'Review deployments'],
    ['success', 'true', 'cancelled', 1, 'Review deployments'],
    ['success', 'true', 'skipped', 1, 'Review deployments'],
    ['success', '', 'skipped', 1, 'did not report whether approval was required'],
  ] as const) {
    await Bun.write(summary, '');
    const child = Bun.spawn(['bash', '-e', '-c', policy.jobs.enforce.steps[0].run], {
      env: {
        ...process.env,
        VALIDATION_RESULT: validation,
        APPROVAL_REQUIRED: required,
        APPROVAL_RESULT: approval,
        GITHUB_STEP_SUMMARY: summary,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(expected);
    expect(await Bun.file(summary).text()).toContain(message);
    expect(stdout.includes('::error::')).toBe(expected !== 0);
  }
});

test('PR and Docker workflows share the age policy without skipping build validation', async () => {
  const read = async (name: string) =>
    Bun.YAML.parse(
      await Bun.file(new URL(`../../.github/workflows/${name}`, import.meta.url)).text()
    ) as {
      on: { pull_request: { branches: string[] }; push: { branches: string[] } };
      jobs: Record<
        string,
        { uses?: string; needs?: string; if?: string; steps?: Array<{ run?: string }> }
      >;
    };
  const pr = await read('dependency-age.yml');
  const docker = await read('docker-publish.yml');
  expect(pr.jobs['age-policy'].uses).toBe('./.github/workflows/dependency-age-policy.yml');
  expect(docker.jobs['age-policy'].uses).toBe(pr.jobs['age-policy'].uses);
  expect(pr.on.pull_request.branches).toEqual(['main', 'dev']);
  expect(pr.on.push.branches).toEqual(['main', 'dev']);
  expect(Object.keys(pr.jobs)).toEqual(['age-policy']);
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
    printf '%s\n' "$MOCK_ENVIRONMENT" | jq -er "$4"
    ;;
  */collaborators/non-admin/permission) echo write ;;
  *) echo "$MOCK_PERMISSION" ;;
esac
`
  );
  chmodSync(gh, 0o755);
  const environmentWith = (reviewers: Array<{ type: string; reviewer: { login: string } }>) =>
    JSON.stringify({ protection_rules: [{ type: 'required_reviewers', reviewers }] });
  const admin = { type: 'User', reviewer: { login: 'admin-user' } };
  for (const [environment, permission, expected] of [
    [environmentWith([admin]), 'admin', 0],
    ['missing', 'admin', 1],
    [environmentWith([admin]), 'write', 1],
    [environmentWith([]), 'admin', 1],
    [JSON.stringify({ protection_rules: [] }), 'admin', 1],
    [environmentWith([{ type: 'Team', reviewer: { login: 'admin-team' } }]), 'admin', 1],
    [environmentWith([admin, { type: 'Team', reviewer: { login: 'admin-team' } }]), 'admin', 1],
    [environmentWith([admin, { type: 'User', reviewer: { login: 'non-admin' } }]), 'admin', 1],
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
    if (expected === 0) expect(code).toBe(0);
    else expect(code).not.toBe(0);
  }
});

test('accepts a release at exactly 72 hours and rejects it one millisecond earlier', () => {
  const metadata = { time: { '1.0.0': '2026-10-21T12:00:00Z' } };
  expect(checkReleaseTimes('example', new Set(['1.0.0']), metadata, now)).toEqual([]);
  expect(checkReleaseTimes('example', new Set(['1.0.0']), metadata, now - 1)).toMatchObject([
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

test('the full dependency check checks out EE at the recorded submodule revision', async () => {
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
    step.run?.includes('bun run src/server/scripts/check-dependency-age.ts')
  );
  expect(checkout).toBeGreaterThan(-1);
  expect(check).toBeGreaterThan(checkout);
  expect(steps[checkout].with?.ref).toBe('${{ steps.ee-revision.outputs.sha }}');
  expect(steps[checkout].with?.['persist-credentials']).toBe(false);
  expect(steps.some((step) => step.run?.includes('git rev-parse --verify HEAD:ee'))).toBe(true);
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

test('dependency scope skips code-only PRs, checks CE independently, and keeps full checks outside PRs', async () => {
  const policy = Bun.YAML.parse(
    await Bun.file(
      new URL('../../.github/workflows/dependency-age-policy.yml', import.meta.url)
    ).text()
  ) as {
    on: { workflow_call: { secrets: { EE_ACCESS_TOKEN: { required: boolean } } } };
    jobs: {
      validate: {
        outputs: { approval_required: string };
        steps: Array<{
          name: string;
          id?: string;
          run?: string;
          if?: string;
          with?: Record<string, unknown>;
        }>;
      };
    };
  };
  const { steps, outputs } = policy.jobs.validate;
  const scope = steps.find((step) => step.id === 'scope');
  if (!scope?.run) throw new Error('Missing dependency scope selection');
  expect(policy.on.workflow_call.secrets.EE_ACCESS_TOKEN.required).toBe(false);
  expect(steps[0].with?.['fetch-depth']).toBe(0);
  expect(outputs.approval_required).toBe(
    "${{ steps.scope.outputs.check == 'none' && 'false' || steps.age.outputs.approval_required }}"
  );
  for (const name of [
    'Verify EE access',
    'Resolve pinned EE revision',
    'Checkout pinned EE lockfile',
  ]) {
    expect(steps.find((step) => step.name === name)?.if).toBe("steps.scope.outputs.check == 'all'");
  }
  for (const name of ['Set up Bun', 'Test release age checks', 'Check dependency release age']) {
    expect(steps.find((step) => step.name === name)?.if).toBe(
      "steps.scope.outputs.check != 'none'"
    );
  }

  const directory = mkdtempSync(join(tmpdir(), 'bugpin dependency scope-'));
  directories.push(directory);
  await Bun.write(
    join(directory, 'git'),
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$@" >> "$GIT_ARGUMENTS"
test "$1" = diff
test "$2" = --name-only
test "$3" = base-revision
test "$4" = HEAD
test "$5" = --
if [ "$#" = 7 ]; then
  test "$6" = ee
  test "$7" = .gitmodules
  printf '%s' "$MOCK_EE_CHANGES"
else
  printf '%s' "$MOCK_CHANGES"
fi
exit "$MOCK_GIT_EXIT"
`
  );
  chmodSync(join(directory, 'git'), 0o755);
  for (const [event, changes, eeChanges, gitExit, expected] of [
    ['pull_request', '', '', '0', 'none'],
    ['pull_request', 'bun.lock', '', '0', 'ce'],
    ['pull_request', 'src/admin/package.json', '', '0', 'ce'],
    ['pull_request', '.github/workflows/dependency-age-policy.yml', '', '0', 'ce'],
    ['pull_request', 'ee', 'ee', '0', 'all'],
    ['pull_request', '.gitmodules', '.gitmodules', '0', 'all'],
    ['pull_request', 'bun.lock\nee', 'ee', '0', 'all'],
    ['pull_request', '', '', '128', 'failed'],
    ['push', '', '', '128', 'all'],
    ['workflow_dispatch', '', '', '128', 'all'],
  ] as const) {
    const output = join(directory, 'output');
    const summary = join(directory, 'summary');
    const argumentsFile = join(directory, 'arguments');
    await Promise.all([output, summary, argumentsFile].map((path) => Bun.write(path, '')));
    const child = Bun.spawn(['bash', '-e', '-c', scope.run], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GITHUB_EVENT_NAME: event,
        PR_BASE_SHA: 'base-revision',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        EE_ACCESS_TOKEN: '',
        GIT_ARGUMENTS: argumentsFile,
        MOCK_CHANGES: changes,
        MOCK_EE_CHANGES: eeChanges,
        MOCK_GIT_EXIT: gitExit,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (expected === 'failed') {
      expect(code).not.toBe(0);
      expect(await Bun.file(output).text()).toBe('');
    } else {
      expect(code).toBe(0);
      expect(await Bun.file(output).text()).toBe(`check=${expected}\n`);
      expect(await Bun.file(summary).text()).toBe(
        expected === 'none' ? 'Dependency inputs unchanged; no release age check required.\n' : ''
      );
    }
    const args = (await Bun.file(argumentsFile).text()).trim().split('\n');
    if (event === 'pull_request') {
      for (const path of [
        'bun.lock',
        'bun.lockb',
        'package.json',
        ':(glob)**/package.json',
        'bunfig.toml',
        ':(glob)**/bunfig.toml',
        '.npmrc',
        ':(glob)**/.npmrc',
        'ee',
        '.gitmodules',
        '.github/workflows',
        'src/server/scripts/check-dependency-age.ts',
        'tests/server/dependency-age.test.ts',
      ])
        expect(args).toContain(path);
    } else expect(await Bun.file(argumentsFile).text()).toBe('');
  }
});

test('CE-only workflow validation runs without an EE lockfile and still blocks invalid metadata', async () => {
  const policy = Bun.YAML.parse(
    await Bun.file(
      new URL('../../.github/workflows/dependency-age-policy.yml', import.meta.url)
    ).text()
  ) as { jobs: { validate: { steps: Array<{ id?: string; run?: string }> } } };
  const step = policy.jobs.validate.steps.find((step) => step.id === 'age');
  if (!step?.run) throw new Error('Missing dependency age check');
  const directory = mkdtempSync(join(tmpdir(), 'bugpin scoped age-'));
  directories.push(directory);
  await Bun.write(join(directory, 'bun.lock'), lockfile('example@1.0.0'));
  const script = decodeURIComponent(
    new URL('../../src/server/scripts/check-dependency-age.ts', import.meta.url).pathname
  );
  const preload = join(directory, 'registry.ts');
  await Bun.write(
    preload,
    `globalThis.fetch = async () => Response.json(JSON.parse(process.env.MOCK_METADATA!));`
  );
  await Bun.write(
    join(directory, 'bun'),
    `#!/bin/bash
set -euo pipefail
test "$1" = run
test "$2" = src/server/scripts/check-dependency-age.ts
shift 2
exec "$BUN_EXECUTABLE" --preload "$REGISTRY_PRELOAD" "$AGE_SCRIPT" "$@"
`
  );
  chmodSync(join(directory, 'bun'), 0o755);
  for (const [scope, publishedAt, expected] of [
    ['ce', '2026-01-01T00:00:00Z', 'passed'],
    ['ce', new Date().toISOString(), 'approval'],
    ['ce', 'invalid', 'failed'],
    ['all', '2026-01-01T00:00:00Z', 'failed'],
    ['all', '2026-01-01T00:00:00Z', 'passed'],
  ] as const) {
    if (scope === 'all' && expected === 'passed') {
      await Bun.write(join(directory, 'ee/bun.lock'), lockfile('example@1.0.0'));
    }
    const output = join(directory, 'output');
    const summary = join(directory, 'summary');
    await Promise.all([output, summary].map((path) => Bun.write(path, '')));
    const child = Bun.spawn(['bash', '-e', '-c', step.run], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        BUN_EXECUTABLE: process.execPath,
        REGISTRY_PRELOAD: preload,
        AGE_SCRIPT: script,
        MOCK_METADATA: JSON.stringify({ time: { '1.0.0': publishedAt } }),
        CHECK_SCOPE: scope,
        EE_SHA: scope === 'all' ? 'pinned-ee-revision' : '',
        GITHUB_SHA: 'ce-revision',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        EE_ACCESS_TOKEN: '',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code, , stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (expected === 'failed') {
      expect(code).not.toBe(0);
      expect(await Bun.file(output).text()).toBe('');
      if (scope === 'all') expect(stderr).toContain('ee/bun.lock');
    } else {
      expect(code).toBe(0);
      expect(await Bun.file(output).text()).toContain(
        `approval_required=${expected === 'approval'}\n`
      );
    }
    expect(await Bun.file(summary).text()).toContain(
      scope === 'all'
        ? 'EE: pinned-ee-revision'
        : 'EE revision unchanged; checking CE dependencies only.'
    );
  }
});

test('full validation still requires EE access before checking private dependencies', async () => {
  const policy = Bun.YAML.parse(
    await Bun.file(
      new URL('../../.github/workflows/dependency-age-policy.yml', import.meta.url)
    ).text()
  ) as { jobs: { validate: { steps: Array<{ name?: string; run?: string }> } } };
  const guard = policy.jobs.validate.steps.find((step) => step.name === 'Verify EE access');
  if (!guard?.run) throw new Error('Missing EE access verification');
  for (const token of ['', 'test-token']) {
    const child = Bun.spawn(['bash', '-e', '-c', guard.run], {
      env: { ...process.env, EE_ACCESS_TOKEN: token },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [code, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(token ? 0 : 1);
    if (!token) expect(stdout).toContain('trusted maintainer branch');
  }
});
