import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { renderWithProviders } from '../utils';
import { Projects } from '../../pages/Projects';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from 'sonner';

let writeTextMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  // Mock clipboard API on navigator
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: writeTextMock,
      readText: vi.fn(),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Projects Page', () => {
  it('renders projects page heading', async () => {
    renderWithProviders(<Projects />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  it('renders without crashing', () => {
    renderWithProviders(<Projects />);
    expect(document.body).toBeInTheDocument();
  });

  it('displays create project button', async () => {
    renderWithProviders(<Projects />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument();
    });
  });

  it('displays project cards after loading', async () => {
    renderWithProviders(<Projects />);

    await waitFor(
      () => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('opens create project modal when button clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Projects />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /create project/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
    });
  });

  it('handles empty projects state', async () => {
    server.use(
      http.get('/api/projects', () => {
        return HttpResponse.json({
          success: true,
          projects: [],
        });
      }),
    );

    renderWithProviders(<Projects />);

    await waitFor(
      () => {
        expect(screen.getByText(/no projects/i)).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });

  it('shows delete confirmation dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Projects />);

    await waitFor(
      () => {
        expect(screen.getByText('Test Project')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Find and click first delete button
    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });
  });

  it('displays API key and widget snippet when expanded', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Projects />);

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    // Click on the project card header to expand it
    await user.click(screen.getByText('Test Project'));

    // Wait for the API Key label to appear (indicating the card is expanded)
    await waitFor(() => {
      expect(screen.getByText('API Key')).toBeInTheDocument();
    });

    // Find the API key code element - it should contain the API key
    const codeElements = document.querySelectorAll('code');
    const apiKeyCode = Array.from(codeElements).find((el) =>
      el.textContent?.includes('test-api-key-123'),
    );
    expect(apiKeyCode).toBeTruthy();
    expect(apiKeyCode?.textContent).toContain('test-api-key-123');

    // Find widget snippet section
    const snippetLabels = screen.getAllByText('Widget Snippet');
    expect(snippetLabels.length).toBeGreaterThan(0);

    // Verify the snippet contains the API key placeholder
    const snippetSection = snippetLabels[0].closest('.space-y-2');
    expect(snippetSection).toBeInTheDocument();

    const snippetPre = snippetSection?.querySelector('pre');
    expect(snippetPre?.textContent).toContain('data-api-key="test-api-key-123"');
  });

  it('creates a project with trimmed name and validates required fields', async () => {
    const user = userEvent.setup();
    let receivedName = '';

    server.use(
      http.post('/api/projects', async ({ request }) => {
        const body = (await request.json()) as { name: string };
        receivedName = body.name;
        return HttpResponse.json({
          success: true,
          project: {
            id: 'project-new',
            name: body.name,
            apiKey: 'new-api-key-789',
            reportsCount: 0,
          },
        });
      }),
    );

    renderWithProviders(<Projects />);

    await user.click(await screen.findByRole('button', { name: /create project/i }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Project name is required')).toBeInTheDocument();

    const input = screen.getByLabelText(/project name/i);
    await user.type(input, '   New Project   ');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(receivedName).toBe('New Project');
      expect(toast.success).toHaveBeenCalledWith('Project created successfully');
    });
  });

  it('regenerates API key via confirmation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Projects />);

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    const regenerateButtons = screen.getAllByRole('button', { name: /regenerate key/i });
    await user.click(regenerateButtons[0]);

    const regenDialog = await screen.findByRole('alertdialog');
    await user.click(within(regenDialog).getByRole('button', { name: 'Regenerate' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('API key regenerated successfully');
    });
  });

  it('shows delete confirmation dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Projects />);

    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    // Verify delete dialog appears
    const deleteDialog = await screen.findByRole('alertdialog');
    expect(within(deleteDialog).getByText(/are you sure/i)).toBeInTheDocument();

    // Verify both Cancel and Delete buttons are present
    expect(within(deleteDialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(deleteDialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
