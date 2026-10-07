import { afterEach, describe, expect, it } from 'bun:test';

const sharedPath = Bun.resolveSync(
  'nodemailer/lib/shared',
  new URL('../../src/server/', import.meta.url).pathname
);
const { dnsCache, resolveHostname } = (await import(sharedPath)) as {
  dnsCache: Map<string, { value: { addresses: string[]; servername?: string }; expires: number }>;
  resolveHostname: (
    options: { host: string; servername?: string },
    callback: (
      error: Error | null,
      result?: { servername?: string | false; cached?: boolean }
    ) => void
  ) => void;
};

const host = 'smtp-cache.example.test';

afterEach(() => {
  dnsCache.delete(host);
});

describe('Nodemailer TLS hostname isolation', () => {
  it('uses each connection hostname instead of a hostname retained in the DNS cache', async () => {
    dnsCache.set(host, {
      value: { addresses: ['127.0.0.1'], servername: 'first.example.test' },
      expires: Date.now() + 60000,
    });

    for (const servername of ['second.example.test', 'third.example.test', undefined]) {
      const result = await new Promise<{ servername?: string | false; cached?: boolean }>(
        (resolve, reject) => {
          resolveHostname({ host, servername }, (error, value) => {
            if (error) reject(error);
            else if (value) resolve(value);
            else reject(new Error('Hostname resolution returned no result'));
          });
        }
      );

      expect(result.cached).toBe(true);
      expect(result.servername).toBe(servername ?? host);
    }
  });
});
