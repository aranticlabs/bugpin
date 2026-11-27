import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { ProjectReporterPortalSection } from '../../../components/project/settings/ProjectReporterPortalSection';
import { projectSettingsToForm } from '../../../components/project/settings/projectSettingsForm';
import { toast } from 'sonner';
import type { ProjectSettings } from '@shared/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => vi.clearAllMocks());

const globalSettings = {
  appUrl: 'https://bugpin.example.com',
  portalBaseUrl: 'https://feedback.example.com',
  reporterNotifications: {
    emailEnabled: true,
    notifyOnNewReport: true,
    notifyOnStatusChange: true,
    notifyOnPriorityChange: true,
    notifyOnAssignment: true,
    messagingEnabled: true,
  },
  reporterPortal: { enabled: false, allowNewReports: false },
};

function Harness({
  missing = [],
  settings = {},
  locked = false,
}: {
  missing?: string[];
  settings?: ProjectSettings;
  locked?: boolean;
}) {
  const [form, setForm] = useState(() => projectSettingsToForm(settings, null));
  return (
    <ProjectReporterPortalSection
      projectId="project-1"
      form={form}
      update={(changes) => setForm((previous) => ({ ...previous, ...changes }))}
      project={{ settings, reporterPortalPrerequisites: missing, licenseLocked: locked }}
      globalSettings={globalSettings}
    />
  );
}

describe('Project Reporter Portal', () => {
  it('gates enablement and test login on prerequisites and explains disabled emails', () => {
    renderWithProviders(
      <Harness
        missing={['appUrl', 'smtp', 'https']}
        settings={{ reporterNotifications: { emailEnabled: false } }}
      />
    );
    expect(screen.getByRole('switch', { name: 'Let reporters see their reports' })).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Allow new reports from the portal' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send me a test login link' })).toBeDisabled();
    expect(screen.getAllByText('Missing')).toHaveLength(3);
    expect(screen.getByText(/Confirmation emails are disabled/)).toBeInTheDocument();
    expect(screen.queryByText(/Reporter messaging is disabled/)).not.toBeInTheDocument();
    expect(screen.getByText(/Portal access and email updates are independent/)).toBeInTheDocument();
    expect(
      screen.getByText(/Conversations and their files follow the report's retention period/)
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Configure' }).map((link) => link.getAttribute('href'))
    ).toEqual(['/settings/general', '/settings/email', '/settings/general']);
  });

  it('shows the inherited defaults read-only until Custom is turned on', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    expect(screen.getByText('Inherited')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Let reporters see their reports' })).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Use custom reporter portal settings' }));
    expect(screen.queryByText('Inherited')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Let reporters see their reports' })).toBeEnabled();
  });

  it('clears new-report permission when the portal is switched off', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('switch', { name: 'Use custom reporter portal settings' }));
    const enabled = screen.getByRole('switch', { name: 'Let reporters see their reports' });
    const newReports = screen.getByRole('switch', { name: 'Allow new reports from the portal' });
    expect(enabled).not.toBeChecked();
    expect(newReports).toBeDisabled();
    await user.click(enabled);
    await user.click(newReports);
    expect(newReports).toBeChecked();
    await user.click(enabled);
    expect(newReports).not.toBeChecked();
    expect(newReports).toBeDisabled();
    await user.click(enabled);
    expect(newReports).not.toBeChecked();
  });

  it('lets admins disable new submissions after prerequisites fail and blocks enabling them again', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        missing={['smtp']}
        settings={{ reporterPortal: { enabled: true, allowNewReports: true } }}
      />
    );
    const portal = screen.getByRole('switch', { name: 'Let reporters see their reports' });
    const newReportsSwitch = screen.getByRole('switch', {
      name: 'Allow new reports from the portal',
    });
    expect(newReportsSwitch).toBeEnabled();
    expect(newReportsSwitch).toBeChecked();
    await user.click(newReportsSwitch);
    expect(portal).toBeChecked();
    expect(newReportsSwitch).not.toBeChecked();
    expect(newReportsSwitch).toBeDisabled();
    await user.click(newReportsSwitch);
    expect(newReportsSwitch).not.toBeChecked();
  });

  it('copies the portal URL and sends a test login without a user-selected recipient', async () => {
    let body: string | undefined;
    server.use(
      http.post('/api/projects/project-1/reporter-portal/test-login', async ({ request }) => {
        body = await request.text();
        return HttpResponse.json({ success: true });
      })
    );
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderWithProviders(<Harness />);
    expect(screen.getByLabelText('Portal URL')).toHaveValue(
      'https://feedback.example.com/reporter-portal'
    );
    await user.click(screen.getByRole('button', { name: 'Copy portal URL' }));
    expect(copy).toHaveBeenCalledWith('https://feedback.example.com/reporter-portal');
    await user.click(screen.getByRole('button', { name: 'Send me a test login link' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Test login email sent'));
    expect(body).toBe('');
  });

  it('shows delivery failures without a success message', async () => {
    server.use(
      http.post('/api/projects/project-1/reporter-portal/test-login', () =>
        HttpResponse.json(
          { error: 'EMAIL_DELIVERY_FAILED', message: 'Could not send the login email' },
          { status: 502 }
        )
      )
    );
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Send me a test login link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send the login email');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('keeps portal mutations disabled for a read-only project', () => {
    renderWithProviders(
      <Harness locked settings={{ reporterPortal: { enabled: true, allowNewReports: false } }} />
    );
    expect(screen.getByRole('switch', { name: 'Let reporters see their reports' })).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Allow new reports from the portal' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send me a test login link' })).toBeDisabled();
  });
});
