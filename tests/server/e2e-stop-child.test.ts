import { expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { stopChild } from '../e2e/stop-child';

it.each(['exit', 'signal'] as const)('returns for a child already ended by %s', async (kind) => {
  const child = spawn(process.execPath, [
    '-e',
    kind === 'exit' ? 'process.exit(0)' : "console.log('ready'); setInterval(() => {}, 1000)",
  ]);
  const exited = once(child, 'exit');
  if (kind === 'signal') {
    await once(child.stdout!, 'data');
    child.kill('SIGTERM');
  }
  await exited;
  await stopChild(child);
  expect(kind === 'signal' ? child.signalCode : child.exitCode).toBe(
    kind === 'signal' ? 'SIGTERM' : 0
  );
});

it('escalates to SIGKILL when a child ignores SIGTERM', async () => {
  const child = spawn(process.execPath, [
    '-e',
    "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000)",
  ]);
  try {
    await once(child.stdout!, 'data');
    await stopChild(child);
    expect(child.signalCode).toBe('SIGKILL');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
});

it('returns for a child that could not spawn', async () => {
  const child = spawn('/not-a-real-bugpin-executable', []);
  await once(child, 'error');
  await stopChild(child);
  expect(child.pid).toBeUndefined();
});
