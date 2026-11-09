import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../utils';
import { AddressNotice } from '../../components/AddressNotice';
import { server } from '../mocks/server';
import { mockUsers } from '../mocks/handlers';

const APP_URL_KEY = 'bugpin.addressWarning.appUrl.dismissedId';
const PROXY_KEY = 'bugpin.addressWarning.proxy.dismissedId';
const APP_URL_SNOOZE_KEY = 'bugpin.addressWarning.appUrl.snoozedUntil';
const PROXY_SNOOZE_KEY = 'bugpin.addressWarning.proxy.snoozedUntil';
const BROWSER_ORIGIN = window.location.origin;

interface AddressCheckBody {
  appUrl?: string;
  requestOrigin?: string | null;
  forwardedHeadersIgnored?: boolean;
}

let addressCheckRequests = 0;

function mockAddressCheck(overrides: AddressCheckBody = {}) {
  server.use(
    http.get('/api/settings/address-check', () => {
      addressCheckRequests += 1;
      return HttpResponse.json({
        success: true,
        appUrl: '',
        requestOrigin: BROWSER_ORIGIN,
        forwardedHeadersIgnored: false,
        ...overrides,
      });
    })
  );
}

function mockUserRole(role: 'admin' | 'editor') {
  const user = role === 'admin' ? mockUsers.admin : mockUsers.editor;
  server.use(
    http.get('/api/auth/me', () => HttpResponse.json({ success: true, authenticated: true, user }))
  );
}

beforeEach(() => {
  window.localStorage.clear();
  addressCheckRequests = 0;
});

describe('AddressNotice', () => {
  it('shows nothing when the Application URL and request origin match the browser', async () => {
    mockUserRole('admin');
    mockAddressCheck({ appUrl: `${BROWSER_ORIGIN}/` });

    renderWithProviders(<AddressNotice />);

    await waitFor(() => expect(addressCheckRequests).toBe(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows nothing when no Application URL is configured', async () => {
    mockUserRole('admin');
    mockAddressCheck();

    renderWithProviders(<AddressNotice />);

    await waitFor(() => expect(addressCheckRequests).toBe(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('warns when the Application URL differs from the address in the browser', async () => {
    mockUserRole('admin');
    mockAddressCheck({ appUrl: 'https://old.example.com/bugpin' });

    renderWithProviders(<AddressNotice />);

    expect(
      await screen.findByText(
        `The Application URL (https://old.example.com) does not match the address you are using (${BROWSER_ORIGIN}).`
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(screen.queryByText(/reverse proxy/i)).not.toBeInTheDocument();
  });

  it('warns about TRUST_PROXY when forwarded headers are ignored', async () => {
    mockUserRole('admin');
    mockAddressCheck({ requestOrigin: 'http://bugpin:7300', forwardedHeadersIgnored: true });

    renderWithProviders(<AddressNotice />);

    expect(
      await screen.findByText('BugPin is behind a reverse proxy but ignores its forwarded headers.')
    ).toBeInTheDocument();
    expect(screen.getByText(/Set TRUST_PROXY=auto/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reverse proxy guide/i })).toHaveAttribute(
      'href',
      'https://docs.bugpin.io/installation/reverse-proxy#client-ip-addresses-and-trust_proxy'
    );
  });

  it('warns about proxy headers when the request origin differs', async () => {
    mockUserRole('admin');
    mockAddressCheck({ requestOrigin: 'http://bugpin:7300' });

    renderWithProviders(<AddressNotice />);

    expect(
      await screen.findByText(
        `BugPin receives your requests as http://bugpin:7300, but your browser uses ${BROWSER_ORIGIN}.`
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/pass the original Host and X-Forwarded-Proto/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Reverse proxy guide/i })).toHaveAttribute(
      'href',
      'https://docs.bugpin.io/installation/reverse-proxy'
    );
  });

  it('warns when BugPin cannot derive a request origin', async () => {
    mockUserRole('admin');
    mockAddressCheck({ requestOrigin: null });

    renderWithProviders(<AddressNotice />);

    expect(
      await screen.findByText('BugPin cannot determine the address of your requests.')
    ).toBeInTheDocument();
  });

  it('shows both warnings independently and dismisses each one on its own', async () => {
    mockUserRole('admin');
    mockAddressCheck({
      appUrl: 'https://old.example.com',
      requestOrigin: 'http://bugpin:7300',
      forwardedHeadersIgnored: true,
    });

    renderWithProviders(<AddressNotice />);

    await screen.findByText(/The Application URL/);
    expect(screen.getAllByRole('status')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Application URL warning' }));

    expect(screen.queryByText(/The Application URL/)).not.toBeInTheDocument();
    expect(screen.getByText(/ignores its forwarded headers/)).toBeInTheDocument();
    expect(window.localStorage.getItem(APP_URL_KEY)).toBe(
      `https://old.example.com|${BROWSER_ORIGIN}`
    );
    expect(window.localStorage.getItem(PROXY_KEY)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss reverse proxy warning' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('snoozes each warning for a day with Not now', async () => {
    mockUserRole('admin');
    mockAddressCheck({
      appUrl: 'https://old.example.com',
      requestOrigin: 'http://bugpin:7300',
      forwardedHeadersIgnored: true,
    });

    const before = Date.now();
    renderWithProviders(<AddressNotice />);

    const appUrlWarning = (await screen.findByText(/The Application URL/)).closest(
      '[role="status"]'
    ) as HTMLElement;
    await userEvent.click(within(appUrlWarning).getByRole('button', { name: 'Not now' }));

    expect(screen.queryByText(/The Application URL/)).not.toBeInTheDocument();
    expect(screen.getByText(/ignores its forwarded headers/)).toBeInTheDocument();
    expect(Number(window.localStorage.getItem(APP_URL_SNOOZE_KEY))).toBeGreaterThanOrEqual(
      before + 24 * 60 * 60 * 1000
    );
    expect(window.localStorage.getItem(PROXY_SNOOZE_KEY)).toBeNull();
    expect(window.localStorage.getItem(APP_URL_KEY)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(Number(window.localStorage.getItem(PROXY_SNOOZE_KEY))).toBeGreaterThanOrEqual(
      before + 24 * 60 * 60 * 1000
    );
  });

  it('stays hidden while snoozed and returns after the snooze expires', async () => {
    mockUserRole('admin');
    window.localStorage.setItem(APP_URL_SNOOZE_KEY, String(Date.now() + 60_000));
    window.localStorage.setItem(PROXY_SNOOZE_KEY, String(Date.now() - 1));
    mockAddressCheck({
      appUrl: 'https://old.example.com',
      requestOrigin: 'http://bugpin:7300',
      forwardedHeadersIgnored: true,
    });

    renderWithProviders(<AddressNotice />);

    expect(await screen.findByText(/ignores its forwarded headers/)).toBeInTheDocument();
    expect(screen.queryByText(/The Application URL/)).not.toBeInTheDocument();
  });

  it('keeps a dismissed warning hidden only while the situation is unchanged', async () => {
    mockUserRole('admin');
    window.localStorage.setItem(APP_URL_KEY, `https://old.example.com|${BROWSER_ORIGIN}`);
    mockAddressCheck({ appUrl: 'https://old.example.com' });

    const first = renderWithProviders(<AddressNotice />);
    await waitFor(() => expect(addressCheckRequests).toBe(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    first.unmount();

    mockAddressCheck({ appUrl: 'https://other.example.com' });
    renderWithProviders(<AddressNotice />);

    expect(
      await screen.findByText(/The Application URL \(https:\/\/other\.example\.com\)/)
    ).toBeInTheDocument();
  });

  it('does not run the check for non-admins', async () => {
    mockUserRole('editor');
    mockAddressCheck({ appUrl: 'https://old.example.com' });

    renderWithProviders(<AddressNotice />);

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(addressCheckRequests).toBe(0);
  });
});
