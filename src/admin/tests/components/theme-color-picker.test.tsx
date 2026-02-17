import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  it('generates dark mode colors from light mode values', () => {
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
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /generate from light mode/i }));

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
});
