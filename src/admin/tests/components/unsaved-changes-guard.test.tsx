import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { render, screen, userEvent, waitFor } from '../utils';
import { UnsavedChangesGuard, UnsavedChangesProvider } from '../../components/UnsavedChangesGuard';
import { useConfirmUnsavedChanges } from '../../hooks/useConfirmUnsavedChanges';

function DirtyForm({ name, onSave }: { name: string; onSave: () => Promise<unknown> }) {
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <UnsavedChangesGuard isDirty={dirty} onSave={onSave} />
      <button type="button" onClick={() => setDirty(true)}>{`Edit ${name}`}</button>
    </>
  );
}

function Page({ saves }: { saves: Array<() => Promise<unknown>> }) {
  const [showSecond, setShowSecond] = useState(true);
  return (
    <>
      <DirtyForm name="first" onSave={saves[0]} />
      {showSecond && <DirtyForm name="second" onSave={saves[1]} />}
      <button type="button" onClick={() => setShowSecond(false)}>
        Close second
      </button>
      <Link to="/elsewhere">Leave page</Link>
    </>
  );
}

function renderPage(saves: Array<() => Promise<unknown>>) {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <UnsavedChangesProvider>
          <Page saves={saves} />
        </UnsavedChangesProvider>
      ),
    },
    { path: '/elsewhere', element: <p>Elsewhere page</p> },
  ]);
  return render(<RouterProvider router={router} />);
}

describe('UnsavedChangesProvider', () => {
  it('saves every form with changes before leaving', async () => {
    const saveFirst = vi.fn().mockResolvedValue(undefined);
    const saveSecond = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage([saveFirst, saveSecond]);

    await user.click(screen.getByRole('button', { name: 'Edit first' }));
    await user.click(screen.getByRole('button', { name: 'Edit second' }));
    await user.click(screen.getByRole('link', { name: 'Leave page' }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Elsewhere page')).toBeInTheDocument();
    expect(saveFirst).toHaveBeenCalledTimes(1);
    expect(saveSecond).toHaveBeenCalledTimes(1);
  });

  it('stays on the page when a save fails', async () => {
    const saveFirst = vi.fn().mockRejectedValue(new Error('Server error'));
    const saveSecond = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage([saveFirst, saveSecond]);

    await user.click(screen.getByRole('button', { name: 'Edit first' }));
    await user.click(screen.getByRole('link', { name: 'Leave page' }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Elsewhere page')).not.toBeInTheDocument();
    expect(saveSecond).not.toHaveBeenCalled();
  });

  it('stops asking once the changed form is closed', async () => {
    const user = userEvent.setup();
    renderPage([vi.fn(), vi.fn()]);

    await user.click(screen.getByRole('button', { name: 'Edit second' }));
    await user.click(screen.getByRole('button', { name: 'Close second' }));
    await user.click(screen.getByRole('link', { name: 'Leave page' }));

    expect(await screen.findByText('Elsewhere page')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

function SwitchHarness({ onSave }: { onSave: () => Promise<unknown> }) {
  const [item, setItem] = useState('first');
  const [dirty, setDirty] = useState(false);
  const { confirm, dialog } = useConfirmUnsavedChanges({ isDirty: dirty, onSave });
  return (
    <>
      <p>{`Editing ${item}`}</p>
      <button type="button" onClick={() => setDirty(true)}>
        Edit
      </button>
      <button
        type="button"
        onClick={() =>
          confirm(() => {
            setItem('second');
            setDirty(false);
          })
        }
      >
        Switch item
      </button>
      {dialog}
    </>
  );
}

describe('useConfirmUnsavedChanges', () => {
  it('switches right away without unsaved changes', async () => {
    const user = userEvent.setup();
    render(<SwitchHarness onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Switch item' }));

    expect(screen.getByText('Editing second')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('keeps the current item when the switch is canceled', async () => {
    const user = userEvent.setup();
    render(<SwitchHarness onSave={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Switch item' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Editing first')).toBeInTheDocument();
  });

  it('switches after discarding the changes', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<SwitchHarness onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Switch item' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    expect(await screen.findByText('Editing second')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the changes before switching', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<SwitchHarness onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Switch item' }));
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Editing second')).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
