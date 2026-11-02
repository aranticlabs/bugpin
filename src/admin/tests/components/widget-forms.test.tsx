import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScreenshotSettingsForm } from '../../components/ScreenshotSettingsForm';
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

describe('ScreenshotSettingsForm', () => {
  it('keeps zero explicit and does not disable the quota when cleared', () => {
    const onChange = vi.fn();
    render(
      <ScreenshotSettingsForm
        value={{}}
        onChange={onChange}
        globalSettings={{
          screenshot: {
            useScreenCaptureAPI: false,
            maxScreenshotSize: 10,
            maxImageUploadSizeMb: 10,
            maxVideoUploadSizeMb: 50,
            maxVideoUploadMbPerDay: 4096,
            enableScreenRecording: false,
            allowRecordingMicrophone: false,
            maxRecordingDurationSeconds: 180,
          },
        }}
      />
    );

    const input = screen.getByLabelText(/daily video upload limit/i);
    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith({ maxVideoUploadMbPerDay: 0 });

    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith({ maxVideoUploadMbPerDay: 4096 });
  });

  it('shows recording controls only when recording is enabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<ScreenshotSettingsForm value={{}} onChange={onChange} />);

    expect(screen.queryByLabelText(/allow microphone recording/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /enable screen recording/i }));
    expect(onChange).toHaveBeenLastCalledWith({ enableScreenRecording: true });

    rerender(
      <ScreenshotSettingsForm
        value={{ enableScreenRecording: true, maxRecordingDurationSeconds: 180 }}
        onChange={onChange}
      />
    );
    expect(screen.getByLabelText(/allow microphone recording/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/max\. recording duration/i)).toHaveAttribute('max', '600');
    expect(screen.getByRole('link', { name: /reverse proxy guide/i })).toBeInTheDocument();
  });
});

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
      />
    );

    expect(
      screen.queryByRole('heading', { name: /widget dialog colors/i })
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
          tooltipText: { en: 'Hello' },
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
      />
    );

    await user.click(screen.getByRole('tab', { name: /colors/i }));
    await user.click(screen.getByRole('button', { name: /pick color/i }));

    await user.click(screen.getByRole('tab', { name: /button/i }));
    const resetButtons = screen.getAllByRole('button', { name: /reset to global default/i });
    await user.click(resetButtons[0]);

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
      />
    );

    expect(screen.getByText(/live preview/i)).toBeInTheDocument();
  });
});
