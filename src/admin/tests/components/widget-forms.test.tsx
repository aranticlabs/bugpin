import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WidgetDialogSettingsForm } from '../../components/WidgetDialogSettingsForm';
import { WidgetLauncherButtonSettingsForm } from '../../components/WidgetLauncherButtonSettingsForm';

vi.mock('../../components/ThemeColorPicker', () => ({
  ThemeColorPicker: ({
    onChange,
    disabled,
  }: {
    onChange: (value: Record<string, string>) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={() => onChange({ lightButtonColor: '#ff0000' })}
      disabled={disabled}
    >
      Pick Color
    </button>
  ),
}));

describe('WidgetDialogSettingsForm', () => {
  it('allows toggling custom settings off and resets to defaults', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCustomToggle = vi.fn();

    render(
      <WidgetDialogSettingsForm
        value={{ lightButtonColor: '#123456' }}
        onChange={onChange}
        showCustomToggle
        useCustomSettings
        onCustomToggle={onCustomToggle}
        showCard={false}
      />,
    );

    expect(
      screen.queryByRole('heading', { name: /widget dialog colors/i }),
    ).not.toBeInTheDocument();

    const toggle = screen.getByRole('switch', { name: /use custom settings/i });
    await user.click(toggle);

    expect(onCustomToggle).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledWith({});
  });
});

describe('WidgetLauncherButtonSettingsForm', () => {
  it('renders tabbed layout and emits changes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <WidgetLauncherButtonSettingsForm
        value={{
          tooltipEnabled: true,
          tooltipText: 'Hello',
          enableHoverScaleEffect: true,
        }}
        onChange={onChange}
        globalSettings={{
          widgetLauncherButton: {
            position: 'bottom-right',
            buttonText: null,
            buttonShape: 'round',
            buttonIcon: 'bug',
            buttonIconSize: 24,
            buttonIconStroke: 2,
            theme: 'auto',
            enableHoverScaleEffect: true,
            tooltipEnabled: false,
            tooltipText: null,
            lightButtonColor: '#111111',
            lightTextColor: '#ffffff',
            lightButtonHoverColor: '#222222',
            lightTextHoverColor: '#ffffff',
            darkButtonColor: '#333333',
            darkTextColor: '#ffffff',
            darkButtonHoverColor: '#444444',
            darkTextHoverColor: '#ffffff',
          },
        }}
        showCustomToggle
        useCustomSettings
        useTabs
      />,
    );

    await user.click(screen.getByRole('tab', { name: /colors/i }));
    await user.click(screen.getByRole('button', { name: /pick color/i }));

    await user.click(screen.getByRole('tab', { name: /button/i }));
    const resetButtons = screen.getAllByRole('button', { name: /reset to global default/i });
    await user.click(resetButtons[0]);

    const tooltipInput = screen.getByLabelText(/tooltip text/i);
    await user.clear(tooltipInput);
    await user.type(tooltipInput, 'Report bug');

    expect(onChange).toHaveBeenCalled();
  });

  it('renders linear layout when tabs are disabled', () => {
    const onChange = vi.fn();

    render(
      <WidgetLauncherButtonSettingsForm
        value={{}}
        onChange={onChange}
        globalSettings={{
          widgetLauncherButton: {
            position: 'bottom-right',
            buttonText: null,
            buttonShape: 'round',
            buttonIcon: 'bug',
            buttonIconSize: 24,
            buttonIconStroke: 2,
            theme: 'auto',
            enableHoverScaleEffect: true,
            tooltipEnabled: false,
            tooltipText: null,
            lightButtonColor: '#111111',
            lightTextColor: '#ffffff',
            lightButtonHoverColor: '#222222',
            lightTextHoverColor: '#ffffff',
            darkButtonColor: '#333333',
            darkTextColor: '#ffffff',
            darkButtonHoverColor: '#444444',
            darkTextHoverColor: '#ffffff',
          },
        }}
      />,
    );

    expect(screen.getByText(/live preview/i)).toBeInTheDocument();
  });
});
