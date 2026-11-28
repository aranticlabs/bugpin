import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../utils';
import { NotificationDefaults } from '../../../pages/console/NotificationDefaults';
import { mockSettingsServer } from './settingsServer';

describe('NotificationDefaults', () => {
  it('saves the global reporter-reply default', async () => {
    const settingsServer = mockSettingsServer();
    const user = userEvent.setup();
    renderWithProviders(<NotificationDefaults />);
    await user.click(await screen.findByRole('switch', { name: 'Reporter replies' }));
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(settingsServer.puts).toEqual([{ notifications: { notifyOnReporterReply: false } }])
    );
  });

  it('saves team and reporter defaults together, sending only the changed fields', async () => {
    const settingsServer = mockSettingsServer();
    const user = userEvent.setup();
    renderWithProviders(<NotificationDefaults />);

    await screen.findByRole('tab', { name: 'Reporter' });
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: /status changes/i }));
    await user.click(screen.getByRole('tab', { name: 'Reporter' }));
    const assignmentSwitch = await screen.findByRole('switch', { name: /assignment changes/i });
    expect(assignmentSwitch).toHaveAttribute('aria-checked', 'true');
    await user.click(assignmentSwitch);
    expect(assignmentSwitch).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(settingsServer.puts).toEqual([
        {
          notifications: { notifyOnStatusChange: false },
          reporterNotifications: { notifyOnAssignment: false },
        },
      ]);
    });
  });

  it('waits for the save bar before saving the email switch and other tab edits together', async () => {
    const settingsServer = mockSettingsServer();
    const user = userEvent.setup();
    renderWithProviders(<NotificationDefaults />);

    await user.click(await screen.findByRole('switch', { name: /new reports/i }));
    await user.click(screen.getByRole('tab', { name: 'Reporter' }));
    await user.click(await screen.findByRole('switch', { name: /email notifications/i }));

    expect(settingsServer.puts).toHaveLength(0);

    await user.click(screen.getByRole('tab', { name: 'Team' }));
    expect(await screen.findByRole('switch', { name: /new reports/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(settingsServer.puts).toHaveLength(1));
    expect(settingsServer.puts[0]).toEqual({
      notifications: { notifyOnNewReport: false },
      reporterNotifications: { emailEnabled: false },
    });
  });
});
