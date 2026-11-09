import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { EmailTemplates } from '../../../pages/console/EmailTemplates';
import { api } from '../../../api/client';
import { toast } from 'sonner';

const licenseApiMocks = vi.hoisted(() => ({
  getFeatures: vi.fn(),
}));

vi.mock('../../../api/license', () => ({
  licenseApi: licenseApiMocks,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../../components/email/TemplateEditor', () => ({
  TemplateEditor: ({ value, onChange }: { value: string; onChange: (next: string) => void }) => (
    <textarea
      aria-label="Email Body"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('../../../components/email/TemplatePreview', () => ({
  TemplatePreview: () => <div data-testid="template-preview" />,
}));

vi.mock('../../../components/email/VariablesReference', () => ({
  VariablesReference: () => <div data-testid="variables-reference" />,
}));

vi.mock('../../../contexts/AuthContext', async () => {
  const React = await import('react');
  return {
    useAuth: () => ({
      user: {
        id: 'usr_1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
      },
      logout: () => undefined,
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

describe('EmailTemplates', () => {
  beforeEach(() => {
    licenseApiMocks.getFeatures.mockResolvedValue({
      features: { 'custom-templates': true },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockApi({
    overrides = {},
    smtpEnabled = true,
  }: {
    overrides?: Record<string, Record<string, { subject: string; html: string }>>;
    smtpEnabled?: boolean;
  } = {}) {
    const calls: Array<{ method: string; path: string; body?: unknown }> = [];

    vi.spyOn(api, 'get').mockImplementation((path: string) => {
      calls.push({ method: 'GET', path });
      if (path === '/templates') {
        return Promise.resolve({
          data: { success: true, templates: structuredClone(overrides) },
        } as never);
      }
      if (path === '/settings') {
        return Promise.resolve({
          data: { settings: { smtpEnabled, emailTemplates: {} } },
        } as never);
      }
      if (path.startsWith('/templates/') && path.endsWith('/defaults')) {
        return Promise.resolve({
          data: {
            success: true,
            templates: { en: { subject: 'Default subject', html: '<p>def</p>' } },
          },
        } as never);
      }
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });

    const putSpy = vi.spyOn(api, 'put').mockImplementation((path: string, body?: unknown) => {
      calls.push({ method: 'PUT', path, body });
      return Promise.resolve({ data: { success: true } } as never);
    });

    const deleteSpy = vi.spyOn(api, 'delete').mockImplementation((path: string) => {
      calls.push({ method: 'DELETE', path });
      return Promise.resolve({ data: { success: true } } as never);
    });

    return { calls, putSpy, deleteSpy };
  }

  it.each([
    ['Reporter Login', 'reporter.loginUrl'],
    ['Reporter Status Change', 'reporter.updateUrl'],
    ['Reporter Priority Change', 'report.portalUrl'],
    ['Reporter Message', 'reporter.updateUrl'],
    ['Reporter Assignment', 'report.portalUrl'],
  ])('warns when %s lacks its link variable', async (label, variable) => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<EmailTemplates />);
    await user.click(await screen.findByRole('button', { name: label }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      /This (login|update) template has no/
    );
    await user.clear(screen.getByLabelText('Email Body'));
    await user.type(screen.getByLabelText('Email Body'), variable);
    expect(screen.queryByText(/This (login|update) template has no/)).not.toBeInTheDocument();
  });

  it('keeps reporter-recipient link hints off the staff activity template', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<EmailTemplates />);
    await user.click(await screen.findByRole('button', { name: 'Reporter Activity' }));
    await waitFor(() => expect(screen.getByLabelText('Email Body')).toHaveValue('<p>def</p>'));
    expect(
      screen.queryByText(/This (login|update|confirmation) template has no/)
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders locale tabs and preloads built-in templates', async () => {
    mockApi();
    renderWithProviders(<EmailTemplates />);

    expect(await screen.findByRole('tab', { name: /English/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Deutsch/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Français/ })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Deutsch/ }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Subject Line/i)).toHaveValue('Default subject');
    });
  });

  it('offers reporter login templates and hints when confirmation has no sign-in link', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<EmailTemplates />);
    await user.click(await screen.findByRole('button', { name: 'Reporter Login' }));
    await waitFor(() => expect(screen.getByLabelText('Email Body')).toHaveValue('<p>def</p>'));
    await user.click(screen.getByRole('button', { name: 'Reporter Confirmation' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'This confirmation template has no reporter.loginUrl.'
    );
    await user.clear(screen.getByLabelText('Email Body'));
    await user.type(screen.getByLabelText('Email Body'), 'reporter.loginUrl');
    expect(
      screen.queryByText(/This confirmation template has no reporter.loginUrl/)
    ).not.toBeInTheDocument();
  });

  it('preserves draft state when switching between locale tabs', async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<EmailTemplates />);

    await screen.findByRole('tab', { name: /English/ });

    await user.click(screen.getByRole('tab', { name: /Deutsch/ }));
    const subjectField = await screen.findByLabelText(/Subject Line/i);
    await user.clear(subjectField);
    await user.type(subjectField, 'DE Subject');
    const bodyField = screen.getByLabelText(/Email Body/i);
    await user.type(bodyField, '<p>de body</p>');

    await user.click(screen.getByRole('tab', { name: /English/ }));
    expect(screen.getByLabelText(/Subject Line/i)).toHaveValue('Default subject');

    await user.click(screen.getByRole('tab', { name: /Deutsch/ }));
    expect(screen.getByLabelText(/Subject Line/i)).toHaveValue('DE Subject');
  });

  it('saves changed locales and resets overrides in one atomic request', async () => {
    const { calls } = mockApi({
      overrides: {
        newReport: {
          de: { subject: 'Old DE', html: '<p>old de</p>' },
        },
      },
    });

    const user = userEvent.setup();
    renderWithProviders(<EmailTemplates />);

    await screen.findByRole('tab', { name: /English/ });
    await user.click(screen.getByRole('tab', { name: /Deutsch/ }));

    await screen.findByLabelText(/Subject Line/i);
    await user.click(screen.getByRole('button', { name: /Reset .* to Default/i }));

    await user.click(screen.getByRole('tab', { name: /Français/ }));
    const frSubject = await screen.findByLabelText(/Subject Line/i);
    await user.clear(frSubject);
    await user.type(frSubject, 'FR Subject');
    const frBody = screen.getByLabelText(/Email Body/i);
    await user.clear(frBody);
    await user.type(frBody, '<p>fr body</p>');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Template saved successfully');
    });
    expect(screen.getByRole('tab', { name: /Français/ })).toHaveAttribute('aria-selected', 'true');

    const putCalls = calls.filter((c) => c.method === 'PUT');
    const deleteCalls = calls.filter((c) => c.method === 'DELETE');

    expect(putCalls).toEqual([
      {
        method: 'PUT',
        path: '/templates/newReport/locales',
        body: {
          templates: {
            de: null,
            fr: { subject: 'FR Subject', html: '<p>fr body</p>' },
          },
        },
      },
    ]);
    expect(deleteCalls).toHaveLength(0);
  });

  it('keeps the selected locale when unedited templates are refetched', async () => {
    const overrides = {
      newReport: { fr: { subject: 'French subject', html: '<p>French body</p>' } },
    };
    mockApi({ overrides });
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<EmailTemplates />);
    await user.click(await screen.findByRole('tab', { name: /Français/ }));
    expect(screen.getByLabelText(/Subject Line/i)).toHaveValue('French subject');

    overrides.newReport.fr.subject = 'Updated French subject';
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['custom-email-templates'] });
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Subject Line/i)).toHaveValue('Updated French subject');
    });
    expect(screen.getByRole('tab', { name: /Français/ })).toHaveAttribute('aria-selected', 'true');
  });
});
