import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../../utils';
import { server } from '../../mocks/server';
import { GamificationPreferenceCard } from '../../../components/profile/GamificationPreferenceCard';

describe('GamificationPreferenceCard', () => {
  it('stays hidden when the user cannot opt out', async () => {
    const { container } = renderWithProviders(<GamificationPreferenceCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('lets the user hide levels and achievements', async () => {
    const user = userEvent.setup();
    const saved: unknown[] = [];
    server.use(
      http.get('/api/gamification/me', () =>
        HttpResponse.json({
          success: true,
          gamification: { available: true, canOptOut: true, optedOut: false, active: true },
        })
      ),
      http.patch('/api/gamification/me', async ({ request }) => {
        const body = (await request.json()) as { optedOut: boolean };
        saved.push(body);
        return HttpResponse.json({
          success: true,
          gamification: {
            available: true,
            canOptOut: true,
            optedOut: body.optedOut,
            active: !body.optedOut,
          },
        });
      })
    );
    renderWithProviders(<GamificationPreferenceCard />);
    const toggle = await screen.findByRole('switch', { name: 'Enable gamification' });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(saved).toEqual([{ optedOut: true }]);
  });
});
