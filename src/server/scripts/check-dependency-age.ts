export const MINIMUM_RELEASE_AGE_MS = 72 * 60 * 60 * 1000;

interface DependencyAgeIssue {
  kind: 'age' | 'validation';
  message: string;
}

const sheetjs = 'xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readLockedPackages(source: string): Map<string, Set<string>> {
  const lock: unknown = Bun.JSON5.parse(source);
  if (!isRecord(lock) || lock.lockfileVersion !== 1 || !isRecord(lock.packages)) {
    throw new Error('Expected a version 1 Bun lockfile with package entries.');
  }

  const packages = new Map<string, Set<string>>();
  for (const entry of Object.values(lock.packages)) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') {
      throw new Error('Invalid locked package entry.');
    }
    const spec = entry[0];
    if (/^(?:@[^/]+\/)?[^@]+@workspace:/.test(spec)) continue;
    if (spec === sheetjs) {
      console.warn(`Publication age cannot be checked for the pinned external tarball: ${spec}`);
      continue;
    }
    const match = spec.match(/^(@[^/]+\/[^@]+|[^@]+)@(\d+\.\d+\.\d+(?:[-+][\w.+-]+)?)$/);
    if (!match) throw new Error(`Cannot verify publication age for ${spec}`);
    const [, name, version] = match;
    const versions = packages.get(name) ?? new Set<string>();
    versions.add(version);
    packages.set(name, versions);
  }
  if (packages.size === 0) throw new Error('No registry packages found in the lockfile.');
  return packages;
}

export function checkReleaseTimes(
  name: string,
  versions: Set<string>,
  metadata: unknown,
  now: number
): DependencyAgeIssue[] {
  const times = isRecord(metadata) && isRecord(metadata.time) ? metadata.time : {};
  return [...versions].flatMap<DependencyAgeIssue>((version) => {
    const timestamp = times[version];
    const published = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
    if (!Number.isFinite(published)) {
      return [
        {
          kind: 'validation' as const,
          message: `${name}@${version}: missing or invalid publication timestamp`,
        },
      ];
    }
    if (published > now) {
      return [
        {
          kind: 'validation' as const,
          message: `${name}@${version}: publication timestamp is in the future`,
        },
      ];
    }
    if (now - published < MINIMUM_RELEASE_AGE_MS) {
      return [
        {
          kind: 'age' as const,
          message: `${name}@${version}: published ${timestamp}; eligible at ${new Date(published + MINIMUM_RELEASE_AGE_MS).toISOString()}`,
        },
      ];
    }
    return [];
  });
}

export function ageCheckOutcome(
  issues: DependencyAgeIssue[]
): 'passed' | 'approval-required' | 'failed' {
  if (issues.some((issue) => issue.kind === 'validation')) return 'failed';
  return issues.length > 0 ? 'approval-required' : 'passed';
}

async function fetchMetadata(name: string): Promise<unknown> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
  return response.json();
}

export async function checkDependencyAge(
  lockfiles: string[],
  getMetadata: (name: string) => Promise<unknown> = fetchMetadata,
  now = Date.now()
): Promise<DependencyAgeIssue[]> {
  const packages = new Map<string, Set<string>>();
  for (const path of lockfiles) {
    for (const [name, versions] of readLockedPackages(await Bun.file(path).text())) {
      const combined = packages.get(name) ?? new Set<string>();
      for (const version of versions) combined.add(version);
      packages.set(name, combined);
    }
  }

  const queue = [...packages];
  const issues: DependencyAgeIssue[] = [];
  await Promise.all(
    Array.from({ length: Math.min(8, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        const [name, versions] = item;
        try {
          issues.push(...checkReleaseTimes(name, versions, await getMetadata(name), now));
        } catch (error) {
          issues.push({
            kind: 'validation',
            message: `${name}: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    })
  );
  console.log(
    `Checked ${packages.size} registry packages against the 72-hour minimum release age.`
  );
  return issues.sort((first, second) => first.message.localeCompare(second.message));
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    const requestApproval = args.includes('--request-approval');
    const paths = args.filter((arg) => arg !== '--request-approval');
    const issues = await checkDependencyAge(paths.length > 0 ? paths : ['bun.lock', 'ee/bun.lock']);
    const outcome = ageCheckOutcome(issues);
    if (issues.length > 0) console.error(issues.map((issue) => issue.message).join('\n'));
    if (requestApproval && outcome !== 'failed') {
      const output = process.env.GITHUB_OUTPUT;
      if (!output) throw new Error('--request-approval requires GITHUB_OUTPUT.');
      await Bun.write(
        output,
        `${await Bun.file(output).text()}approval_required=${outcome === 'approval-required'}\n`
      );
    }
    if (outcome === 'failed' || (outcome === 'approval-required' && !requestApproval)) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
