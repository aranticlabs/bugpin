import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { ComponentChild, render } from 'preact';
import { useState } from 'preact/hooks';
import {
  formatDuration,
  RecordingBar,
  type RecordingBarPosition,
} from '../../components/RecordingBar';
import { ScreenCaptureConsentDialog } from '../../components/ScreenCaptureConsentDialog';
import { ScreenRecordingPanel } from '../../components/ScreenRecordingPanel';
import type { CapturedMedia } from '../../components/ScreenshotManager';
import { WidgetDialog } from '../../components/WidgetDialog';
import { WidgetLauncherButton } from '../../components/WidgetLauncherButton';
import { t } from '../../i18n/index';
import { installDom } from '../helpers/dom';

const noop = () => undefined;

let restoreDom: (() => void) | null = null;
let container: HTMLElement;
const originalCreateObjectURL = globalThis.URL.createObjectURL;
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;
let objectUrlIndex = 0;

async function mount(node: ComponentChild): Promise<void> {
  render(node, container);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const button = (label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function clip(id: string, source?: 'recording'): CapturedMedia {
  return {
    id,
    blob: new Blob([new Uint8Array(1024 * 1024)], { type: 'video/webm' }),
    timestamp: new Date('2026-11-02T10:00:00Z'),
    annotated: false,
    mimeType: 'video/webm',
    durationMs: 65_000,
    source,
  };
}

function image(id: string): CapturedMedia {
  return {
    id,
    dataUrl: 'data:image/png;base64,media',
    timestamp: new Date('2026-11-02T10:00:00Z'),
    annotated: false,
    mimeType: 'image/png',
  };
}

const barProps = {
  isCountingDown: false,
  countdown: 3,
  elapsedMs: 5000,
  maxDurationMs: 180_000,
  isPaused: false,
  hasMicrophone: false,
  isWholeScreen: false,
  position: null,
  onPositionChange: noop,
  onPause: noop,
  onResume: noop,
  onStop: noop,
  onDiscard: noop,
};

const dialogProps = {
  onClose: noop,
  onSubmit: noop,
  onCaptureScreenshot: noop,
  onAnnotateMedia: noop,
  onAddMedia: noop,
  onRemoveMedia: noop,
  isSubmitting: false,
  uploadProgress: null,
  onCancelSubmit: noop,
  isCapturing: false,
  enableAnnotation: true,
  onActiveTabChange: noop,
  formData: {
    title: '',
    description: '',
    priority: 'medium' as const,
    reporterEmail: '',
    reporterName: '',
  },
  onFormDataChange: noop,
  showScreenCaptureConsent: false,
  onConsentConfirm: noop,
  onConsentCancel: noop,
  reduceScreenshotQuality: false,
  onReduceScreenshotQualityChange: noop,
  oversizedCapture: null,
  onDismissOversizedCapture: noop,
};

beforeEach(() => {
  restoreDom = installDom();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  objectUrlIndex = 0;
  globalThis.URL.createObjectURL = (() =>
    `blob:recording-${++objectUrlIndex}`) as typeof URL.createObjectURL;
  globalThis.URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  globalThis.window.matchMedia = () =>
    ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  render(null, container);
  restoreDom?.();
  restoreDom = null;
  globalThis.URL.createObjectURL = originalCreateObjectURL;
  globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('RecordingBar', () => {
  it('formats durations as minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_900)).toBe('1:05');
    expect(formatDuration(600_000)).toBe('10:00');
  });

  it('shows the countdown with discard as the only control', async () => {
    await mount(<RecordingBar {...barProps} isCountingDown countdown={2} />);

    expect(container.textContent).toContain(t('recording.countdown', { seconds: 2 }));
    expect(button(t('recording.discard'))).not.toBeNull();
    expect(button(t('recording.stop'))).toBeNull();
    expect(button(t('recording.pause'))).toBeNull();
  });

  it('starts at bottom center without relying on translate utilities', async () => {
    await mount(<RecordingBar {...barProps} />);
    const bar = container.querySelector('[data-bugpin-exclude]') as HTMLElement;

    expect(bar.style.left).toBe('50%');
    expect(bar.style.transform).toBe('translateX(-50%)');
    expect(bar.classList.contains('rounded-xl')).toBe(true);
    expect(container.querySelector('[data-recording-drag-handle]')).not.toBeNull();
  });

  it('shows elapsed and maximum time outside any live region', async () => {
    await mount(<RecordingBar {...barProps} />);

    expect(container.textContent).toContain('0:05 / 3:00');
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(button(t('recording.pause'))?.tagName).toBe('BUTTON');
    expect(button(t('recording.stop'))?.tagName).toBe('BUTTON');
    expect(button(t('recording.discard'))?.tagName).toBe('BUTTON');
  });

  it('offers resume while paused', async () => {
    const onResume = mock(noop);
    await mount(<RecordingBar {...barProps} isPaused onResume={onResume} />);

    button(t('recording.resume'))?.click();

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(button(t('recording.pause'))).toBeNull();
  });

  it('shows the whole screen warning in a status region', async () => {
    await mount(<RecordingBar {...barProps} isWholeScreen />);

    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      t('recording.warning.wholeScreen')
    );
  });

  it('is excluded from DOM capture and shows a microphone icon when active', async () => {
    await mount(<RecordingBar {...barProps} />);
    const svgCount = container.querySelectorAll('svg').length;
    await mount(<RecordingBar {...barProps} hasMicrophone />);

    expect(container.querySelector('[data-bugpin-exclude]')).not.toBeNull();
    expect(container.querySelectorAll('svg').length).toBe(svgCount + 1);
  });

  it('keeps the tools hidden during the countdown', async () => {
    await mount(<RecordingBar {...barProps} isCountingDown />);

    expect(button(t('recording.tool.pen'))).toBeNull();
    expect(button(t('recording.tool.laser'))).toBeNull();
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'p' }));
    await settle();
    expect(container.querySelector('[data-recording-pen]')?.classList).toContain(
      'pointer-events-none'
    );
  });

  it('opens in the top layer so a restricted capture leaves it out', async () => {
    const showPopover = mock(noop);
    const original = window.HTMLElement.prototype.showPopover;
    window.HTMLElement.prototype.showPopover = showPopover;
    await mount(<RecordingBar {...barProps} />);
    await new Promise((resolve) => setTimeout(resolve, 150));
    window.HTMLElement.prototype.showPopover = original;

    const bar = container.querySelector('[data-bugpin-exclude]') as HTMLElement;
    expect(bar.getAttribute('popover')).toBe('manual');
    expect(showPopover).toHaveBeenCalledTimes(1);
  });

  it('repeats the page background only when the capture can be restricted', async () => {
    const backdrop = () => container.querySelector('[data-recording-backdrop]') as HTMLElement;
    await mount(<RecordingBar {...barProps} />);
    expect(backdrop()).toBeNull();

    const scope = globalThis as unknown as { RestrictionTarget?: unknown };
    scope.RestrictionTarget = { fromElement: async () => ({}) };
    document.body.style.backgroundColor = 'rgb(12, 34, 56)';
    render(null, container);
    await mount(<RecordingBar {...barProps} />);
    delete scope.RestrictionTarget;

    expect(backdrop()?.style.backgroundColor).toBe('rgb(12, 34, 56)');
  });

  it('frames the page in red and turns the frame gray while paused', async () => {
    await mount(<RecordingBar {...barProps} />);
    const frame = () => container.querySelector('[data-recording-frame]') as HTMLElement;
    expect(frame().style.boxShadow).toContain('#dc2626');

    await mount(<RecordingBar {...barProps} isPaused />);
    expect(frame().style.boxShadow).toContain('#737373');
  });

  describe('tools', () => {
    const press = async (key: string, target: EventTarget = window) => {
      target.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
      await settle();
    };
    const pressed = (label: string) => button(label)?.getAttribute('aria-pressed');
    const afterPaint = () => new Promise((resolve) => setTimeout(resolve, 150));
    const pen = () => container.querySelector('[data-recording-pen]') as HTMLCanvasElement;
    const draw = async () => {
      const event = (type: string, clientX: number) =>
        new window.MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 10 });
      pen().dispatchEvent(event('pointerdown', 10));
      pen().dispatchEvent(event('pointermove', 40));
      pen().dispatchEvent(event('pointerup', 40));
      await settle();
    };

    it('starts on the cursor with click effects on', async () => {
      await mount(<RecordingBar {...barProps} />);

      expect(pressed(t('recording.tool.cursor'))).toBe('true');
      expect(pressed(t('recording.tool.pen'))).toBe('false');
      expect(pressed(t('recording.tool.clickEffects'))).toBe('true');
      expect(pen().classList.contains('pointer-events-none')).toBe(true);
    });

    it('lets the pen capture the page and shows its options only while active', async () => {
      await mount(<RecordingBar {...barProps} />);
      expect(button(t('recording.color.red'))).toBeNull();

      button(t('recording.tool.pen'))?.click();
      await settle();

      expect(pen().classList.contains('pointer-events-none')).toBe(false);
      expect(pressed(t('recording.color.red'))).toBe('true');

      button(t('recording.color.green'))?.click();
      await settle();
      expect(pressed(t('recording.color.green'))).toBe('true');
      expect(pressed(t('recording.color.red'))).toBe('false');
    });

    it('enables undo and clear once a stroke exists', async () => {
      await mount(<RecordingBar {...barProps} />);
      await press('p');
      expect(button(t('recording.tool.undo'))?.disabled).toBe(true);
      expect(button(t('recording.tool.clear'))?.disabled).toBe(true);

      await draw();
      expect(button(t('recording.tool.undo'))?.disabled).toBe(false);

      button(t('recording.tool.undo'))?.click();
      await settle();
      expect(button(t('recording.tool.undo'))?.disabled).toBe(true);

      await draw();
      await draw();
      button(t('recording.tool.clear'))?.click();
      await settle();
      expect(button(t('recording.tool.clear'))?.disabled).toBe(true);
    });

    it('undoes a stroke with the keyboard', async () => {
      await mount(<RecordingBar {...barProps} />);
      await press('p');
      await draw();

      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', metaKey: true }));
      await settle();

      expect(button(t('recording.tool.undo'))?.disabled).toBe(true);
    });

    it('switches tools with the keyboard', async () => {
      await mount(<RecordingBar {...barProps} />);

      await press('l');
      expect(pressed(t('recording.tool.laser'))).toBe('true');
      await press('Escape');
      expect(pressed(t('recording.tool.cursor'))).toBe('true');
      await press('p');
      expect(pressed(t('recording.tool.pen'))).toBe('true');
      await press('v');
      expect(pressed(t('recording.tool.cursor'))).toBe('true');
      await press('c');
      expect(pressed(t('recording.tool.clickEffects'))).toBe('false');
    });

    it('ignores shortcuts while typing in a field', async () => {
      await mount(<RecordingBar {...barProps} />);
      const input = document.createElement('input');
      document.body.appendChild(input);

      await press('p', input);

      expect(pressed(t('recording.tool.cursor'))).toBe('true');
    });

    it('hides the page cursor only while the laser is active', async () => {
      const cursorStyles = () =>
        [...document.head.querySelectorAll('style')].filter((style) =>
          style.textContent?.includes('cursor: none')
        );
      await mount(<RecordingBar {...barProps} />);
      expect(cursorStyles()).toHaveLength(0);

      await press('l');
      await afterPaint();
      expect(cursorStyles()).toHaveLength(1);

      await press('v');
      await afterPaint();
      expect(cursorStyles()).toHaveLength(0);
    });
  });

  describe('dragging', () => {
    let latest: RecordingBarPosition | null;

    const Harness = ({ initial }: { initial: RecordingBarPosition | null }) => {
      const [position, setPosition] = useState(initial);
      latest = position;
      return <RecordingBar {...barProps} position={position} onPositionChange={setPosition} />;
    };

    const bar = () => container.querySelector('[data-bugpin-exclude]') as HTMLElement;
    const handle = () => container.querySelector('[data-recording-drag-handle]') as HTMLElement;
    const pointer = (target: Element, type: string, clientX: number, clientY: number) => {
      target.dispatchEvent(
        new window.MouseEvent(type, { bubbles: true, button: 0, clientX, clientY })
      );
    };

    beforeEach(() => {
      latest = null;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    });

    it('follows the pointer and stays inside the viewport', async () => {
      await mount(<Harness initial={null} />);
      bar().getBoundingClientRect = () =>
        ({ left: 100, top: 100, width: 300, height: 50 }) as DOMRect;

      pointer(handle(), 'pointerdown', 110, 110);
      pointer(bar(), 'pointermove', 210, 310);
      await settle();
      expect(latest).toEqual({ x: 200, y: 300 });
      expect(bar().style.left).toBe('200px');

      pointer(bar(), 'pointermove', 5000, 5000);
      await settle();
      expect(latest).toEqual({ x: 692, y: 742 });

      pointer(bar(), 'pointermove', -500, -500);
      await settle();
      expect(latest).toEqual({ x: 8, y: 8 });
    });

    it('stops following after the pointer is released', async () => {
      await mount(<Harness initial={null} />);
      bar().getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50 }) as DOMRect;

      pointer(handle(), 'pointerdown', 10, 10);
      pointer(bar(), 'pointerup', 10, 10);
      pointer(bar(), 'pointermove', 300, 300);
      await settle();

      expect(latest).toBeNull();
    });

    it('does not start a drag from a control', async () => {
      await mount(<Harness initial={null} />);
      const control = button(t('recording.stop'));
      if (!control) throw new Error('Stop button missing');

      pointer(control, 'pointerdown', 10, 10);
      pointer(bar(), 'pointermove', 300, 300);
      await settle();

      expect(latest).toBeNull();
    });

    it('moves back inside the viewport on resize', async () => {
      await mount(<Harness initial={{ x: 650, y: 700 }} />);
      bar().getBoundingClientRect = () =>
        ({ left: 650, top: 700, width: 300, height: 50 }) as DOMRect;

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
      window.dispatchEvent(new window.Event('resize'));
      await settle();

      expect(latest).toEqual({ x: 192, y: 342 });
    });
  });
});

describe('ScreenRecordingPanel', () => {
  const panelProps = {
    clips: [],
    recordingEnabled: true,
    onRecord: noop,
    onUpload: noop,
    onRemove: noop,
    isStarting: false,
    allowMicrophone: false,
    includeMicrophone: false,
    onIncludeMicrophoneChange: noop,
    oversizedRecording: null,
    onDismissOversizedRecording: noop,
  };

  it('hides the microphone option unless an admin allows it', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} />);
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();

    await mount(<ScreenRecordingPanel {...panelProps} allowMicrophone />);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.classList.contains('sr-only')).toBe(true);
    expect(checkbox.nextElementSibling?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toContain(t('recording.microphone'));
  });

  it('matches the screenshot panel control layout', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} allowMicrophone />);

    const recordButton = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === t('recording.start')
    );
    const microphone = container.querySelector('input[type="checkbox"]');
    const privacyTip = [...container.querySelectorAll('p')].find(
      (item) => item.textContent === t('recording.privacyTip')
    );

    expect(recordButton?.classList.contains('flex-1')).toBe(true);
    expect(microphone?.closest('div')?.classList.contains('justify-end')).toBe(true);
    expect(privacyTip?.classList.contains('text-center')).toBe(false);
  });

  it('disables the record button while starting', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} isStarting />);

    expect(container.querySelector('button')?.disabled).toBe(true);
  });

  it('lists clips with duration and size, and removes them', async () => {
    const onRemove = mock(noop);
    await mount(
      <ScreenRecordingPanel
        {...panelProps}
        clips={[clip('a', 'recording'), clip('b', 'recording')]}
        onRemove={onRemove}
      />
    );

    expect(container.textContent).toContain('1:05 · 1.0 MB');
    expect(container.querySelector('ul')?.classList.contains('grid-cols-2')).toBe(true);
    expect(container.querySelector('ul')?.parentElement?.classList.contains('border-2')).toBe(
      false
    );
    expect(container.querySelectorAll('li')).toHaveLength(3);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video?.controls).toBe(true);
    expect(video?.muted).toBe(false);
    expect(video?.getAttribute('src')).toBe('blob:recording-1');

    let paused = true;
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused });
    video.play = mock(async () => {
      paused = false;
      video.dispatchEvent(new window.Event('play'));
    });
    video.pause = mock(() => {
      paused = true;
      video.dispatchEvent(new window.Event('pause'));
    });

    button(t('recording.play'))?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(video.play).toHaveBeenCalledTimes(1);
    button(t('recording.pause'))?.click();
    expect(video.pause).toHaveBeenCalledTimes(1);

    button(t('screenshot.action.remove'))?.click();
    expect(onRemove.mock.calls[0]).toEqual(['a'] as never);
    expect(button(t('screenshot.action.download'))).not.toBeNull();
  });

  it('keeps clip details and actions when playback fails', async () => {
    const onRemove = mock(noop);
    await mount(
      <ScreenRecordingPanel {...panelProps} clips={[clip('a', 'recording')]} onRemove={onRemove} />
    );

    container.querySelector('video')?.dispatchEvent(new window.Event('error'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const fallback = container.querySelector('[data-testid="video-preview-fallback"]');
    expect(fallback?.textContent).toContain(t('recording.previewUnavailable'));
    expect(fallback?.textContent).toContain('1:05 · 1.0 MB');
    expect(button(t('screenshot.action.download'))).not.toBeNull();
    button(t('screenshot.action.remove'))?.click();
    expect(onRemove.mock.calls[0]).toEqual(['a'] as never);
  });

  it('opens and closes a larger recording preview', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} clips={[clip('a', 'recording')]} />);

    button(t('recording.expand'))?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const preview = container.querySelector('[data-testid="recording-preview-dialog"]');
    expect(preview?.getAttribute('role')).toBe('dialog');
    expect(preview?.getAttribute('aria-modal')).toBe('true');
    expect(preview?.querySelector('video')).not.toBeNull();

    button(t('aria.close'))?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector('[data-testid="recording-preview-dialog"]')).toBeNull();
  });

  it('shows and dismisses the oversized banner', async () => {
    const onDismiss = mock(noop);
    await mount(
      <ScreenRecordingPanel
        {...panelProps}
        oversizedRecording={{ sizeMb: 60, limitMb: 50 }}
        onDismissOversizedRecording={onDismiss}
      />
    );

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      t('recording.oversized', { size: 60, limit: 50 })
    );
    button(t('aria.close'))?.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps video uploads available when screen recording is disabled', async () => {
    await mount(<ScreenRecordingPanel {...panelProps} recordingEnabled={false} />);

    expect(container.textContent).not.toContain(t('recording.start'));
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelector('input[type="file"]')?.getAttribute('accept')).toBe(
      'video/mp4,video/webm,video/quicktime'
    );
    expect(container.textContent).toContain(t('screenshot.dropzone.title'));
  });
});

describe('ScreenCaptureConsentDialog recording mode', () => {
  const setUserAgent = (userAgent: string) => {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: userAgent });
  };

  it('is text-only and stores its own key', async () => {
    setUserAgent('Chrome/150.0.0.0');
    const onConfirm = mock(noop);
    await mount(
      <ScreenCaptureConsentDialog mode="recording" onConfirm={onConfirm} onCancel={noop} />
    );

    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toContain(t('screenCapture.recording.body'));
    expect(container.textContent).not.toContain(t('screenCapture.recording.windowHint'));

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const buttons = [...container.querySelectorAll('button')];
    buttons.find((item) => item.textContent === t('screenCapture.confirmRecording'))?.click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('bugpin-skip-recording-consent')).toBe('true');
    expect(localStorage.getItem('bugpin-skip-screen-capture-consent')).toBeNull();
  });

  it('adds the window hint outside Chromium browsers', async () => {
    setUserAgent('Mozilla/5.0 Gecko/20100101 Firefox/150.0');
    await mount(<ScreenCaptureConsentDialog mode="recording" onConfirm={noop} onCancel={noop} />);

    expect(container.textContent).toContain(t('screenCapture.recording.windowHint'));
  });

  it('keeps the screenshot mode illustrated with its own key', async () => {
    await mount(<ScreenCaptureConsentDialog onConfirm={noop} onCancel={noop} />);

    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toContain(t('screenCapture.confirm'));
  });
});

describe('WidgetDialog recording tab', () => {
  const tabLabels = () =>
    [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent);

  it('keeps the videos tab available when recording is not available', async () => {
    await mount(<WidgetDialog {...dialogProps} media={[]} activeTab="details" />);

    expect(tabLabels()).toEqual([
      t('dialog.tabs.details'),
      t('dialog.tabs.media'),
      t('dialog.tabs.recording'),
    ]);
  });

  it('counts images and videos separately', async () => {
    await mount(
      <WidgetDialog
        {...dialogProps}
        media={[image('shot'), clip('upload'), clip('recording', 'recording')]}
        activeTab="details"
        recordingEnabled
      />
    );

    expect(tabLabels()).toEqual([
      t('dialog.tabs.details'),
      t('dialog.tabs.mediaWithCount', { count: 1 }),
      t('dialog.tabs.recordingWithCount', { count: 2 }),
    ]);
  });

  it('shows videos only in the videos tab and images only in screenshots', async () => {
    const media = [image('shot'), clip('upload'), clip('recording', 'recording')];
    await mount(
      <WidgetDialog {...dialogProps} media={media} activeTab="recording" recordingEnabled />
    );
    expect(container.textContent).toContain(t('recording.start'));
    expect(container.querySelectorAll('video')).toHaveLength(2);
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('ul')?.parentElement?.classList.contains('border-2')).toBe(
      false
    );

    await mount(<WidgetDialog {...dialogProps} media={media} activeTab="media" recordingEnabled />);
    expect(container.textContent).not.toContain(t('recording.start'));
    expect(container.querySelectorAll('video')).toHaveLength(0);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(
      container
        .querySelector('img')
        ?.closest('.grid')
        ?.parentElement?.classList.contains('border-2')
    ).toBe(false);
  });

  it('opens the videos upload area when recording is unavailable', async () => {
    await mount(<WidgetDialog {...dialogProps} media={[]} activeTab="recording" />);

    expect(container.querySelector('#bugpin-title-input')).toBeNull();
    expect(container.textContent).not.toContain(t('recording.start'));
    expect(container.textContent).toContain(t('screenshot.dropzone.title'));
  });
});

describe('WidgetLauncherButton badge', () => {
  const launcherProps = {
    position: 'bottom-right' as const,
    buttonText: { project: { en: 'Report' }, global: null, builtin: null },
    buttonShape: 'round' as const,
    buttonIcon: null,
    buttonIconSize: 18,
    buttonIconStroke: 2,
    theme: 'light' as const,
    lightButtonColor: '#000',
    lightTextColor: '#fff',
    lightButtonHoverColor: '#111',
    lightTextHoverColor: '#fff',
    darkButtonColor: '#000',
    darkTextColor: '#fff',
    darkButtonHoverColor: '#111',
    darkTextHoverColor: '#fff',
    enableHoverScaleEffect: false,
    tooltipEnabled: false,
    tooltipText: { project: null, global: null, builtin: null },
    onClick: noop,
  };
  const badge = () => container.querySelector('[data-testid="bugpin-pending-recording"]');

  it('shows a dot only when a recording is pending', async () => {
    await mount(<WidgetLauncherButton {...launcherProps} />);
    expect(badge()).toBeNull();

    await mount(<WidgetLauncherButton {...launcherProps} hasPendingRecording />);
    expect(badge()).not.toBeNull();
  });
});
