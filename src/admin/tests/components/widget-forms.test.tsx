import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecordingSettingsForm } from '../../components/RecordingSettingsForm';
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
  it('leaves video and recording settings to the recording form', () => {
    render(<ScreenshotSettingsForm value={{}} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/max\. screenshot size/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/max\. video upload size/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /enable screen recording/i })).toBeNull();
  });
});

describe('RecordingSettingsForm', () => {
  it('keeps zero explicit and does not change the quota while the field is empty', () => {
    const onChange = vi.fn();
    render(
      <RecordingSettingsForm
        value={{}}
        onChange={onChange}
        globalSettings={{
          screenshot: {
            useScreenCaptureAPI: false,
            maxScreenshotSize: 10,
            maxImageUploadSizeMb: 10,
            maxVideoUploadSizeMb: 50,
            maxVideoUploadMbPerDay: 4096,
            enableScreenRecording: true,
            allowRecordingMicrophone: false,
            maxRecordingDurationSeconds: 180,
            recordingQuality: 'standard',
          },
        }}
      />
    );

    const input = screen.getByLabelText(/daily video upload limit/i);
    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith({ maxVideoUploadMbPerDay: 0 });

    const callsBeforeClearing = onChange.mock.calls.length;
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledTimes(callsBeforeClearing);
    expect(input).toHaveValue(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter a whole number from 0 to 1048576.')).toBeInTheDocument();
  });

  it('flags out-of-range numbers inline and restores the saved value on blur', () => {
    const onChange = vi.fn();
    render(
      <RecordingSettingsForm
        value={{ enableScreenRecording: true, maxVideoUploadSizeMb: 50 }}
        onChange={onChange}
      />
    );

    const input = screen.getByLabelText(/max\. video upload size/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '500' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a whole number from 1 to 100.')).toBeInTheDocument();

    fireEvent.blur(input);
    expect(input).toHaveValue(50);
    expect(input).toHaveAttribute('aria-invalid', 'false');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '75' } });
    expect(onChange).toHaveBeenLastCalledWith({
      enableScreenRecording: true,
      maxVideoUploadSizeMb: 75,
    });
  });

  it('copies the inherited values when a project switches to custom settings', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCustomToggle = vi.fn();
    render(
      <RecordingSettingsForm
        value={{}}
        onChange={onChange}
        showCustomToggle
        useCustomSettings={false}
        onCustomToggle={onCustomToggle}
        globalSettings={{
          screenshot: {
            useScreenCaptureAPI: false,
            maxScreenshotSize: 10,
            maxImageUploadSizeMb: 10,
            maxVideoUploadSizeMb: 40,
            maxVideoUploadMbPerDay: 1024,
            enableScreenRecording: true,
            allowRecordingMicrophone: true,
            maxRecordingDurationSeconds: 120,
            recordingQuality: 'low',
          },
        }}
      />
    );

    await user.click(screen.getByRole('switch', { name: /use custom settings/i }));

    expect(onCustomToggle).toHaveBeenCalledWith(true);
    expect(onChange).toHaveBeenCalledWith({
      maxVideoUploadSizeMb: 40,
      maxVideoUploadMbPerDay: 1024,
      enableScreenRecording: true,
      allowRecordingMicrophone: true,
      maxRecordingDurationSeconds: 120,
      recordingQuality: 'low',
    });
  });

  it('enables recording controls only when recording is enabled, but always the video limits', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<RecordingSettingsForm value={{}} onChange={onChange} />);

    const controls = () => [
      screen.getByRole('combobox', { name: /video quality/i }),
      screen.getByLabelText(/max\. recording duration/i),
      screen.getByRole('switch', { name: /allow microphone recording/i }),
    ];
    const videoLimits = () => [
      screen.getByLabelText(/max\. video upload size/i),
      screen.getByLabelText(/daily video upload limit/i),
    ];
    controls().forEach((control) => expect(control).toBeDisabled());
    videoLimits().forEach((control) => expect(control).toBeEnabled());
    const guide = () => screen.getByRole('link', { name: /reverse proxy guide/i });
    expect(guide()).not.toHaveAttribute('tabindex');

    await user.click(screen.getByRole('switch', { name: /enable screen recording/i }));
    expect(onChange).toHaveBeenLastCalledWith({ enableScreenRecording: true });

    rerender(
      <RecordingSettingsForm
        value={{ enableScreenRecording: true, maxRecordingDurationSeconds: 180 }}
        onChange={onChange}
      />
    );
    controls().forEach((control) => expect(control).toBeEnabled());
    videoLimits().forEach((control) => expect(control).toBeEnabled());
    expect(screen.getByLabelText(/max\. recording duration/i)).toHaveAttribute('max', '600');
    expect(screen.getByRole('link', { name: /reverse proxy guide/i })).toBeInTheDocument();
  });

  it('shows the video quality with the global default as a fallback', () => {
    render(
      <RecordingSettingsForm
        value={{ enableScreenRecording: true }}
        onChange={vi.fn()}
        globalSettings={{
          screenshot: {
            useScreenCaptureAPI: false,
            maxScreenshotSize: 10,
            maxImageUploadSizeMb: 10,
            maxVideoUploadSizeMb: 50,
            maxVideoUploadMbPerDay: 2048,
            enableScreenRecording: true,
            allowRecordingMicrophone: false,
            maxRecordingDurationSeconds: 60,
            recordingQuality: 'low',
          },
        }}
      />
    );

    expect(screen.getByRole('combobox', { name: /video quality/i })).toHaveTextContent(
      'Low (720p, 10 fps, about 6 MB per minute)'
    );
  });

  it('warns only when a full recording would pass the upload limit', () => {
    const value = {
      enableScreenRecording: true,
      maxRecordingDurationSeconds: 180,
      maxVideoUploadSizeMb: 50,
    };
    const { rerender } = render(
      <RecordingSettingsForm
        value={{ ...value, recordingQuality: 'standard' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText(/recordings stop early/i)).not.toBeInTheDocument();

    rerender(
      <RecordingSettingsForm value={{ ...value, recordingQuality: 'high' }} onChange={vi.fn()} />
    );
    expect(screen.getByText(/recordings stop early/i)).toHaveTextContent('about 90 MB');
  });

  it('clears every recording setting when a project returns to global defaults', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onCustomToggle = vi.fn();
    render(
      <RecordingSettingsForm
        value={{ recordingQuality: 'high' }}
        onChange={onChange}
        showCustomToggle
        onCustomToggle={onCustomToggle}
      />
    );

    await user.click(screen.getByRole('switch', { name: /use custom settings/i }));

    expect(onCustomToggle).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ recordingQuality: undefined, enableScreenRecording: undefined })
    );
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
