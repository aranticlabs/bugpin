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
    expect(screen.getByRole('switch', { name: 'Let reporters see their feedback' })).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Allow new feedback from the portal' })
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

  it('clears new-feedback permission when the portal is switched off', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness />);
    const enabled = screen.getByRole('switch', { name: 'Let reporters see their feedback' });
    const newFeedback = screen.getByRole('switch', { name: 'Allow new feedback from the portal' });
    expect(enabled).not.toBeChecked();
    expect(newFeedback).toBeDisabled();
    await user.click(enabled);
    await user.click(newFeedback);
    expect(newFeedback).toBeChecked();
    await user.click(enabled);
    expect(newFeedback).not.toBeChecked();
    expect(newFeedback).toBeDisabled();
    await user.click(enabled);
    expect(newFeedback).not.toBeChecked();
  });

  it('lets admins disable new submissions after prerequisites fail and blocks enabling them again', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Harness
        missing={['smtp']}
        settings={{ reporterPortal: { enabled: true, allowNewFeedback: true } }}
      />
    );
    const portal = screen.getByRole('switch', { name: 'Let reporters see their feedback' });
    const feedback = screen.getByRole('switch', { name: 'Allow new feedback from the portal' });
    expect(feedback).toBeEnabled();
    expect(feedback).toBeChecked();
    await user.click(feedback);
    expect(portal).toBeChecked();
    expect(feedback).not.toBeChecked();
    expect(feedback).toBeDisabled();
    await user.click(feedback);
    expect(feedback).not.toBeChecked();
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
      <Harness locked settings={{ reporterPortal: { enabled: true, allowNewFeedback: false } }} />
    );
    expect(screen.getByRole('switch', { name: 'Let reporters see their feedback' })).toBeDisabled();
    expect(
      screen.getByRole('switch', { name: 'Allow new feedback from the portal' })
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send me a test login link' })).toBeDisabled();
  });
});
