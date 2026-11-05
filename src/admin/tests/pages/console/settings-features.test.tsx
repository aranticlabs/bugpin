import { afterEach, expect, it, vi } from 'vitest';
import { renderWithQuery, screen } from '../../utils';
import { Webhooks } from '../../../pages/console/Webhooks';
import { api } from '../../../api/client';
import { licenseApi } from '../../../api/license';

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' } }) }));
afterEach(() => vi.restoreAllMocks());

it('does not load webhook configuration without the feature', async () => {
  vi.spyOn(licenseApi, 'getFeatures').mockResolvedValue({
    eeAvailable: true,
    features: { webhooks: false },
  });
  const get = vi.spyOn(api, 'get');
  renderWithQuery(<Webhooks />);

  expect(
    await screen.findByText('This feature requires an Enterprise license.')
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Upgrade to Enterprise' })).toHaveAttribute(
    'href',
    'https://bugpin.io/editions/'
  );
  expect(screen.queryByRole('button', { name: 'Add webhook' })).not.toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith('/webhooks');
  expect(get).not.toHaveBeenCalledWith('/projects');
});
