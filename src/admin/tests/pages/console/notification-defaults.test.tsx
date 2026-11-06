import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders } from '../../utils';
import { NotificationDefaults } from '../../../pages/console/NotificationDefaults';

const teamAllOn = {
  emailEnabled: true,
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: true,
  notifyOnAssignment: true,
  notifyOnDeletion: true,
};

const reporterAllOn = {
  emailEnabled: true,
  notifyOnNewReport: true,
  notifyOnStatusChange: true,
  notifyOnPriorityChange: true,
  notifyOnAssignment: true,
  messagingEnabled: true,
};

describe('NotificationDefaults', () => {
  it('saves team and reporter defaults together', async () => {
    let savedBody: Record<string, unknown> | undefined;
    server.use(
      http.get('/api/settings', () =>
        HttpResponse.json({
          success: true,
          settings: { notifications: teamAllOn, reporterNotifications: reporterAllOn },
        })
      ),
      http.put('/api/settings', async ({ request }) => {
        savedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ success: true, settings: savedBody });
      })
    );

    const user = userEvent.setup();
    renderWithProviders(<NotificationDefaults />);

    await screen.findByRole('tab', { name: 'Reporter' });
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Reporter' }));
    const assignmentSwitch = await screen.findByRole('switch', { name: /assignment changes/i });
    expect(assignmentSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(assignmentSwitch);
    expect(assignmentSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(savedBody).toEqual({
        notifications: teamAllOn,
        reporterNotifications: { ...reporterAllOn, notifyOnAssignment: false },
      });
    });
  });
});
