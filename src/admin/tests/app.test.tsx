import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, screen } from './utils';
import { App } from '../App';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../components/Layout', async () => {
  const React = await import('react');
  const { Outlet } = await import('react-router-dom');
  return {
    Layout: () =>
      React.createElement('div', { 'data-testid': 'layout' }, React.createElement(Outlet)),
  };
});

vi.mock('../pages/Login', () => ({
  Login: () => <div>Login Page</div>,
}));

vi.mock('../pages/workspace/Dashboard', () => ({
  Dashboard: () => <div>Dashboard Page</div>,
}));

vi.mock('../pages/workspace/Reports', () => ({
  Reports: () => <div>Reports Page</div>,
}));

vi.mock('../pages/workspace/ReportDetail', () => ({
  ReportDetail: () => <div>Report Detail Page</div>,
}));

vi.mock('../pages/workspace/ProjectsPage', () => ({
  ProjectsPage: () => <div>Projects Page</div>,
}));

vi.mock('../pages/settings/SettingsRouter', async () => {
  const { useLocation } = await import('react-router-dom');
  return {
    SettingsRouter: () => {
      const location = useLocation();
      return <div>Settings at {location.pathname}</div>;
    },
  };
});

const mockUseAuth = useAuth as unknown as ReturnType<typeof vi.fn>;

describe('App routes', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('redirects unauthenticated users to login', async () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });

    renderWithRouter(<App />, { initialEntries: ['/'] });

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it.each(['admin', 'editor', 'viewer'])('opens Projects for %s users', async (role) => {
    mockUseAuth.mockReturnValue({ user: { role }, isLoading: false });

    renderWithRouter(<App />, { initialEntries: ['/projects'] });

    expect(await screen.findByText('Projects Page')).toBeInTheDocument();
  });

  it('renders the settings area under /settings', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'viewer' }, isLoading: false });

    renderWithRouter(<App />, { initialEntries: ['/settings/account/profile'] });

    expect(await screen.findByText('Settings at /settings/account/profile')).toBeInTheDocument();
  });

  it.each([
    ['/security', '/settings/authentication'],
    ['/users', '/settings/users'],
    ['/license', '/settings/license'],
    ['/button', '/settings/project-defaults/launcher-button'],
    ['/notifications#email-templates', '/settings/email'],
  ])('redirects the former page %s to %s', async (entry, target) => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' }, isLoading: false });

    renderWithRouter(<App />, { initialEntries: [entry] });

    expect(await screen.findByText(`Settings at ${target}`)).toBeInTheDocument();
  });
});
