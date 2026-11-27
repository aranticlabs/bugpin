import { expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { MAX_REQUEST_BODY_SIZE } from '../../src/server/utils/request-limits';

it('allows the largest server request through both Nginx configurations', async () => {
  for (const frontend of ['admin', 'portal']) {
    const config = await Bun.file(`deploy/nginx/${frontend}.conf.template`).text();
    const match = config.match(/client_max_body_size\s+(\d+)([kmg]?)\s*;/i);
    expect(match).not.toBeNull();
    const scale = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
    const unit = match![2]!.toLowerCase() as keyof typeof scale;
    expect(Number(match![1]) * scale[unit]).toBeGreaterThanOrEqual(MAX_REQUEST_BODY_SIZE);
  }
});

it('validates frontend startup, proxy trust, token loading, and connection failures', async () => {
  const { mkdtemp, mkdir, chmod, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = await mkdtemp(join(tmpdir(), 'bugpin-nginx-'));
  try {
    const script = (await Bun.file('deploy/nginx/15-bugpin.envsh').text()).replaceAll(
      '/etc/nginx/conf.d',
      `${directory}/conf.d`
    );
    await Bun.write(`${directory}/prepare.envsh`, script);
    await mkdir(`${directory}/bin`);
    await Bun.write(`${directory}/token`, 'file-token');
    await Bun.write(
      `${directory}/bin/curl`,
      '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$TEST_CURL_ARGS"\nprintf "%s" "${TEST_STATUS:-204}"\n'
    );
    await chmod(`${directory}/bin/curl`, 0o755);
    const run = async (env: Record<string, string> = {}) => {
      const child = Bun.spawn(
        [
          'sh',
          '-c',
          '. "$1"; printf "token=%s\\nupstream=%s://%s;host=%s;resolver=%s" "$BUGPIN_PROXY_TOKEN" "$BUGPIN_SERVER_SCHEME" "$BUGPIN_SERVER_ADDRESS" "$BUGPIN_SERVER_HOST" "$BUGPIN_RESOLVER"',
          'sh',
          `${directory}/prepare.envsh`,
        ],
        {
          env: {
            ...process.env,
            PATH: `${directory}/bin:${process.env.PATH}`,
            BUGPIN_SERVER_URL: 'http://bugpin-server:4300',
            BUGPIN_SERVER_CA_FILE: existsSync('/etc/ssl/certs/ca-certificates.crt')
              ? '/etc/ssl/certs/ca-certificates.crt'
              : '/etc/ssl/cert.pem',
            TEST_CURL_ARGS: `${directory}/curl-args`,
            BUGPIN_PROXY_TOKEN: '',
            BUGPIN_PUBLIC_SCHEME: 'http',
            BUGPIN_TRUSTED_PROXIES: '',
            BUGPIN_PROXY_TOKEN_FILE: `${directory}/token`,
            ...env,
          },
          stdout: 'pipe',
          stderr: 'pipe',
        }
      );
      const [status, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { status, stdout, stderr };
    };
    expect(await run()).toMatchObject({
      status: 0,
      stdout:
        'token=file-token\nupstream=http://bugpin-server:4300;host=bugpin-server;resolver=127.0.0.11',
    });
    expect(
      await run({
        BUGPIN_PROXY_TOKEN: 'explicit-token',
        BUGPIN_PUBLIC_SCHEME: 'https',
        BUGPIN_TRUSTED_PROXIES: 'private, 203.0.113.0/24',
      })
    ).toMatchObject({
      status: 0,
      stdout:
        'token=explicit-token\nupstream=http://bugpin-server:4300;host=bugpin-server;resolver=127.0.0.11',
    });
    const realIp = await readFile(`${directory}/conf.d/shared/real-ip.conf`, 'utf8');
    for (const network of [
      '127.0.0.0/8',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '::1/128',
      'fc00::/7',
      '203.0.113.0/24',
    ])
      expect(realIp).toContain(`set_real_ip_from ${network};`);
    for (const network of [
      '0.0.0.0/0',
      '0/0',
      '::/0',
      '::0/0',
      '0.0.0.0/00',
      '::0/00',
      '0.0.0.0/000',
      '0.0.0.0/1,128.0.0.0/1',
      '10.0.0.0/7',
      '2001::/15',
      '10.0.0.0/33',
      '2001::/129',
      '10.0.0.1; include /tmp/unsafe',
    ]) {
      const rejected = await run({ BUGPIN_TRUSTED_PROXIES: network });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('BUGPIN_TRUSTED_PROXIES');
    }
    expect((await run({ BUGPIN_PUBLIC_SCHEME: 'ftp' })).status).toBe(1);
    expect((await run({ BUGPIN_PROXY_TOKEN: 'bad;token' })).status).toBe(1);
    expect((await run({ BUGPIN_SERVER_URL: 'http://server;unsafe' })).status).toBe(1);
    for (const resolver of [
      '8.8.8.8; include /tmp/unsafe',
      '999.0.0.1',
      '127.0.0.1:0',
      '127.0.0.1:65536',
      'example.test',
      '[::1]:0',
      '[:::1]',
      '[12345::1]',
      '[1:2:3]',
      '[:1::]',
      '[::1:]',
      '[1:2:3:4:5:6:7:8:9]',
      '127.0.0.1\ninclude /tmp/unsafe',
    ]) {
      const rejected = await run({ BUGPIN_RESOLVER: resolver });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('BUGPIN_RESOLVER');
    }
    for (const [url, address, host] of [
      ['http://10.0.0.1', '10.0.0.1:80', '10.0.0.1'],
      ['https://server.example.test/', 'server.example.test:443', 'server.example.test'],
      ['http://[::1]:4300', '[::1]:4300', '::1'],
      ['https://[::1]', '[::1]:443', '::1'],
    ]) {
      const result = await run({ BUGPIN_SERVER_URL: url!, BUGPIN_RESOLVER: '[::1]:5353' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`://${address};host=${host};resolver=[::1]:5353`);
    }
    for (const status of ['404', '409', '421', '400', '302']) {
      const rejected = await run({ TEST_STATUS: status });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain(`HTTP ${status}`);
      if (status === '409')
        expect(rejected.stderr).toContain('server is not running with TRUST_PROXY=token');
      if (status === '404')
        expect(rejected.stderr).toContain(
          'server is too old for this frontend image, use the same version for all images'
        );
    }
    const ca = `${directory}/ca.pem`;
    await Bun.write(ca, 'test bundle');
    expect(
      (await run({ BUGPIN_SERVER_URL: 'https://server.test', BUGPIN_SERVER_CA_FILE: ca })).status
    ).toBe(0);
    expect(await readFile(`${directory}/curl-args`, 'utf8')).toContain(`--cacert\n${ca}\n`);
    for (const path of [`${directory}/missing`, '/tmp/ca;unsafe', 'relative.pem']) {
      const rejected = await run({ BUGPIN_SERVER_CA_FILE: path });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('BUGPIN_SERVER_CA_FILE');
    }
    for (const token of ['wrong-token', '']) {
      const rejected = await run({
        BUGPIN_PROXY_TOKEN: token,
        BUGPIN_PROXY_TOKEN_FILE: `${directory}/missing`,
        TEST_STATUS: '403',
      });
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain('Copy the current proxy token from the Admin Console');
      expect(rejected.stderr).not.toContain('wrong-token');
    }
    await Bun.write(
      `${directory}/bin/date`,
      `#!/bin/sh\nif [ -f '${directory}/clock' ]; then echo 61; else touch '${directory}/clock'; echo 0; fi\n`
    );
    await chmod(`${directory}/bin/date`, 0o755);
    for (const status of ['000', '500', '503']) {
      await rm(`${directory}/clock`, { force: true });
      const unreachable = await run({ TEST_STATUS: status });
      expect(unreachable.status).toBe(1);
      expect(unreachable.stderr).toContain(
        `BUGPIN_SERVER_URL=http://bugpin-server:4300 after 60 seconds (last HTTP status: ${status})`
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
