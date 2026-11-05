import { describe, it, expect } from 'bun:test';
import { resolveRelyingParty } from '../../../src/server/utils/relying-party';

const settings = { appName: 'Acme Bugs', appUrl: 'https://bugs.acme.test' };

function resolve(headers: Record<string, string>, appSettings = settings) {
  const lookup = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const context = {
    req: { header: (name: string) => lookup.get(name.toLowerCase()) },
  } as unknown as Parameters<typeof resolveRelyingParty>[0];
  return resolveRelyingParty(context, appSettings);
}

describe('resolveRelyingParty', () => {
  it('uses the Origin header when it matches the request host', async () => {
    expect(resolve({ origin: 'http://localhost:5173', host: 'localhost:7300' })).toEqual({
      name: 'Acme Bugs',
      origin: 'http://localhost:5173',
      id: 'localhost',
    });
  });

  it('accepts the configured app URL behind a proxy that rewrites the host', async () => {
    expect(resolve({ origin: 'https://bugs.acme.test', host: 'bugpin:7300' })).toEqual({
      name: 'Acme Bugs',
      origin: 'https://bugs.acme.test',
      id: 'bugs.acme.test',
    });
  });

  it('rejects a foreign origin', async () => {
    expect(resolve({ origin: 'https://evil.test', host: 'bugs.acme.test' })).toBeNull();
  });

  it('rejects a missing or malformed origin', async () => {
    expect(resolve({ host: 'bugs.acme.test' })).toBeNull();
    expect(resolve({ origin: 'null', host: 'bugs.acme.test' })).toBeNull();
  });

  it('falls back to the BugPin name', async () => {
    const result = resolve(
      { origin: 'https://bugs.acme.test', host: 'bugs.acme.test' },
      { appName: '', appUrl: '' }
    );
    expect(result?.name).toBe('BugPin');
  });
});
