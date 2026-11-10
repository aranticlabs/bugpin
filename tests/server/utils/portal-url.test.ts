import { expect, it } from 'bun:test';
import { projectPortalUrl, securePortalBaseUrl } from '../../../src/server/utils/portal-url';

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
  [true, 'http://localhost:4300', '', 'http://localhost:4300/reporter-portal/'],
  [
    true,
    'http://localhost:7300',
    'http://127.0.0.1:7310',
    'http://127.0.0.1:7310/reporter-portal/',
  ],
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

it.each([
  ['https://app.example.com', '', 'https://app.example.com'],
  ['https://app.example.com', 'https://feedback.example.com', 'https://feedback.example.com'],
  ['http://app.example.com', 'https://feedback.example.com', null],
  ['https://app.example.com', 'http://feedback.example.com', null],
  ['', 'https://feedback.example.com', null],
  ['https://user:password@app.example.com', '', null],
  ['http://localhost:4300', '', 'http://localhost:4300'],
  ['http://localhost:7300', 'http://127.0.0.1:7310', 'http://127.0.0.1:7310'],
])('selects a secure base for app %s and portal %s', (appUrl, portalBaseUrl, expected) => {
  expect(securePortalBaseUrl({ appUrl, portalBaseUrl })).toBe(expected);
});
