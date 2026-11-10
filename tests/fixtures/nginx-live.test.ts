import { expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const nginx = process.env.NGINX_BINARY ?? Bun.which('nginx') ?? '';

for (const [frontend, scheme] of [
  ['admin', 'http'],
  ['portal', 'http'],
  ['admin', 'https'],
  ['portal', 'https'],
] as const) {
  it.skipIf(!existsSync(nginx) || (scheme === 'https' && !Bun.which('openssl')))(
    `enforces the ${frontend} Nginx boundary with a live ${scheme} backend`,
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'bugpin-nginx-live-'));
      let tls: { cert: string; key: string } | undefined;
      if (scheme === 'https') {
        const certificate = Bun.spawn(
          [
            'openssl',
            'req',
            '-x509',
            '-newkey',
            'rsa:2048',
            '-nodes',
            '-days',
            '1',
            '-subj',
            '/CN=localhost',
            '-addext',
            'subjectAltName=DNS:localhost',
            '-keyout',
            join(directory, 'key.pem'),
            '-out',
            join(directory, 'ca.pem'),
          ],
          { stdout: 'ignore', stderr: 'pipe' }
        );
        const error = await new Response(certificate.stderr).text();
        expect(await certificate.exited, error).toBe(0);
        tls = {
          cert: await Bun.file(join(directory, 'ca.pem')).text(),
          key: await Bun.file(join(directory, 'key.pem')).text(),
        };
      }
      const seen: Array<{ path: string; headers: Headers }> = [];
      const backend = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        tls,
        fetch(request) {
          const path = new URL(request.url).pathname;
          seen.push({ path, headers: request.headers });
          if (path === '/internal/frontend-gate') {
            const original = request.headers.get('X-BugPin-Original-URI') ?? '';
            if (original.includes('stale-token')) return new Response(null, { status: 421 });
            const denied = /deny(301|404|421)/.exec(original)?.[1];
            return new Response(null, {
              status: denied ? 403 : 204,
              headers: {
                ...(denied ? { 'X-BugPin-Gate-Status': denied } : {}),
                ...(denied === '301'
                  ? { 'X-BugPin-Gate-Location': `https://public.test${original}` }
                  : {}),
                ...(original.includes('hsts')
                  ? { 'X-BugPin-Gate-HSTS': 'max-age=31536000; includeSubDomains' }
                  : {}),
                'Strict-Transport-Security': 'max-age=15552000',
              },
            });
          }
          return new Response('backend', {
            headers: {
              'Cross-Origin-Resource-Policy':
                path === '/widget.js' ? 'cross-origin' : 'same-origin',
            },
          });
        },
      });
      let process: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
      try {
        const shared = join(directory, 'shared');
        const html = join(directory, 'html');
        await mkdir(shared);
        await mkdir(join(directory, 'logs'));
        for (const bundle of frontend === 'admin'
          ? ['admin', 'reporter-portal']
          : ['reporter-portal']) {
          await mkdir(join(html, bundle, 'assets'), { recursive: true });
          await mkdir(join(html, bundle, 'nested'), { recursive: true });
          for (const file of [
            'extra.html',
            'nested/extra.HTML',
            'nested/index.html',
            'assets/extra.html',
            'assets/test-hash.js',
          ])
            await Bun.write(join(html, bundle, file), 'static');
          await Bun.write(join(html, bundle, 'index.html'), '<html>entry</html>');
        }
        const substitutions: Record<string, string> = {
          BUGPIN_SERVER_SCHEME: scheme,
          BUGPIN_SERVER_ADDRESS: `127.0.0.1:${backend.port}`,
          BUGPIN_SERVER_HOST: 'localhost',
          BUGPIN_SERVER_CA_FILE:
            scheme === 'https'
              ? join(directory, 'ca.pem')
              : existsSync('/etc/ssl/certs/ca-certificates.crt')
                ? '/etc/ssl/certs/ca-certificates.crt'
                : '/etc/ssl/cert.pem',
          BUGPIN_RESOLVER: '127.0.0.1',
          BUGPIN_PUBLIC_SCHEME: 'https',
          BUGPIN_PROXY_TOKEN: 'deployment-token',
        };
        const render = (source: string) =>
          source
            .replace(/\$\{(BUGPIN_\w+)\}/g, (_, name: string) => substitutions[name]!)
            .replaceAll('/etc/nginx/conf.d/shared', shared)
            .replaceAll('/usr/share/nginx/html', html);
        for (const template of await readdir('deploy/nginx/shared')) {
          await Bun.write(
            join(shared, template.replace('.template', '')),
            render(await Bun.file(`deploy/nginx/shared/${template}`).text())
          );
        }
        await Bun.write(
          join(shared, 'real-ip.conf'),
          'real_ip_header X-Forwarded-For;\nreal_ip_recursive on;\n'
        );
        let port: number | undefined;
        const configuration = join(directory, 'nginx.conf');
        const template = render(await Bun.file(`deploy/nginx/${frontend}.conf.template`).text());
        const configure = async (listenPort: number) => {
          const server = template.replace(/listen 73[01]0;/, `listen 127.0.0.1:${listenPort};`);
          await Bun.write(
            configuration,
            `pid ${directory}/nginx.pid;\nerror_log stderr;\nevents {}\nhttp { access_log off; client_body_temp_path ${directory}/body; proxy_temp_path ${directory}/proxy;\n${server}\n}`
          );
        };
        const request = async (path: string) => {
          const curl = Bun.spawn(
            [
              'curl',
              '--silent',
              '--show-error',
              '--max-time',
              '2',
              '--path-as-is',
              '--output',
              '/dev/null',
              '--dump-header',
              '-',
              '--header',
              'Host: public.test',
              '--header',
              'X-BugPin-Proxy-Token: client-token',
              '--header',
              'X-BugPin-Frontend: attacker',
              '--header',
              'X-BugPin-Gated-Frontend: attacker',
              `http://127.0.0.1:${port}${path}`,
            ],
            { stdout: 'pipe', stderr: 'pipe' }
          );
          const [headers, error, code] = await Promise.all([
            new Response(curl.stdout).text(),
            new Response(curl.stderr).text(),
            curl.exited,
          ]);
          if (code !== 0) throw new Error(error);
          return { status: Number(headers.split(' ')[1]), headers };
        };
        for (let bindAttempt = 0; bindAttempt < 5; bindAttempt++) {
          const reservation = Bun.serve({
            hostname: '127.0.0.1',
            port: 0,
            fetch: () => new Response(),
          });
          port = reservation.port!;
          await reservation.stop(true);
          await configure(port);
          const validation = Bun.spawn([nginx, '-t', '-p', `${directory}/`, '-c', configuration], {
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const validationError = await new Response(validation.stderr).text();
          expect(await validation.exited, validationError).toBe(0);
          process = Bun.spawn(
            [nginx, '-p', `${directory}/`, '-c', configuration, '-g', 'daemon off;'],
            { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }
          );
          let ready = false;
          for (let attempt = 0; attempt < 50; attempt++) {
            if (process.exitCode !== null) break;
            try {
              ready = (await request(`/${frontend}-health`)).status === 200;
              if (ready) break;
            } catch {
              /* Wait for the listener. */
            }
            await Bun.sleep(20);
          }
          if (ready) break;
          process.kill('SIGTERM');
          await process.exited;
          const error = await new Response(process.stderr).text();
          if (!error.includes('Address already in use') || bindAttempt === 4)
            throw new Error(`Nginx did not start: ${error}`);
        }
        for (const path of [
          '/api/portal/..\\..\\api/settings',
          '/api/..\\internal/frontend-gate',
          '/api/portal/%5c..%5Capi/settings',
          '/api/portal/%2fsettings',
          '/api/portal/%2Fsettings',
          '/api/portal/%2e%2E/api/settings',
          '/api/portal/.%2e/api/settings',
        ]) {
          const count = seen.length;
          expect((await request(path)).status).toBe(400);
          expect(seen.length).toBe(count);
        }
        for (const path of ['/internal/frontend-gate', '/internal/proxy-check', '/internal/other'])
          expect((await request(path)).status).toBe(404);
        expect((await request('/api/portal/config?value=%2F')).status).toBe(200);
        expect(seen.at(-1)?.headers.get('X-BugPin-Proxy-Token')).toBe('deployment-token');
        expect(seen.at(-1)?.headers.get('X-BugPin-Frontend')).toBe(frontend);
        for (const bundle of frontend === 'admin'
          ? ['/admin/', '/reporter-portal/']
          : ['/reporter-portal/']) {
          for (const file of ['extra.html', 'nested/extra.HTML', 'assets/extra.html']) {
            const count = seen.length;
            expect((await request(`${bundle}${file}`)).status).toBe(404);
            expect(seen.length).toBe(count);
          }
          const count = seen.length;
          const asset = await request(`${bundle}assets/test-hash.js`);
          expect(asset.status).toBe(200);
          expect(asset.headers).toContain('immutable');
          expect(seen.length).toBe(count);
          for (const entry of ['index.html', 'nested/', 'nested/index.html']) {
            const count = seen.length;
            const response = await request(`${bundle}${entry}`);
            expect(response.status).toBe(entry === 'index.html' ? 200 : 404);
            if (entry === 'index.html') expect(seen.length).toBe(count + 1);
          }
        }
        const bundle = frontend === 'admin' ? '/admin/' : '/reporter-portal/';
        const allowed = await request(`${bundle}route`);
        expect(allowed.status).toBe(200);
        expect(allowed.headers).not.toContain('Strict-Transport-Security');
        expect(seen.at(-1)?.headers.get('X-BugPin-Gated-Frontend')).toBe(frontend);
        expect((await request(`${bundle}hsts`)).headers).toContain(
          'Strict-Transport-Security: max-age=31536000; includeSubDomains'
        );
        expect((await request(`${bundle}stale-token`)).status).toBe(421);
        for (const status of [301, 404, 421]) {
          const denied = await request(`${bundle}deny${status}`);
          expect(denied.status).toBe(status);
          expect(denied.headers).toContain('X-Content-Type-Options: nosniff');
          if (status === 301)
            expect(denied.headers).toContain(`Location: https://public.test${bundle}deny301`);
        }
        if (frontend === 'portal') {
          for (const path of ['/admin/', '/api/settings', '/widget.js'])
            expect((await request(path)).status).toBe(404);
        } else {
          const widget = await request('/widget.js');
          expect(widget.status).toBe(200);
          expect(widget.headers).toContain('Cross-Origin-Resource-Policy: cross-origin');
          await request('/reporter-portal/login');
          expect(seen.at(-1)?.headers.get('X-BugPin-Frontend')).toBe('admin');
          expect(seen.at(-1)?.headers.get('X-BugPin-Gated-Frontend')).toBe('portal');
        }
        if (scheme === 'https') {
          for (const [overrides, expected] of [
            [{ BUGPIN_SERVER_HOST: 'wrong.example.test' }, 502],
            [{ BUGPIN_SERVER_HOST: 'localhost' }, 200],
            [
              {
                BUGPIN_SERVER_CA_FILE: existsSync('/etc/ssl/certs/ca-certificates.crt')
                  ? '/etc/ssl/certs/ca-certificates.crt'
                  : '/etc/ssl/cert.pem',
              },
              502,
            ],
          ] as const) {
            Object.assign(substitutions, overrides);
            await Bun.write(
              join(shared, 'proxy-defaults.conf'),
              render(await Bun.file('deploy/nginx/shared/proxy-defaults.conf.template').text())
            );
            const reload = Bun.spawn(
              [nginx, '-p', `${directory}/`, '-c', configuration, '-s', 'reload'],
              { stdout: 'ignore', stderr: 'pipe' }
            );
            const error = await new Response(reload.stderr).text();
            expect(await reload.exited, error).toBe(0);
            let status = 0;
            for (let attempt = 0; attempt < 50; attempt++) {
              status = (await request('/api/portal/config')).status;
              if (status === expected) break;
              await Bun.sleep(20);
            }
            expect(status).toBe(expected);
          }
        }
      } finally {
        process?.kill('SIGTERM');
        if (process) await process.exited;
        await backend.stop(true);
        await rm(directory, { recursive: true, force: true });
      }
    },
    15000
  );
}
