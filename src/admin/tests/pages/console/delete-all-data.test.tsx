import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithQuery, screen, userEvent, waitFor, within } from '../../utils';
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
  await user.click(within(dialog).getByRole('button', { name: 'Delete All Data' }));
}

describe('DeleteAllData', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes the dialog after the data was deleted', async () => {
    // The request resolves only after the dialog re-rendered in its deleting state.
    let finishDelete!: (response: { data: { deleted: number } }) => void;
    const deleteSpy = vi.spyOn(api, 'delete').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDelete = resolve;
        })
    );
    const user = userEvent.setup();
    renderWithQuery(<DeleteAllData />);

    await confirmDeletion(user);

    const dialog = screen.getByRole('alertdialog');
    expect(await within(dialog).findByRole('button', { name: /deleting/i })).toBeDisabled();
    finishDelete({ data: { deleted: 3 } });

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
