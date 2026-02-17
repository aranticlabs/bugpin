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

vi.mock('../pages/Dashboard', () => ({
  Dashboard: () => <div>Dashboard Page</div>,
}));

vi.mock('../pages/Reports', () => ({
  Reports: () => <div>Reports Page</div>,
}));

vi.mock('../pages/ReportDetail', () => ({
  ReportDetail: () => <div>Report Detail Page</div>,
}));

vi.mock('../pages/Projects', () => ({
  Projects: () => <div>Projects Page</div>,
}));

vi.mock('../pages/globalsettings', () => ({
  Settings: () => <div>Settings Page</div>,
}));

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

  it('renders admin-only routes for admin users', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' }, isLoading: false });

    renderWithRouter(<App />, { initialEntries: ['/projects'] });

    expect(await screen.findByText('Projects Page')).toBeInTheDocument();
  });

  it('redirects non-admin users away from admin routes', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'user' }, isLoading: false });

    renderWithRouter(<App />, { initialEntries: ['/projects'] });

    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
  });
});
