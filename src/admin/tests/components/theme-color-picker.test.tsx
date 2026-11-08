import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeColorPicker } from '../../components/ThemeColorPicker';
import { ColorPicker } from '../../components/ui/color-picker';

vi.mock('react-colorful', () => ({
  HexColorPicker: ({ onChange }: { onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange('#123456')}>
      Pick
    </button>
  ),
}));

describe('ThemeColorPicker', () => {
  it('generates dark mode colors from light mode values', async () => {
    const onChange = vi.fn();

    render(
      <ThemeColorPicker
        value={{
          lightButtonColor: '#000000',
          lightTextColor: '#ffffff',
          lightButtonHoverColor: '#101010',
          lightTextHoverColor: '#eeeeee',
          darkButtonColor: '#000000',
          darkTextColor: '#000000',
          darkButtonHoverColor: '#000000',
          darkTextHoverColor: '#000000',
        }}
        onChange={onChange}
      />
    );

    // Switch to dark mode tab where the generate button lives
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Dark' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate from light mode/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /generate from light mode/i }));

    expect(onChange).toHaveBeenCalledWith({
      darkButtonColor: '#505050',
      darkTextColor: '#373737',
      darkButtonHoverColor: '#747474',
      darkTextHoverColor: '#262626',
    });
  });
});

describe('ColorPicker', () => {
  it('updates from the text input when valid', () => {
    const onChange = vi.fn();

    render(<ColorPicker value="#000000" onChange={onChange} />);

    const input = screen.getByPlaceholderText('#02658D');
    fireEvent.change(input, { target: { value: '#12ab34' } });

    expect(onChange).toHaveBeenCalledWith('#12ab34');
  });

  it('ignores invalid input values', () => {
    const onChange = vi.fn();

    render(<ColorPicker value="#000000" onChange={onChange} />);

    const input = screen.getByPlaceholderText('#02658D');
    fireEvent.change(input, { target: { value: 'not-a-color' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits changes from the color picker', () => {
    const onChange = vi.fn();

    render(<ColorPicker value="#000000" onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: /pick a color/i });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole('button', { name: /^pick$/i }));

    expect(onChange).toHaveBeenCalledWith('#123456');
  });

  it('holds partial hex input locally and restores the last valid color on blur', () => {
    const onChange = vi.fn();

    render(<ColorPicker value="#000000" onChange={onChange} label="Button Color" />);

    const input = screen.getByRole('textbox', { name: 'Button Color' });
    fireEvent.change(input, { target: { value: '#12' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('#12');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use the #RRGGBB format.')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(input).toHaveValue('#000000');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});
