import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '../../utils';
import { server } from '../../mocks/server';
import { mockDashboardPersonal } from '../../mocks/handlers';
import { ProfileTabs } from '../../../components/profile/ProfileTabs';
import type { GamificationSelf } from '@shared/types';

function gamificationFor(self: GamificationSelf) {
  server.use(
    http.get('/api/gamification/me', () =>
      HttpResponse.json({ success: true, gamification: self })
    ),
    http.get('/api/dashboard/me', () =>
      HttpResponse.json({
        success: true,
        personal: {
          ...mockDashboardPersonal,
          gamification: self.optedOut
            ? null
            : {
                xp: 300,
                level: 3,
                levelStartXp: 250,
                nextLevelXp: 500,
                achievements: [
                  {
                    id: 'hatchling',
                    current: 1,
                    target: 1,
                    unlockedAt: '2026-11-01T10:00:00.000Z',
                  },
                ],
              },
        },
      })
    )
  );
}

describe('ProfileTabs', () => {
  it('has no Hunter’s log tab while gamification is not available', async () => {
    renderWithProviders(<ProfileTabs />, { initialEntries: ['/?tab=hunters-log'] });
    expect(await screen.findByRole('tab', { name: 'Account' })).toHaveAttribute(
      'data-state',
      'active'
    );
    expect(screen.queryByRole('tab', { name: "Hunter's log" })).not.toBeInTheDocument();
  });

  it('shows the switch and the stats when gamification is on', async () => {
    gamificationFor({ available: true, canOptOut: true, optedOut: false });
    renderWithProviders(<ProfileTabs />, { initialEntries: ['/?tab=hunters-log'] });

    expect(await screen.findByRole('switch', { name: 'Enable gamification' })).toBeChecked();
    expect((await screen.findAllByText(/Level 3 · Tracker/)).length).toBeGreaterThan(0);
    const tablists = screen.getAllByRole('tablist');
    const tabs = tablists[tablists.length - 1];
    if (!tabs) throw new Error('missing inner tabs');
    expect(within(tabs).getByRole('tab', { name: 'Team' })).toBeInTheDocument();
  });

  it('keeps only the switch after opting out', async () => {
    gamificationFor({ available: true, canOptOut: true, optedOut: true });
    renderWithProviders(<ProfileTabs />, { initialEntries: ['/?tab=hunters-log'] });

    expect(await screen.findByRole('switch', { name: 'Enable gamification' })).not.toBeChecked();
    expect(screen.getByText(/Gamification is off for you/)).toBeInTheDocument();
    expect(screen.queryByText(/Level 3/)).not.toBeInTheDocument();
  });
});
