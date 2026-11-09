import type { ChildProcess } from 'node:child_process';
import { once } from 'node:events';

export async function stopChild(child: ChildProcess): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  const timeout = setTimeout(() => child.kill('SIGKILL'), 2000);
  try {
    child.kill('SIGTERM');
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}
