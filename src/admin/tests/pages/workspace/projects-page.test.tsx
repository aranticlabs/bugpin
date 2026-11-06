import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { mockUsers } from '../../mocks/handlers';
import { renderWithProviders, screen, userEvent, waitFor, within } from '../../utils';
import { useAuth } from '../../../contexts/AuthContext';
import { licenseApi } from '../../../api/license';
import { ProjectsPage } from '../../../pages/workspace/ProjectsPage';
import type { PinnedProject, ProjectSummary, User } from '@shared/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { toast } from 'sonner';

const PROJECTS: ProjectSummary[] = [
  {
    id: 'p-beta',
    name: 'Beta',
    isActive: true,
    activeReportsCount: 2,
    reportsCount: 9,
    createdAt: '2026-01-15T09:00:00.000Z',
    lastReportAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    integrationTypes: ['github', 'jira'],
    apiKeyPrefix: 'proj_betakey',
  },
  { id: 'p-alpha', name: 'alpha', isActive: false, activeReportsCount: 7, reportsCount: 7 },
  { id: 'p-gamma', name: 'Gamma', isActive: true, activeReportsCount: 0, reportsCount: 1 },
];

interface RecordedRequest {
  method: string;
  path: string;
  body?: unknown;
}

let requests: RecordedRequest[] = [];

async function record(request: Request, response: object = { success: true }) {
  const text = await request.text();
  requests.push({
    method: request.method,
    path: new URL(request.url).pathname,
    body: text ? JSON.parse(text) : undefined,
  });
  return HttpResponse.json(response);
}

function useProjects(projects: ProjectSummary[] = PROJECTS, pinned: PinnedProject[] = []) {
  server.use(
    http.get('/api/projects/summaries', () => HttpResponse.json({ success: true, projects })),
    http.get('/api/projects/pinned', () => HttpResponse.json({ success: true, projects: pinned }))
  );
}

function SignedIn({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  return isLoading || !user ? null : <>{children}</>;
}

function CurrentPath() {
  const location = useLocation();
  return <output aria-label="Current path">{location.pathname + location.search}</output>;
}

function renderPage() {
  return renderWithProviders(
    <SignedIn>
      <ProjectsPage />
      <CurrentPath />
    </SignedIn>,
    { initialEntries: ['/projects'] }
  );
}

function signInAs(user: Partial<User> & Pick<User, 'id' | 'email' | 'name' | 'role'>) {
  server.use(
    http.get('/api/auth/me', () => HttpResponse.json({ success: true, authenticated: true, user }))
  );
}

function projectNames(): string[] {
  const body = screen.getAllByRole('rowgroup')[1];
  return within(body)
    .getAllByRole('row')
    .map((row) => within(row).getAllByRole('link')[0].textContent ?? '');
}

function rowOf(name: string): HTMLElement {
  const link = screen.getByRole('link', { name });
  const row = link.closest('tr');
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

beforeEach(() => {
  requests = [];
  vi.spyOn(licenseApi, 'getStatus').mockResolvedValue({ eeAvailable: false, licensed: false });
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn() },
    writable: true,
    configurable: true,
  });
  server.use(
    http.put('/api/projects/:id/pin', ({ request }) => record(request)),
    http.delete('/api/projects/:id/pin', ({ request }) => record(request)),
    http.patch('/api/projects/:id', ({ request }) => record(request)),
    http.delete('/api/projects/:id', ({ request }) => record(request)),
    http.get('/api/projects/:id', ({ params }) =>
      HttpResponse.json({
        success: true,
        project: { id: params.id, name: 'Beta', apiKey: 'proj_beta_key', reportsCount: 9 },
      })
    ),
    http.post('/api/projects/:id/regenerate-key', ({ request }) =>
      record(request, {
        success: true,
        project: { id: 'p-beta', name: 'Beta', apiKey: 'proj_new_key', reportsCount: 9 },
      })
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('ProjectsPage', () => {
  it('lists every project with status and report counts in the custom order', async () => {
    useProjects();
    renderPage();

    expect(await screen.findByRole('link', { name: 'Beta' })).toHaveAttribute(
      'href',
      '/projects/p-beta'
    );
    expect(projectNames()).toEqual(['Beta', 'alpha', 'Gamma']);
    const beta = rowOf('Beta');
    expect(within(beta).getByText('Active')).toBeInTheDocument();
    expect(within(beta).getByRole('link', { name: '2' })).toHaveAttribute(
      'href',
      '/projects/p-beta?status=open%2Cin_progress'
    );
    expect(within(beta).getByRole('link', { name: '9' })).toHaveAttribute(
      'href',
      '/projects/p-beta'
    );
    expect(within(rowOf('alpha')).getByText('Paused')).toBeInTheDocument();
    expect(within(rowOf('Gamma')).queryByRole('link', { name: '0' })).not.toBeInTheDocument();
    expect(screen.getByText('3 projects')).toBeInTheDocument();
  });

  it('pages through projects with the chosen page size', async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 30 }, (_, index) => ({
      id: `p-${index + 1}`,
      name: `Project ${String(index + 1).padStart(2, '0')}`,
      isActive: true,
      activeReportsCount: 0,
      reportsCount: 0,
    }));
    useProjects(many);
    renderPage();

    await screen.findByRole('link', { name: 'Project 01' });
    expect(projectNames()).toHaveLength(10);
    expect(screen.getByText('30 projects')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(projectNames()[0]).toBe('Project 11');
    expect(projectNames()).toHaveLength(10);
    expect(screen.getByLabelText('Current path')).toHaveTextContent('page=2');

    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }));
    await user.click(await screen.findByRole('option', { name: '25' }));
    expect(projectNames()).toHaveLength(25);
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Search projects'), '1');
    expect(screen.getByLabelText('Current path')).not.toHaveTextContent('page=');
  });

  it('puts Create Project in the toolbar next to the table', async () => {
    useProjects();
    renderPage();

    const create = await screen.findByRole('button', { name: 'Create Project' });
    expect(create.closest('div.ml-auto')?.parentElement).toContainElement(
      screen.getByLabelText('Search projects')
    );
  });

  it('shows the last report, integrations, creation date, and key prefix', async () => {
    useProjects();
    renderPage();

    const beta = rowOf(
      await screen.findByRole('link', { name: 'Beta' }).then((l) => l.textContent ?? '')
    );
    expect(within(beta).getByText('3h ago')).toBeInTheDocument();
    expect(within(beta).getByText('GitHub, Jira')).toBeInTheDocument();
    expect(within(beta).getByText('Jan 15, 2026')).toBeInTheDocument();
    expect(within(beta).getByText('proj_betakey…')).toBeInTheDocument();
    const gamma = rowOf('Gamma');
    expect(within(gamma).getByText('Never')).toBeInTheDocument();
    expect(within(gamma).getByText('None')).toBeInTheDocument();
  });

  it('sorts by a column and flips the direction on a second click', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    await screen.findByRole('link', { name: 'Beta' });
    await user.click(screen.getByRole('button', { name: /^project/i }));
    expect(projectNames()).toEqual(['alpha', 'Beta', 'Gamma']);
    expect(screen.getByLabelText('Current path')).toHaveTextContent('/projects?sort=name&dir=asc');

    const openHeader = screen.getByRole('button', { name: /open reports/i });
    await user.click(openHeader);
    expect(projectNames()).toEqual(['alpha', 'Beta', 'Gamma']);
    expect(openHeader.closest('th')).toHaveAttribute('aria-sort', 'descending');

    await user.click(openHeader);
    expect(projectNames()).toEqual(['Gamma', 'Beta', 'alpha']);

    await user.click(screen.getByRole('button', { name: /total reports/i }));
    expect(projectNames()).toEqual(['Beta', 'alpha', 'Gamma']);

    await user.click(screen.getByRole('button', { name: /^status/i }));
    expect(projectNames()).toEqual(['Beta', 'Gamma', 'alpha']);

    await user.click(screen.getByRole('button', { name: 'Custom order' }));
    expect(projectNames()).toEqual(['Beta', 'alpha', 'Gamma']);
    expect(screen.getByLabelText('Current path')).toHaveTextContent(/^\/projects$/);
  });

  it('offers drag handles in the custom order only while unfiltered', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    expect(await screen.findByRole('button', { name: 'Reorder Beta' })).toBeEnabled();
    expect(rowOf('Beta')).not.toHaveAttribute('role');
    await user.type(screen.getByLabelText('Search projects'), 'b');
    expect(screen.getByRole('button', { name: 'Reorder Beta' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /^project/i }));
    expect(screen.queryByRole('button', { name: 'Reorder Beta' })).not.toBeInTheDocument();
    expect(rowOf('Beta')).not.toHaveAttribute('role');
  });

  it('filters to pinned projects', async () => {
    const user = userEvent.setup();
    useProjects(PROJECTS, [
      { id: 'p-gamma', name: 'Gamma', isActive: true, activeReportsCount: 0 },
    ]);
    renderPage();

    await screen.findByRole('link', { name: 'Beta' });
    await user.click(screen.getByRole('button', { name: 'Pinned' }));
    expect(projectNames()).toEqual(['Gamma']);
    expect(screen.getByText('1 project')).toBeInTheDocument();
    expect(screen.getByLabelText('Current path')).toHaveTextContent('pinned=1');
  });

  it('opens a project when its row is clicked', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    await screen.findByRole('link', { name: 'Gamma' });
    await user.click(within(rowOf('Gamma')).getByText('Active'));
    expect(screen.getByLabelText('Current path')).toHaveTextContent(/^\/projects\/p-gamma$/);
  });

  it('keeps row controls from opening the project', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Select Beta' }));
    await user.click(screen.getByRole('button', { name: 'Pin Beta' }));
    await user.click(screen.getByRole('button', { name: 'Pause Beta' }));
    expect(screen.getByLabelText('Current path')).toHaveTextContent(/^\/projects$/);
  });

  it('shows the pin next to the name on hover, and always once pinned', async () => {
    useProjects(PROJECTS, [
      { id: 'p-gamma', name: 'Gamma', isActive: true, activeReportsCount: 0 },
    ]);
    renderPage();

    const pin = await screen.findByRole('button', { name: 'Pin Beta' });
    expect(within(rowOf('Beta')).getAllByRole('cell')[2]).toContainElement(pin);
    expect(pin).toHaveClass('opacity-0', 'group-hover:opacity-100');
    const unpin = screen.getByRole('button', { name: 'Unpin Gamma' });
    expect(unpin).not.toHaveClass('opacity-0');
    expect(unpin).toHaveAttribute('aria-pressed', 'true');
    expect(unpin.querySelector('.lucide-pin')).toHaveClass('fill-current', 'text-primary');
  });

  it.each([
    ['Pause Beta', 'Stop accepting reports'],
    ['Activate alpha', 'Resume accepting reports'],
    ['Pause Locked', 'Read-only at the license limit'],
    ['Settings of Beta', 'Project settings'],
  ])('explains "%s" in a tooltip, also when disabled', async (button, text) => {
    const user = userEvent.setup();
    useProjects([
      ...PROJECTS,
      {
        id: 'p-locked',
        name: 'Locked',
        isActive: true,
        licenseLocked: true,
        activeReportsCount: 0,
        reportsCount: 0,
      },
    ]);
    renderPage();

    await screen.findByRole('link', { name: 'Beta' });
    const control =
      screen.queryByRole('link', { name: button }) ?? screen.getByRole('button', { name: button });
    const trigger = control.parentElement;
    if (!trigger) throw new Error('Missing tooltip trigger');
    await user.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(text);
  });

  it('links Settings straight to the project settings tab', async () => {
    useProjects();
    renderPage();

    expect(await screen.findByRole('link', { name: 'Settings of Beta' })).toHaveAttribute(
      'href',
      '/projects/p-beta?tab=general'
    );
    expect(screen.queryByRole('link', { name: 'Integrations of Beta' })).not.toBeInTheDocument();
  });

  it.each([
    ['Paused', ['alpha']],
    ['Active', ['Beta', 'Gamma']],
    ['Read-only', ['Locked']],
  ])('filters projects by status %s', async (status, expected) => {
    const user = userEvent.setup();
    useProjects([
      ...PROJECTS,
      {
        id: 'p-locked',
        name: 'Locked',
        isActive: true,
        licenseLocked: true,
        activeReportsCount: 0,
        reportsCount: 0,
      },
    ]);
    renderPage();

    await screen.findByRole('link', { name: 'Beta' });
    await user.click(screen.getByRole('combobox', { name: 'Filter by status' }));
    await user.click(await screen.findByRole('option', { name: status }));
    expect(projectNames()).toEqual(expected);
  });

  it('filters projects by name', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    await user.type(await screen.findByLabelText('Search projects'), 'ga');
    expect(projectNames()).toEqual(['Gamma']);
  });

  it('pins and unpins projects', async () => {
    const user = userEvent.setup();
    useProjects(PROJECTS, [
      { id: 'p-gamma', name: 'Gamma', isActive: true, activeReportsCount: 0 },
    ]);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Pin Beta' }));
    await user.click(screen.getByRole('button', { name: 'Unpin Gamma' }));
    await waitFor(() =>
      expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
        'PUT /api/projects/p-beta/pin',
        'DELETE /api/projects/p-gamma/pin',
      ])
    );
  });

  it('keeps pinning available beyond five projects', async () => {
    const pinned = [1, 2, 3, 4, 5].map((index) => ({
      id: `p-${index}`,
      name: `Pinned ${index}`,
      isActive: true,
      activeReportsCount: 0,
    }));
    useProjects([...pinned, ...PROJECTS], pinned);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Pin Beta' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Unpin Pinned 1' })).toBeEnabled();
  });

  it('gives viewers the list without management actions', async () => {
    signInAs(mockUsers.viewer);
    useProjects(PROJECTS.map(({ apiKeyPrefix: _prefix, ...project }) => project));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Pin Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Project' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause Beta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions for Beta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reorder Beta' })).not.toBeInTheDocument();
    expect(screen.queryByText('proj_betakey…')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('creates a project with a trimmed name and shows its API key', async () => {
    const user = userEvent.setup();
    useProjects();
    let receivedName = '';
    server.use(
      http.post('/api/projects', async ({ request }) => {
        receivedName = ((await request.json()) as { name: string }).name;
        return HttpResponse.json({
          success: true,
          project: { id: 'p-new', name: receivedName, apiKey: 'proj_created_key' },
        });
      })
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Create Project' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('Project name is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/project name/i), '   New Project   ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('proj_created_key')).toBeInTheDocument();
    expect(receivedName).toBe('New Project');
    expect(toast.success).toHaveBeenCalledWith('Project created successfully');
  });

  it('shows the API key and widget snippet of a project', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'API key of Beta' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('proj_beta_key')).toBeInTheDocument();
    expect(within(dialog).getByText(/data-api-key="proj_beta_key"/)).toBeInTheDocument();
  });

  it('pauses and activates projects', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Pause Beta' }));
    await user.click(screen.getByRole('button', { name: 'Activate alpha' }));
    await waitFor(() =>
      expect(requests).toEqual([
        { method: 'PATCH', path: '/api/projects/p-beta', body: { isActive: false } },
        { method: 'PATCH', path: '/api/projects/p-alpha', body: { isActive: true } },
      ])
    );
  });

  it('regenerates an API key after confirmation and shows the new key', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'More actions for Beta' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Regenerate API key' }));
    const confirm = await screen.findByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Regenerate' }));

    expect(await screen.findByText('proj_new_key')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('API key regenerated successfully');
  });

  it('deletes a project only after typing DELETE', async () => {
    const user = userEvent.setup();
    useProjects();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'More actions for Beta' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete project' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/type delete/i), 'DELETE');
    await user.click(confirm);
    await waitFor(() =>
      expect(requests).toContainEqual({
        method: 'DELETE',
        path: '/api/projects/p-beta',
        body: undefined,
      })
    );
  });

  it('blocks creation at the license limit and marks excess projects read-only', async () => {
    const user = userEvent.setup();
    vi.spyOn(licenseApi, 'getStatus').mockResolvedValue({
      eeAvailable: true,
      licensed: true,
      projectLimit: 1,
      usedProjects: 1,
      licensedProjectIds: ['p-beta'],
      selectionRequired: false,
    });
    useProjects([
      {
        id: 'p-locked',
        name: 'Locked',
        isActive: true,
        licenseLocked: true,
        activeReportsCount: 0,
        reportsCount: 1,
      },
    ]);
    renderPage();

    expect(await screen.findByText('Read-only · License limit')).toBeInTheDocument();
    expect(await screen.findByText('1 of 1 used')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Licensed projects used' })).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Create Project' });
    expect(create).toBeDisabled();
    await user.hover(create.parentElement as HTMLElement);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'All 1 licensed projects are in use'
    );
    expect(screen.getByRole('button', { name: 'Pause Locked' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'More actions for Locked' }));
    expect(await screen.findByRole('menuitem', { name: 'Regenerate API key' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitem', { name: 'Delete project' })).not.toHaveAttribute(
      'aria-disabled'
    );
  });

  describe('bulk actions', () => {
    async function selectProjects(user: ReturnType<typeof userEvent.setup>, names: string[]) {
      for (const name of names) {
        await user.click(await screen.findByRole('checkbox', { name: `Select ${name}` }));
      }
    }

    it('shows the bulk toolbar once projects are selected', async () => {
      const user = userEvent.setup();
      useProjects();
      renderPage();

      await screen.findByRole('link', { name: 'Beta' });
      expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
      await selectProjects(user, ['Beta', 'Gamma']);
      expect(screen.getByText('2 projects selected')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Clear' }));
      expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    });

    it('selects all visible projects', async () => {
      const user = userEvent.setup();
      useProjects();
      renderPage();

      await user.type(await screen.findByLabelText('Search projects'), 'a');
      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      expect(screen.getByText('3 projects selected')).toBeInTheDocument();

      await user.clear(screen.getByLabelText('Search projects'));
      await user.type(screen.getByLabelText('Search projects'), 'gam');
      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
      expect(screen.getByText('1 project selected')).toBeInTheDocument();
    });

    it('pauses and activates the selected projects', async () => {
      const user = userEvent.setup();
      useProjects();
      renderPage();

      await selectProjects(user, ['Beta', 'Gamma']);
      await user.click(screen.getByRole('button', { name: 'Pause' }));
      await waitFor(() =>
        expect(requests).toEqual([
          { method: 'PATCH', path: '/api/projects/p-beta', body: { isActive: false } },
          { method: 'PATCH', path: '/api/projects/p-gamma', body: { isActive: false } },
        ])
      );
      expect(toast.success).toHaveBeenCalledWith('2 projects paused');
      expect(screen.queryByText(/selected$/)).not.toBeInTheDocument();
    });

    it('pins only the unpinned selected projects', async () => {
      const user = userEvent.setup();
      const pinned = [1, 2, 3, 4].map((index) => ({
        id: `p-${index}`,
        name: `Pinned ${index}`,
        isActive: true,
        activeReportsCount: 0,
      }));
      useProjects([...pinned, ...PROJECTS], pinned);
      renderPage();

      await selectProjects(user, ['Beta', 'Gamma', 'Pinned 1']);
      await user.click(screen.getByRole('button', { name: 'Pin' }));
      await waitFor(() =>
        expect(requests.map((request) => `${request.method} ${request.path}`).sort()).toEqual([
          'PUT /api/projects/p-beta/pin',
          'PUT /api/projects/p-gamma/pin',
        ])
      );
    });

    it('unpins the selected pinned projects', async () => {
      const user = userEvent.setup();
      useProjects(PROJECTS, [
        { id: 'p-gamma', name: 'Gamma', isActive: true, activeReportsCount: 0 },
      ]);
      renderPage();

      await selectProjects(user, ['Beta', 'Gamma']);
      await user.click(screen.getByRole('button', { name: 'Unpin' }));
      await waitFor(() =>
        expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
          'DELETE /api/projects/p-gamma/pin',
        ])
      );
    });

    it('deletes the selected projects after typing DELETE', async () => {
      const user = userEvent.setup();
      useProjects();
      renderPage();

      await selectProjects(user, ['alpha', 'Gamma']);
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      const dialog = await screen.findByRole('alertdialog');
      expect(within(dialog).getByText('Delete 2 projects')).toBeInTheDocument();
      expect(within(dialog).getByText(/"alpha", "Gamma"/)).toBeInTheDocument();

      await user.type(within(dialog).getByLabelText(/type delete/i), 'DELETE');
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() =>
        expect(requests.map((request) => `${request.method} ${request.path}`)).toEqual([
          'DELETE /api/projects/p-alpha',
          'DELETE /api/projects/p-gamma',
        ])
      );
      expect(toast.success).toHaveBeenCalledWith('2 projects deleted');
    });

    it('reports projects that could not be updated', async () => {
      const user = userEvent.setup();
      useProjects();
      server.use(
        http.patch('/api/projects/p-gamma', () =>
          HttpResponse.json({ success: false }, { status: 400 })
        )
      );
      renderPage();

      await selectProjects(user, ['Beta', 'Gamma']);
      await user.click(screen.getByRole('button', { name: 'Activate' }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('1 project could not be activated')
      );
      expect(toast.success).toHaveBeenCalledWith('1 project activated');
    });

    it('blocks pausing when a read-only project is selected', async () => {
      const user = userEvent.setup();
      useProjects([
        ...PROJECTS,
        {
          id: 'p-locked',
          name: 'Locked',
          isActive: true,
          licenseLocked: true,
          activeReportsCount: 0,
          reportsCount: 0,
        },
      ]);
      renderPage();

      await selectProjects(user, ['Beta', 'Locked']);
      expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    });

    it('offers no selection to viewers', async () => {
      signInAs(mockUsers.viewer);
      useProjects();
      renderPage();

      await screen.findByRole('link', { name: 'Beta' });
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });
});
