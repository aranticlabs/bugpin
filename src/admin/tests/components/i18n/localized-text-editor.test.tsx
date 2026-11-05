import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithQuery as render } from '../../utils';
import userEvent from '@testing-library/user-event';
import { LocalizedTextEditor } from '../../../components/i18n/LocalizedTextEditor';

describe('LocalizedTextEditor', () => {
  it('renders the override switch off when project value is undefined', () => {
    const onChange = vi.fn();
    render(
      <LocalizedTextEditor
        layer="project"
        value={undefined}
        onChange={onChange}
        label="Button Text"
      />
    );

    const toggle = screen.getByRole('switch', { name: /override button text at project level/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it('renders the override switch off when global value is null', () => {
    const onChange = vi.fn();
    render(
      <LocalizedTextEditor layer="global" value={null} onChange={onChange} label="Button Text" />
    );

    const toggle = screen.getByRole('switch', { name: /use custom button text/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it('emits an empty LocalizedString seed when toggling the project switch on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocalizedTextEditor
        layer="project"
        value={undefined}
        onChange={onChange}
        label="Button Text"
      />
    );

    await user.click(
      screen.getByRole('switch', { name: /override button text at project level/i })
    );
    expect(onChange).toHaveBeenCalledWith({ en: '' });
  });

  it('emits undefined when toggling the project switch off from a custom value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocalizedTextEditor
        layer="project"
        value={{ en: 'Custom' }}
        onChange={onChange}
        label="Button Text"
      />
    );

    await user.click(
      screen.getByRole('switch', { name: /override button text at project level/i })
    );
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('emits null when toggling the global switch off from a custom value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocalizedTextEditor
        layer="global"
        value={{ en: 'Custom' }}
        onChange={onChange}
        label="Button Text"
      />
    );

    await user.click(screen.getByRole('switch', { name: /use custom button text/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('renders the locale select and accepts en input when in custom mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <LocalizedTextEditor
        layer="project"
        value={{ en: '' }}
        onChange={onChange}
        label="Button Text"
      />
    );

    expect(screen.getByRole('combobox', { name: /language/i })).toBeInTheDocument();

    const enInput = screen.getByRole('textbox');
    await user.type(enInput, 'H');
    expect(onChange).toHaveBeenCalledWith({ en: 'H' });
  });

  it('disables the input when not in custom mode', () => {
    const onChange = vi.fn();
    render(
      <LocalizedTextEditor
        layer="global"
        value={null}
        onChange={onChange}
        label="Tooltip Text"
        builtInPreview={{ en: 'Found a bug?' }}
      />
    );

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    expect(input).toHaveValue('Found a bug?');
  });
});
