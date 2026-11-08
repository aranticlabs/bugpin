import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { server } from '../../mocks/server';
import { mockUsers } from '../../mocks/handlers';
import { renderWithProviders, screen, userEvent, waitFor } from '../../utils';
import { useAuth } from '../../../contexts/AuthContext';
import { AccountCard } from '../../../components/profile/AccountCard';
import { api } from '../../../api/client';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function SignedIn({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  return isLoading || !user ? null : <>{children}</>;
}

function renderCard() {
  return renderWithProviders(
    <SignedIn>
      <AccountCard />
    </SignedIn>
  );
}

let profilePatches: Record<string, unknown>[] = [];

function stubImage(outcome: 'load' | 'error') {
  class StubImage extends EventTarget {
    width = 64;
    height = 64;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      setTimeout(() => {
        this.dispatchEvent(new Event(outcome));
        if (outcome === 'load') this.onload?.();
        else this.onerror?.();
      });
    }
  }
  vi.stubGlobal('Image', StubImage);
}

beforeEach(() => {
  profilePatches = [];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:avatar'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  server.use(
    http.patch('/api/users/me/profile', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      profilePatches.push(body);
      return HttpResponse.json({ success: true, user: { ...mockUsers.admin, ...body } });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function editName(user: ReturnType<typeof userEvent.setup>, value: string) {
  const name = await screen.findByLabelText(/^Name/);
  await user.clear(name);
  await user.type(name, value);
  return name;
}

describe('AccountCard', () => {
  it('keeps an unsaved name when the avatar is uploaded', async () => {
    const user = userEvent.setup();
    stubImage('load');
    let avatarUrl = mockUsers.admin.avatarUrl;
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({
          success: true,
          authenticated: true,
          user: { ...mockUsers.admin, avatarUrl },
        })
      )
    );
    const post = vi.spyOn(api, 'post').mockImplementation(async () => {
      avatarUrl = '/uploads/new-avatar.png';
      return { data: { success: true, url: avatarUrl } };
    });
    renderCard();

    const name = await editName(user, 'Edited Name');
    await user.click(screen.getByRole('button', { name: 'Change profile picture' }));
    const input = (await screen.findByRole('dialog')).querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('File input not found');
    await user.upload(input, new File(['avatar'], 'avatar.png', { type: 'image/png' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Avatar updated successfully'));
    expect(post).toHaveBeenCalledWith('/users/me/avatar', expect.any(FormData), expect.anything());
    expect(name).toHaveValue('Edited Name');
  });

  it('keeps an unsaved name when the avatar is removed', async () => {
    const user = userEvent.setup();
    renderCard();

    const name = await editName(user, 'Edited Name');
    await user.click(screen.getByRole('button', { name: 'Change profile picture' }));
    await user.click(await screen.findByRole('button', { name: 'Remove Avatar' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Avatar removed successfully'));
    expect(name).toHaveValue('Edited Name');
  });

  it('reports an image that cannot be read', async () => {
    const user = userEvent.setup();
    stubImage('error');
    renderCard();

    await user.click(await screen.findByRole('button', { name: 'Change profile picture' }));
    const input = (await screen.findByRole('dialog')).querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('File input not found');
    await user.upload(input, new File(['broken'], 'broken.png', { type: 'image/png' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not read the image. Choose another file.')
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
  });

  it('saves a new name without asking for the password', async () => {
    const user = userEvent.setup();
    renderCard();

    await editName(user, 'Edited Name');
    expect(screen.queryByLabelText(/Current password/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(profilePatches).toEqual([{ name: 'Edited Name' }]));
  });

  it('asks for the current password before changing the email address', async () => {
    const user = userEvent.setup();
    renderCard();

    const email = await screen.findByLabelText(/^Email Address/);
    await user.clear(email);
    await user.type(email, 'new@example.com');
    const password = screen.getByLabelText(/Current password/);
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('Enter your current password to change your email address')
    ).toBeInTheDocument();
    expect(profilePatches).toEqual([]);

    await user.type(password, 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(profilePatches).toEqual([
        { email: 'new@example.com', currentPassword: 'correct-password' },
      ])
    );
  });

  it('shows a wrong password next to the password field', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/users/me/profile', () =>
        HttpResponse.json(
          {
            success: false,
            error: 'INVALID_PASSWORD',
            message: 'The current password is incorrect',
          },
          { status: 400 }
        )
      )
    );
    renderCard();

    const email = await screen.findByLabelText(/^Email Address/);
    await user.clear(email);
    await user.type(email, 'new@example.com');
    await user.type(screen.getByLabelText(/Current password/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('The current password is incorrect')).toBeInTheDocument();
    expect(screen.getByLabelText(/Current password/)).toHaveAttribute('aria-invalid', 'true');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
