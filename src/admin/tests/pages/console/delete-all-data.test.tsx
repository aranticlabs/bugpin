import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor } from '../../utils';
import { DeleteAllData } from '../../../pages/console/DeleteAllData';
import { api } from '../../../api/client';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

async function confirmDeletion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Delete All Data' }));
  const dialog = await screen.findByRole('alertdialog');
  await user.type(screen.getByLabelText(/to confirm/i), 'delete');
  await user.click(
    [...dialog.querySelectorAll('button')].find(
      (button) => button.textContent === 'Delete All Data'
    ) as HTMLElement
  );
}

describe('DeleteAllData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes the dialog after the data was deleted', async () => {
    // A real request resolves after the dialog re-rendered in its deleting state.
    const deleteSpy = vi
      .spyOn(api, 'delete')
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ data: { deleted: 3 } }), 50))
      );
    const user = userEvent.setup();
    renderWithQuery(<DeleteAllData />);

    await confirmDeletion(user);

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deleteSpy).toHaveBeenCalledWith('/settings/data', {
      data: { confirmation: 'delete' },
    });
    expect(toast.success).toHaveBeenCalledWith('Deleted 3 reports');
  });

  it('keeps the dialog open when deleting fails', async () => {
    vi.spyOn(api, 'delete').mockRejectedValue(new Error('Server error'));
    const user = userEvent.setup();
    renderWithQuery(<DeleteAllData />);

    await confirmDeletion(user);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
