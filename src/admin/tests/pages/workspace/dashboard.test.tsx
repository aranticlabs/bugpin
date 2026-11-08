import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { renderWithProviders } from '../../utils';
import { Dashboard } from '../../../pages/workspace/Dashboard';
import { server } from '../../mocks/server';
import { mockDashboardOverview, mockDashboardPersonal, mockUsers } from '../../mocks/handlers';
import type { DashboardActivityItem, DashboardPersonal, UserPreferences } from '@shared/types';

const withGamification: DashboardPersonal = {
  ...mockDashboardPersonal,
  gamification: {
    xp: 300,
    level: 3,
    levelStartXp: 250,
    nextLevelXp: 500,
    achievements: [
      { id: 'hatchling', current: 1, target: 1, unlockedAt: '2026-11-01T10:00:00.000Z' },
      { id: 'cocoon', current: 12, target: 100 },
    ],
  },
};

function signInAs(user: (typeof mockUsers)[keyof typeof mockUsers]) {
  server.use(
    http.get('/api/auth/me', () => HttpResponse.json({ success: true, authenticated: true, user }))
  );
}

describe('Dashboard Page', () => {
  it('greets the user by first name for the time of day', async () => {
    renderWithProviders(<Dashboard />);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toMatch(
      /^(Good morning|Good afternoon|Good evening|Working late), Admin$/
    );
  });

  it('shows the KPIs, the active reports and the reports that need attention', async () => {
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Active reports')).toBeInTheDocument();
    expect(screen.getByText('Median time to resolve')).toBeInTheDocument();
    expect(screen.getByText('Active reports by priority')).toBeInTheDocument();
    expect(screen.getByText('Checkout fails on submit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /assign/i })).toBeInTheDocument();
    expect(screen.getByText('Login button broken').closest('a')).toHaveAttribute(
      'href',
      '/reports/report-1'
    );
  });

  it('shows personal time to resolve to admins and editors', async () => {
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Your time to resolve')).toBeInTheDocument();
    expect(screen.getByText('26 h to resolve')).toBeInTheDocument();
    expect(screen.queryByText(/^Level /)).not.toBeInTheDocument();
  });

  it('shows the real totals and links each list to the Reports page', async () => {
    const user = userEvent.setup();
    const { mockDashboardOverview } = await import('../../mocks/handlers');
    server.use(
      http.get('/api/dashboard/overview', () =>
        HttpResponse.json({
          success: true,
          overview: { ...mockDashboardOverview, needsAttentionTotal: 23 },
        })
      )
    );
    renderWithProviders(<Dashboard />);

    const attentionTab = await screen.findByRole('tab', { name: /Needs attention/ });
    expect(attentionTab).toHaveTextContent('23');
    expect(screen.getByText('Showing 1 of 23')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View open reports/ })).toHaveAttribute(
      'href',
      '/reports?status=open%2Cin_progress&sort=priority&dir=desc'
    );

    await user.click(screen.getByRole('tab', { name: /Assigned to you/ }));
    expect(await screen.findByRole('link', { name: /View all assigned to you/ })).toHaveAttribute(
      'href',
      '/reports?assignedTo=__me__&status=open%2Cin_progress'
    );
  });

  it('keeps viewers to the shared overview', async () => {
    signInAs(mockUsers.viewer);
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Checkout fails on submit')).toBeInTheDocument();
    expect(screen.queryByText('Your time to resolve')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /assigned to you/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign/i })).not.toBeInTheDocument();
  });

  it('shows the level and announces achievements the user has not seen yet', async () => {
    server.use(
      http.get('/api/dashboard/me', () =>
        HttpResponse.json({ success: true, personal: withGamification })
      ),
      http.get('/api/user-preferences/me', () =>
        HttpResponse.json({ success: true, preferences: { seenAchievements: [] } })
      )
    );
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Level 3 · Tracker')).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Achievement unlocked: Hatchling')).toBeInTheDocument();
  });

  it('explains how XP is earned on the Levels tab', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/dashboard/me', () =>
        HttpResponse.json({ success: true, personal: withGamification })
      )
    );
    renderWithProviders(<Dashboard />);
    await user.click(await screen.findByRole('button', { name: /show levels/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: "Hunter's log" })).toBeInTheDocument();
    expect(within(dialog).getByText('Resolved within 60 min')).toBeInTheDocument();
    const messageRow = within(dialog).getByText('Message to a reporter').closest('div');
    expect(messageRow).toHaveTextContent('+5');
  });

  it('ranks teammates on the Team tab by the chosen period', async () => {
    const user = userEvent.setup();
    const achievements = withGamification.gamification?.achievements ?? [];
    const periods: string[] = [];
    server.use(
      http.get('/api/dashboard/me', () =>
        HttpResponse.json({ success: true, personal: withGamification })
      ),
      http.get('/api/dashboard/team', ({ request }) => {
        const period = new URL(request.url).searchParams.get('period') ?? '';
        periods.push(period);
        return HttpResponse.json({
          success: true,
          team: {
            ranking: true,
            period,
            members: [
              {
                id: 'user-2',
                name: 'Editor User',
                level: 5,
                xp: 1200,
                periodXp: period === 'all' ? 1200 : 240,
                achievements,
              },
              { id: 'user-1', name: 'Admin User', level: 3, xp: 300, periodXp: 80, achievements },
            ],
          },
        });
      })
    );
    renderWithProviders(<Dashboard />);
    await user.click(await screen.findByRole('button', { name: /show levels/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('tab', { name: 'Team' }));

    const rows = await within(dialog).findAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Editor User');
    expect(rows[0]).toHaveTextContent('240 XP');
    expect(rows[0]).toHaveTextContent('last 30 days');
    expect(rows[1]).toHaveTextContent('You');
    expect(within(rows[0]).queryByRole('button')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('combobox', { name: 'Ranking period' }));
    await user.click(await screen.findByRole('option', { name: 'All time' }));
    await waitFor(() => expect(periods).toContain('all'));
    expect(await within(dialog).findByText('1,200 XP')).toBeInTheDocument();
    expect(periods[0]).toBe('30d');
  });

  it('does not announce achievements unlocked before the user first saw the dashboard', async () => {
    server.use(
      http.get('/api/dashboard/me', () =>
        HttpResponse.json({ success: true, personal: withGamification })
      )
    );
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Level 3 · Tracker')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists recent reports in the Recent tab', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/reports', () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 'rpt_recent',
              projectId: 'project-1',
              projectName: 'Test Project',
              title: 'Recent Report',
              status: 'open',
              priority: 'high',
              metadata: { url: 'https://example.com/page' },
              createdAt: new Date().toISOString(),
            },
          ],
          total: 1,
          page: 1,
          limit: 6,
        })
      )
    );
    renderWithProviders(<Dashboard />);
    await user.click(await screen.findByRole('tab', { name: 'Recent' }));
    const link = (await screen.findByText('Recent Report')).closest('a');
    expect(link).toHaveAttribute('href', '/reports/rpt_recent');
  });

  it('shows a spinner while the overview loads', async () => {
    server.use(
      http.get('/api/dashboard/overview', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      })
    );
    renderWithProviders(<Dashboard />);
    await screen.findByRole('heading', { level: 1 });
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('asks the server for the selected range', async () => {
    const ranges: string[] = [];
    server.use(
      http.get('/api/dashboard/overview', async ({ request }) => {
        ranges.push(new URL(request.url).searchParams.get('range') ?? '');
        const { mockDashboardOverview } = await import('../../mocks/handlers');
        return HttpResponse.json({ success: true, overview: mockDashboardOverview });
      })
    );
    renderWithProviders(<Dashboard />);
    await waitFor(() => expect(ranges).toContain('30'));
  });

  it('announces achievements unlocked together one after another, saving each once dismissed', async () => {
    const user = userEvent.setup();
    const saved: UserPreferences[] = [];
    const twoNew: DashboardPersonal = {
      ...withGamification,
      gamification: {
        ...(withGamification.gamification as NonNullable<DashboardPersonal['gamification']>),
        achievements: [
          { id: 'hatchling', current: 1, target: 1, unlockedAt: '2026-11-01T10:00:00.000Z' },
          { id: 'amber', current: 1, target: 1, unlockedAt: '2026-11-01T10:00:00.000Z' },
        ],
      },
    };
    server.use(
      http.get('/api/dashboard/me', () => HttpResponse.json({ success: true, personal: twoNew })),
      http.get('/api/user-preferences/me', () =>
        HttpResponse.json({ success: true, preferences: { seenAchievements: [] } })
      ),
      http.patch('/api/user-preferences/me', async ({ request }) => {
        const body = (await request.json()) as UserPreferences;
        saved.push(body);
        return HttpResponse.json({ success: true, preferences: body });
      })
    );
    renderWithProviders(<Dashboard />);

    const first = await screen.findByRole('dialog');
    expect(within(first).getByText('Achievement unlocked: Hatchling')).toBeInTheDocument();
    expect(saved).toEqual([]);
    await user.click(within(first).getByRole('button', { name: 'Keep going' }));

    const second = await screen.findByRole('dialog');
    expect(await within(second).findByText('Achievement unlocked: Amber find')).toBeInTheDocument();
    await waitFor(() => expect(saved).toEqual([{ seenAchievements: ['hatchling'] }]));
    await user.click(within(second).getByRole('button', { name: 'Keep going' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(saved[saved.length - 1]).toEqual({ seenAchievements: ['hatchling', 'amber'] });
  });

  it('records what is already unlocked on the first visit without a dialog', async () => {
    const saved: UserPreferences[] = [];
    server.use(
      http.get('/api/dashboard/me', () =>
        HttpResponse.json({ success: true, personal: withGamification })
      ),
      http.patch('/api/user-preferences/me', async ({ request }) => {
        const body = (await request.json()) as UserPreferences;
        saved.push(body);
        return HttpResponse.json({ success: true, preferences: body });
      })
    );
    renderWithProviders(<Dashboard />);
    await waitFor(() => expect(saved).toEqual([{ seenAchievements: ['hatchling'] }]));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the XP a resolution would earn, and nothing for reports that earn none', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/dashboard/me', () =>
        HttpResponse.json({
          success: true,
          personal: { ...withGamification, resolveXp: { rpt_fast: 60, rpt_again: 0 } },
        })
      ),
      http.get('/api/reports', () =>
        HttpResponse.json({
          success: true,
          data: [
            {
              id: 'rpt_fast',
              title: 'Fast one',
              status: 'open',
              priority: 'high',
              createdAt: new Date().toISOString(),
              projectName: 'Shop',
            },
            {
              id: 'rpt_again',
              title: 'Seen before',
              status: 'open',
              priority: 'high',
              createdAt: new Date().toISOString(),
              projectName: 'Shop',
            },
          ],
          total: 2,
        })
      )
    );
    renderWithProviders(<Dashboard />);
    await user.click(await screen.findByRole('tab', { name: /Assigned to you/ }));

    const fast = (await screen.findByText('Fast one')).closest('.flex-col') as HTMLElement;
    expect(within(fast).getByRole('button', { name: /Resolve/ })).toHaveTextContent('+60 XP');
    const again = screen.getByText('Seen before').closest('.flex-col') as HTMLElement;
    expect(within(again).getByRole('button', { name: /Resolve/ })).not.toHaveTextContent('XP');
  });

  it('offers a retry when the assigned reports fail to load', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get('/api/reports', () =>
        fail
          ? HttpResponse.json({ success: false }, { status: 400 })
          : HttpResponse.json({ success: true, data: [], total: 0 })
      )
    );
    renderWithProviders(<Dashboard />);
    await user.click(await screen.findByRole('tab', { name: /Assigned to you/ }));

    expect(await screen.findByText("Couldn't load your assigned reports")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Your queue is clear')).toBeInTheDocument();
  });

  it('names system ownership activity without a staff author', async () => {
    server.use(
      http.get('/api/dashboard/overview', () =>
        HttpResponse.json({
          success: true,
          overview: {
            ...mockDashboardOverview,
            activity: [
              {
                id: 'ownership',
                reportId: 'report-1',
                reportTitle: 'Login button broken',
                action: 'owner_assigned',
                actor: 'system',
                createdAt: new Date().toISOString(),
              },
            ],
          },
        })
      )
    );
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('System')).toBeInTheDocument();
    expect(screen.getByText('assigned a reporter to')).toBeInTheDocument();
    expect(screen.queryByText('Deleted user')).not.toBeInTheDocument();
  });

  it('names the widget and deleted users in the activity feed, with priority labels', async () => {
    const entry = (overrides: Partial<DashboardActivityItem>): DashboardActivityItem => ({
      id: `history-${overrides.action}-${overrides.actor}`,
      reportId: 'report-1',
      reportTitle: 'Login button broken',
      action: 'created',
      createdAt: new Date().toISOString(),
      actor: 'user',
      ...overrides,
    });
    server.use(
      http.get('/api/dashboard/overview', () =>
        HttpResponse.json({
          success: true,
          overview: {
            ...mockDashboardOverview,
            activity: [
              entry({ action: 'created', actor: 'widget' }),
              entry({ action: 'status_changed', newValue: 'closed', actor: 'deleted_user' }),
              entry({
                action: 'priority_changed',
                newValue: 'highest',
                actor: 'user',
                userId: 'user-2',
                userName: 'Editor User',
              }),
              ...(
                [
                  'owner_assigned',
                  'owner_removed',
                  'claimable_set',
                  'message_hidden',
                  'message_unhidden',
                ] as const
              ).map((action) => entry({ action, userName: 'Editor User' })),
            ],
          },
        })
      )
    );
    renderWithProviders(<Dashboard />);
    expect(await screen.findByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Deleted user')).toBeInTheDocument();
    expect(screen.getByText('set priority to highest on')).toBeInTheDocument();
    for (const label of [
      'assigned a reporter to',
      'removed the reporter from',
      'allowed a reporter to claim',
      'hid a message on',
      'unhid a message on',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
