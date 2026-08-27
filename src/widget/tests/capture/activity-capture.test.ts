import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { installDom } from '../helpers/dom';

let restoreDom: (() => void) | null = null;
let captureModule: typeof import('../../capture/context');

beforeAll(async () => {
  restoreDom = installDom('https://example.com/page?session=secret#section');
  // @ts-expect-error - Query params provide test module isolation.
  captureModule = await import('../../capture/context?activity-capture');
});

beforeEach(() => {
  captureModule.stopUserActivityCapture();
  captureModule.clearUserActivity();
  document.body.innerHTML = '';
});

afterAll(() => {
  captureModule.stopUserActivityCapture();
  captureModule.clearUserActivity();
  restoreDom?.();
});

function capturedActivity() {
  return captureModule.captureContext({
    consoleCapture: false,
    networkCapture: false,
    userActivityCapture: true,
    storageKeysCapture: false,
  }).userActivity;
}

describe('user activity capture lifecycle', () => {
  it('starts once, redacts text, and clears on stop', () => {
    const button = document.createElement('button');
    button.textContent = 'Contact person@example.com';
    document.body.appendChild(button);

    captureModule.startUserActivityCapture();
    captureModule.startUserActivityCapture();
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(capturedActivity()).toHaveLength(1);
    expect(capturedActivity()?.[0]?.text).toContain('[bugpin:redacted-email]');

    expect(captureModule.getUserActivity()).toHaveLength(1);
    captureModule.removeUserActivity(0);
    expect(capturedActivity()).toBeUndefined();

    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(capturedActivity()).toHaveLength(1);

    captureModule.stopUserActivityCapture();
    captureModule.clearUserActivity();
    expect(capturedActivity()).toBeUndefined();
  });

  it('ignores private subtrees and can minimize link URLs', () => {
    const privateRegion = document.createElement('div');
    privateRegion.setAttribute('data-bugpin-private', 'true');
    const privateButton = document.createElement('button');
    privateButton.textContent = 'Private action';
    privateRegion.appendChild(privateButton);
    document.body.appendChild(privateRegion);

    const link = document.createElement('a');
    link.href = 'https://example.com/account?email=person@example.com#profile';
    link.textContent = 'Account';
    document.body.appendChild(link);

    captureModule.startUserActivityCapture();
    privateButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    link.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

    expect(capturedActivity()).toHaveLength(1);
    expect(capturedActivity()?.[0]?.url).toContain('[bugpin:redacted-email]');
  });
});
