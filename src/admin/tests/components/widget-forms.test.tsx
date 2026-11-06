import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithQuery as render } from '../utils';
import userEvent from '@testing-library/user-event';
import {
  RecordingSettingsForm,
  resolveRecordingSettings,
} from '../../components/RecordingSettingsForm';
import { ScreenshotSettingsForm } from '../../components/ScreenshotSettingsForm';
import {
  WidgetDialogSettingsForm,
  resolveDialogColors,
} from '../../components/WidgetDialogSettingsForm';
import {
  WidgetLauncherButtonSettingsForm,
  WidgetLauncherPreview,
} from '../../components/WidgetLauncherButtonSettingsForm';

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

  it('resolves the inherited values a project copies when it switches to custom settings', () => {
    expect(
      resolveRecordingSettings(
        {},
        {
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
        }
      )
    ).toEqual({
      maxVideoUploadSizeMb: 40,
      maxVideoUploadMbPerDay: 1024,
      enableScreenRecording: true,
      allowRecordingMicrophone: true,
      maxRecordingDurationSeconds: 120,
      recordingQuality: 'low',
    });
  });

  it('enables recording controls and video limits only when recording is enabled', async () => {
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
    videoLimits().forEach((control) => expect(control).toBeDisabled());
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
});

describe('WidgetDialogSettingsForm', () => {
  it('merges color changes into the project value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WidgetDialogSettingsForm value={{ lightButtonColor: '#123456' }} onChange={onChange} />
    );

    expect(screen.queryByRole('switch', { name: /use custom settings/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /pick color/i }));

    expect(onChange).toHaveBeenCalledWith({ lightButtonColor: '#ff0000' });
  });

  it('falls back to the global colors, then to the built-in defaults', () => {
    const colors = resolveDialogColors(
      { lightButtonColor: '#123456' },
      {
        lightButtonColor: '#000000',
        lightTextColor: '#eeeeee',
        lightButtonHoverColor: '#000000',
        lightTextHoverColor: '#000000',
        darkButtonColor: '#000000',
        darkTextColor: '#000000',
        darkButtonHoverColor: '#000000',
        darkTextHoverColor: '#000000',
      }
    );

    expect(colors.lightButtonColor).toBe('#123456');
    expect(colors.lightTextColor).toBe('#eeeeee');
    expect(colors.lightBackgroundColor).toBe('#ffffff');
  });
});

describe('WidgetLauncherButtonSettingsForm', () => {
  const globalSettings = {
    widgetLauncherButton: {
      position: 'bottom-right' as const,
      buttonText: null,
      buttonShape: 'round' as const,
      buttonIcon: 'bug',
      buttonIconSize: 24,
      buttonIconStroke: 2,
      buttonOffsetX: 20,
      buttonOffsetY: 20,
      buttonSizeUnit: 'px' as const,
      theme: 'auto' as const,
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
  };

  it('shows buttons and colors together and resets project overrides inline', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value = {
      tooltipEnabled: true,
      tooltipText: { en: 'Hello' },
      enableHoverScaleEffect: true,
    };
    render(
      <WidgetLauncherButtonSettingsForm
        value={value}
        onChange={onChange}
        globalSettings={globalSettings}
      />
    );

    expect(screen.queryByRole('tab', { name: /^button$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /pick color/i }));
    expect(onChange).toHaveBeenLastCalledWith({ ...value, lightButtonColor: '#ff0000' });

    await user.click(screen.getByRole('button', { name: /reset tooltip to the project default/i }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...value,
      tooltipEnabled: undefined,
      tooltipText: undefined,
    });

    await user.click(
      screen.getByRole('button', { name: /reset hover scale effect to the project default/i })
    );
    expect(onChange).toHaveBeenLastCalledWith({ ...value, enableHoverScaleEffect: undefined });
  });

  it('offers no reset buttons on the instance defaults', () => {
    render(
      <WidgetLauncherButtonSettingsForm
        value={{ tooltipEnabled: true, enableHoverScaleEffect: true }}
        onChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /^reset/i })).not.toBeInTheDocument();
  });

  it('reports the language picked in a text editor for the preview', async () => {
    const user = userEvent.setup();
    const onPreviewLocaleChange = vi.fn();
    render(
      <WidgetLauncherButtonSettingsForm
        value={{}}
        onChange={vi.fn()}
        globalSettings={globalSettings}
        onPreviewLocaleChange={onPreviewLocaleChange}
      />
    );

    expect(screen.queryByText(/live preview/i)).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('combobox', { name: 'Language' })[0]);
    await user.click(await screen.findByRole('option', { name: /deutsch/i }));
    expect(onPreviewLocaleChange).toHaveBeenCalledWith('de');
  });

  it('converts the inherited edge distances and icon size when the unit switches to rem', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <WidgetLauncherButtonSettingsForm
        value={{}}
        onChange={onChange}
        globalSettings={globalSettings}
      />
    );

    await user.click(screen.getByRole('combobox', { name: /size unit/i }));
    await user.click(await screen.findByRole('option', { name: 'rem' }));
    expect(onChange).toHaveBeenLastCalledWith({
      buttonSizeUnit: 'rem',
      buttonOffsetX: 1.25,
      buttonOffsetY: 1.25,
      buttonIconSize: 1.5,
    });
  });

  it('shows the built-in tooltip in the preview when no tooltip text is set', async () => {
    const user = userEvent.setup();
    render(
      <WidgetLauncherPreview
        value={{ ...globalSettings.widgetLauncherButton, tooltipEnabled: true, tooltipText: null }}
        globalSettings={undefined}
      />
    );

    await user.hover(screen.getByRole('button'));
    expect(screen.queryByTestId('launcher-preview-tooltip')).not.toBeInTheDocument();
    const tooltip = await screen.findByTestId('launcher-preview-tooltip', {}, { timeout: 1000 });
    expect(tooltip).toHaveTextContent('Found a bug?');
    expect(tooltip).toHaveStyle({ borderRadius: '4px', fontSize: '12px', padding: '6px 12px' });
  });

  it('uses 0.05 rem distance steps and rounds cleanly on blur', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WidgetLauncherButtonSettingsForm
        value={{ buttonSizeUnit: 'rem', buttonOffsetX: 0.17 }}
        onChange={onChange}
      />
    );
    const horizontal = screen.getByLabelText('Distance from Right');
    expect(horizontal).toHaveAttribute('step', '0.05');
    expect(screen.getByLabelText('Distance from Bottom')).toHaveAttribute('step', '0.05');
    fireEvent.blur(horizontal);
    expect(onChange).toHaveBeenLastCalledWith({ buttonSizeUnit: 'rem', buttonOffsetX: 0.15 });

    onChange.mockClear();
    rerender(
      <WidgetLauncherButtonSettingsForm
        value={{ buttonSizeUnit: 'rem', buttonOffsetX: 0.15 }}
        onChange={onChange}
      />
    );
    fireEvent.blur(horizontal);
    expect(onChange).not.toHaveBeenCalled();
  });

  it.each(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const)(
    'highlights only the changed margin at %s and restarts for repeated edits',
    (position) => {
      const value = { ...globalSettings.widgetLauncherButton, position };
      const preview = (buttonOffsetX: number, buttonOffsetY: number) => (
        <WidgetLauncherPreview
          value={{ ...value, buttonOffsetX, buttonOffsetY }}
          globalSettings={undefined}
        />
      );
      const { rerender } = render(preview(20, 20));
      expect(screen.queryByTestId('launcher-preview-margin-x')).not.toBeInTheDocument();
      expect(screen.queryByTestId('launcher-preview-margin-y')).not.toBeInTheDocument();

      const [vertical, horizontal] = position.split('-');
      rerender(preview(30, 20));
      const firstHighlight = screen.getByTestId('launcher-preview-margin-x');
      expect(firstHighlight).toHaveStyle({ [horizontal]: '0px', width: '30px' });
      expect(firstHighlight).toHaveTextContent('30 px');
      expect(firstHighlight).toHaveAttribute('aria-hidden', 'true');
      expect(firstHighlight).toHaveClass('inset-y-0');
      expect(firstHighlight.parentElement).toHaveClass('absolute', 'inset-0', 'overflow-hidden');
      expect(firstHighlight.parentElement?.parentElement).toBe(
        screen.getByRole('button').parentElement?.parentElement
      );
      expect(screen.queryByTestId('launcher-preview-margin-y')).not.toBeInTheDocument();

      rerender(preview(40, 20));
      expect(screen.getByTestId('launcher-preview-margin-x')).not.toBe(firstHighlight);
      const horizontalHighlight = screen.getByTestId('launcher-preview-margin-x');
      rerender(preview(40, 35));
      expect(screen.getByTestId('launcher-preview-margin-x')).toBe(horizontalHighlight);
      expect(screen.getByTestId('launcher-preview-margin-y')).toHaveClass('inset-x-0');
      expect(screen.getByTestId('launcher-preview-margin-y')).toHaveTextContent('35 px');
      expect(screen.getByTestId('launcher-preview-margin-y')).toHaveStyle({
        [vertical]: '0px',
        height: '35px',
      });
    }
  );

  it('uses rem distances, keeps zero visible, and matches the preview offset cap', () => {
    const preview = (buttonOffsetX: number, buttonOffsetY: number) => (
      <WidgetLauncherPreview
        value={{ buttonSizeUnit: 'rem', buttonOffsetX, buttonOffsetY }}
        globalSettings={undefined}
      />
    );
    const { rerender } = render(preview(1.25, 1.25));
    rerender(preview(2, 0));
    expect(screen.getByTestId('launcher-preview-margin-x')).toHaveStyle({ width: '32px' });
    expect(screen.getByTestId('launcher-preview-margin-y')).toHaveStyle({ height: '2px' });
    expect(screen.getByText('0 rem')).toHaveStyle({ bottom: '8px' });
    rerender(preview(12.5, 0));
    expect(screen.getByTestId('launcher-preview-margin-x')).toHaveStyle({
      right: '0px',
      width: '64px',
    });
    expect(screen.getByTestId('launcher-preview-margin-x')).toHaveTextContent('12.5 rem');
  });

  it('does not highlight equivalent unit conversions or unrelated preview changes', () => {
    const { rerender } = render(
      <WidgetLauncherPreview value={{}} globalSettings={globalSettings} />
    );
    rerender(
      <WidgetLauncherPreview
        value={{ buttonSizeUnit: 'rem', buttonOffsetX: 1.25, buttonOffsetY: 1.25 }}
        globalSettings={globalSettings}
        mode="dark"
      />
    );
    expect(screen.queryByTestId('launcher-preview-margin-x')).not.toBeInTheDocument();
    expect(screen.queryByTestId('launcher-preview-margin-y')).not.toBeInTheDocument();
  });

  it('keeps the same launcher mounted when moving between opposite corners', () => {
    const { rerender } = render(
      <WidgetLauncherPreview value={{ position: 'bottom-right' }} globalSettings={undefined} />
    );
    const button = screen.getByRole('button');
    const wrapper = button.parentElement;
    expect(wrapper).toHaveStyle({
      top: 'calc(100% - 20px)',
      left: 'calc(100% - 20px)',
      transform: 'translate(-100%, -100%)',
    });

    rerender(<WidgetLauncherPreview value={{ position: 'top-left' }} globalSettings={undefined} />);
    expect(screen.getByRole('button')).toBe(button);
    expect(button.parentElement).toBe(wrapper);
    expect(wrapper).toHaveStyle({ top: '20px', left: '20px', transform: 'translate(0, 0)' });
    expect(wrapper).toHaveClass('motion-reduce:transition-none');
  });

  it('clamps the icon size to the unit range on blur, not while typing', () => {
    const onChange = vi.fn();
    render(
      <WidgetLauncherButtonSettingsForm
        value={{ buttonSizeUnit: 'rem', buttonIconSize: 5 }}
        onChange={onChange}
        globalSettings={globalSettings}
      />
    );

    const input = screen.getByLabelText(/icon size/i);
    fireEvent.change(input, { target: { value: '0.5' } });
    expect(onChange).toHaveBeenLastCalledWith({ buttonSizeUnit: 'rem', buttonIconSize: 0.5 });

    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith({ buttonSizeUnit: 'rem', buttonIconSize: 2 });
  });
});
