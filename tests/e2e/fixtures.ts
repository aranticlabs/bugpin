import { test as base, expect } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

export interface Runtime {
  staffOrigin: string;
  portalOrigin: string;
  staffSession: string;
  widgetApiKey: string;
  waitForUnsubscribeLink: (email: string) => Promise<string>;
  waitForLink: (email: string) => Promise<string>;
  expireLinks: (email: string, source: 'request' | 'confirmation') => void;
}

export const test = base.extend<object, { runtime: Runtime }>({
  runtime: [
    async ({}, use) => {
      const directory = mkdtempSync(join(tmpdir(), 'bugpin-e2e-'));
      const messages: { email: string; body: string }[] = [];
      const events = new EventTarget();
      const smtp = createServer((socket) => {
        socket.setEncoding('utf8');
        socket.write('220 localhost ESMTP\r\n');
        let buffer = '';
        let recipient = '';
        let data: string[] | null = null;
        socket.on('data', (chunk: string) => {
          buffer += chunk;
          let end: number;
          while ((end = buffer.indexOf('\r\n')) !== -1) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            if (data) {
              if (line === '.') {
                messages.push({ email: recipient, body: data.join('\n') });
                data = null;
                socket.write('250 Accepted\r\n');
                events.dispatchEvent(new Event('message'));
              } else data.push(line.replace(/^\.\./, '.'));
            } else if (/^EHLO|^HELO/i.test(line)) socket.write('250 localhost\r\n');
            else if (/^RCPT TO:/i.test(line)) {
              recipient = line.match(/<([^>]+)>/)?.[1] ?? '';
              socket.write('250 OK\r\n');
            } else if (/^DATA$/i.test(line)) {
              data = [];
              socket.write('354 End with dot\r\n');
            } else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
            else socket.write('250 OK\r\n');
          }
        });
      });
      smtp.listen(0, '127.0.0.1');
      await once(smtp, 'listening');
      const address = smtp.address();
      if (!address || typeof address === 'string') throw new Error('SMTP sink did not bind');
      const child = spawn('bun', ['dist/e2e/server.js'], {
        cwd: resolve('.'),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATA_DIR: directory,
          TRUST_PROXY: 'false',
          E2E_SMTP_PORT: String(address.port),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        const ready = await new Promise<
          Pick<Runtime, 'staffOrigin' | 'portalOrigin' | 'staffSession' | 'widgetApiKey'>
        >((resolveReady, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Built test server did not start')),
            30000
          );
          let output = '';
          let errors = '';
          child.stderr.on('data', (chunk: Buffer) => {
            errors = (errors + chunk.toString()).slice(-8000);
          });
          child.stdout.on('data', (chunk: Buffer) => {
            output += chunk.toString();
            const match = output.match(/E2E_READY (\{[^\n]+\})/);
            if (match) {
              clearTimeout(timeout);
              resolveReady(JSON.parse(match[1]));
            }
          });
          child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          child.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`Built test server exited with ${code}: ${errors}`));
          });
        });
        function waitForEmailLink(email: string, kind: 'login' | 'unsubscribe'): Promise<string> {
          return new Promise((resolveLink, reject) => {
            const timeout = setTimeout(() => {
              events.removeEventListener('message', received);
              reject(new Error(`No ${kind} email link captured`));
            }, 10000);
            const received = () => {
              for (let index = 0; index < messages.length; index++) {
                const message = messages[index];
                if (message.email !== email) continue;
                const decoded = message.body
                  .replace(/=\n/g, '')
                  .replace(/=([0-9a-f]{2})/gi, (_, value: string) =>
                    String.fromCharCode(Number.parseInt(value, 16))
                  );
                const pattern =
                  kind === 'login'
                    ? /https?:\/\/[^\s<>"']+\/reporter-portal\/login#[a-zA-Z0-9_-]+/
                    : /https?:\/\/[^\s<>"']+\/api\/portal\/unsubscribe\?[^\s<>"']+/;
                const link = decoded.match(pattern)?.[0];
                if (!link) continue;
                messages.splice(index, 1);
                clearTimeout(timeout);
                events.removeEventListener('message', received);
                resolveLink(link.replace(/&amp;/g, '&'));
                return;
              }
            };
            events.addEventListener('message', received);
            received();
          });
        }
        await use({
          ...ready,
          expireLinks: (email, source) => {
            execFileSync('bun', [resolve('tests/e2e/database.ts'), email, source], {
              env: { ...process.env, E2E_DATA_DIR: directory },
            });
          },
          waitForLink: (email) => waitForEmailLink(email, 'login'),
          waitForUnsubscribeLink: (email) => waitForEmailLink(email, 'unsubscribe'),
        });
      } finally {
        child.kill('SIGTERM');
        if (child.exitCode === null) await once(child, 'exit');
        await new Promise<void>((resolveClose) => smtp.close(() => resolveClose()));
        rmSync(directory, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],
});

export { expect };
