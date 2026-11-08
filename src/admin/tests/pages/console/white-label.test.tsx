import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryAndRouter, screen, userEvent, waitFor } from '../../utils';
import { WhiteLabel } from '../../../pages/console/WhiteLabelSettings';
import { api } from '../../../api/client';
import { toast } from 'sonner';

const licenseApiMocks = vi.hoisted(() => ({ getFeatures: vi.fn() }));
const brandingApiMocks = vi.hoisted(() => ({ getConfig: vi.fn() }));

vi.mock('../../../api/license', () => ({ licenseApi: licenseApiMocks }));
vi.mock('../../../api/branding', () => ({ brandingApi: brandingApiMocks }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let hidePoweredBy = false;

beforeEach(() => {
  hidePoweredBy = false;
  licenseApiMocks.getFeatures.mockResolvedValue({
    eeAvailable: true,
    features: { 'white-label': true },
  });
  brandingApiMocks.getConfig.mockImplementation(async () => ({
    whiteLabel: { enabled: true, hidePoweredBy },
  }));
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { config: { hideFooterBranding: true, hideEmailBranding: false } },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it('shows an upgrade card without the white-label feature', async () => {
  licenseApiMocks.getFeatures.mockResolvedValue({
    eeAvailable: true,
    features: { 'white-label': false },
  });
  renderWithQueryAndRouter(<WhiteLabel />);

  expect(
    await screen.findByText('This feature requires an Enterprise license.')
  ).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalledWith('/white-label/config');
});

it('loads and saves white-label controls', async () => {
  const put = vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } });
  const user = userEvent.setup();
  renderWithQueryAndRouter(<WhiteLabel />);

  const footerBranding = await screen.findByRole('switch', { name: 'Hide admin footer branding' });
  const emailBranding = screen.getByRole('switch', { name: 'Hide email footer branding' });
  expect(footerBranding).toBeChecked();
  expect(emailBranding).not.toBeChecked();
  await user.click(footerBranding);
  await user.click(emailBranding);
  await user.type(screen.getByLabelText('Copyright text'), 'Example Ltd');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() =>
    expect(put).toHaveBeenCalledWith('/white-label/config', {
      hideFooterBranding: false,
      hideEmailBranding: true,
      customCopyright: 'Example Ltd',
    })
  );
});

it('shows widget branding by default and persists both toggle choices', async () => {
  const put = vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
    hidePoweredBy = (body as { hidePoweredBy: boolean }).hidePoweredBy;
    return { data: { success: true } };
  });
  const user = userEvent.setup();
  const first = renderWithQueryAndRouter(<WhiteLabel />);
  const toggle = await screen.findByRole('switch', { name: 'Show BugPin branding' });
  expect(toggle).toBeChecked();
  await user.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  expect(put).toHaveBeenLastCalledWith('/white-label/config', { hidePoweredBy: true });
  first.unmount();

  renderWithQueryAndRouter(<WhiteLabel />);
  const restored = await screen.findByRole('switch', { name: 'Show BugPin branding' });
  expect(restored).not.toBeChecked();
  await user.click(restored);
  await waitFor(() => expect(restored).toBeChecked());
  expect(put).toHaveBeenLastCalledWith('/white-label/config', { hidePoweredBy: false });
});

it('keeps the saved widget branding choice when updating it fails', async () => {
  vi.spyOn(api, 'put').mockRejectedValue(new Error('License unavailable'));
  const user = userEvent.setup();
  renderWithQueryAndRouter(<WhiteLabel />);

  const toggle = await screen.findByRole('switch', { name: 'Show BugPin branding' });
  await user.click(toggle);
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update widget branding'));
  expect(toggle).toBeChecked();
});

it('keeps an unsaved copyright edit when the widget branding switch saves', async () => {
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: {
      config: {
        hideFooterBranding: true,
        hideEmailBranding: false,
        hidePoweredBy,
        customCopyright: 'Old Ltd',
      },
    },
  }));
  const put = vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
    const changes = body as { hidePoweredBy?: boolean };
    if (changes.hidePoweredBy !== undefined) hidePoweredBy = changes.hidePoweredBy;
    return { data: { success: true } };
  });
  const user = userEvent.setup();
  renderWithQueryAndRouter(<WhiteLabel />);

  const copyright = await screen.findByLabelText('Copyright text');
  await user.clear(copyright);
  await user.type(copyright, 'New Ltd');

  const toggle = screen.getByRole('switch', { name: 'Show BugPin branding' });
  await user.click(toggle);
  await waitFor(() => expect(toggle).not.toBeChecked());
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  expect(put).toHaveBeenLastCalledWith('/white-label/config', { hidePoweredBy: true });
  expect(screen.getByLabelText('Copyright text')).toHaveValue('New Ltd');

  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() =>
    expect(put).toHaveBeenLastCalledWith('/white-label/config', { customCopyright: 'New Ltd' })
  );
});
