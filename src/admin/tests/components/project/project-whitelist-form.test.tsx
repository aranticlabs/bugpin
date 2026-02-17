import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectWhitelistForm } from '../../../components/project/ProjectWhitelistForm';
import { render, screen, userEvent } from '../../utils';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockToast = toast as unknown as { error: ReturnType<typeof vi.fn> };

describe('ProjectWhitelistForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a valid origin and clears input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ProjectWhitelistForm value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/example.com/i);
    await user.type(input, 'example.com');
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(onChange).toHaveBeenCalledWith(['example.com']);
    expect(input).toHaveValue('');
  });

  it('rejects invalid origins', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ProjectWhitelistForm value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/example.com/i);
    await user.type(input, 'http://bad-url');
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('blocks duplicate origins', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ProjectWhitelistForm value={['example.com']} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/example.com/i);
    await user.type(input, 'example.com');
    await user.click(screen.getByRole('button', { name: /add/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('removes origins from the list', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { container } = render(
      <ProjectWhitelistForm value={['example.com']} onChange={onChange} />,
    );

    const buttons = Array.from(container.querySelectorAll('button'));
    const removeButton = buttons.find((button) => button.textContent?.trim() === '');
    expect(removeButton).toBeTruthy();

    await user.click(removeButton as HTMLElement);

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('clears custom settings when toggled off', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCustomToggle = vi.fn();

    render(
      <ProjectWhitelistForm
        value={['example.com']}
        onChange={onChange}
        showCustomToggle
        useCustomSettings
        onCustomToggle={onCustomToggle}
      />,
    );

    const toggle = screen.getByRole('switch', { name: /use custom domain whitelist/i });
    await user.click(toggle);

    expect(onCustomToggle).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
