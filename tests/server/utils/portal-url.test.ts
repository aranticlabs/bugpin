import { expect, it } from 'bun:test';
import { projectPortalUrl } from '../../../src/server/utils/portal-url';

it.each([
  [false, 'https://app.example.com', '', null],
  [true, 'https://app.example.com/path', '', 'https://app.example.com/reporter-portal/'],
  [
    true,
    'https://app.example.com',
    'https://feedback.example.com/path',
    'https://feedback.example.com/reporter-portal/',
  ],
  [true, 'http://app.example.com', 'https://feedback.example.com', null],
  [true, 'https://app.example.com', 'http://feedback.example.com', null],
  [true, '', 'https://feedback.example.com', null],
  [true, 'invalid', '', null],
  [true, 'https://app.example.com', 'invalid', null],
  [true, 'http://localhost:7301', '', 'http://localhost:7301/reporter-portal/'],
])(
  'resolves the project portal URL for enabled %s, app %s, portal %s',
  (enabled, appUrl, portalBaseUrl, expected) => {
    expect(
      projectPortalUrl(
        { settings: { reporterPortal: { enabled, allowNewFeedback: false } } },
        { appUrl, portalBaseUrl }
      )
    ).toBe(expected);
  }
);
