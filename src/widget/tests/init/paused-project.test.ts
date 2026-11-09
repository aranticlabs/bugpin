import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { installDom } from '../helpers/dom';
import { installFakeIndexedDB } from '../helpers/fake-indexeddb';

const originalFetch = globalThis.fetch;
let restoreDom: () => void;

function respondWith(status: number, body: Record<string, unknown>): void {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

beforeEach(() => {
  restoreDom = installDom('https://app.example.com');
  installFakeIndexedDB();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreDom();
});

describe('widget initialization for an inactive project', () => {
  it('does not render the widget when the server reports the project as inactive', async () => {
    respondWith(403, {
      success: false,
      error: 'PROJECT_INACTIVE',
      message: 'Project is not active',
    });

    const { default: BugPin } = await import('../../index');
    await BugPin.init({ apiKey: 'proj_paused', serverUrl: 'https://bugpin.example.com' });

    expect(document.getElementById('bugpin-widget')).toBeNull();
  });
});
