import { FunctionComponent } from 'preact';
import { useState } from 'preact/hooks';
import { Button } from './ui';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';

const STORAGE_KEY = 'bugpin-skip-screen-capture-consent';
const RECORDING_STORAGE_KEY = 'bugpin-skip-recording-consent';

export type ConsentMode = 'screenshot' | 'recording';

interface ScreenCaptureConsentDialogProps {
  mode?: ConsentMode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function shouldSkipRecordingConsent(): boolean {
  try {
    return localStorage.getItem(RECORDING_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function needsWindowHint(): boolean {
  return !/Chrom(e|ium)\//.test(navigator.userAgent);
}

export const ScreenCaptureConsentDialog: FunctionComponent<ScreenCaptureConsentDialogProps> = ({
  mode = 'screenshot',
  onConfirm,
  onCancel,
}) => {
  useLocale();
  const [skipNextTime, setSkipNextTime] = useState(false);

  const handleConfirm = () => {
    if (skipNextTime) {
      try {
        localStorage.setItem(mode === 'recording' ? RECORDING_STORAGE_KEY : STORAGE_KEY, 'true');
      } catch {
        // Blocked storage only means the dialog appears again next time.
      }
    }
    onConfirm();
  };

  const footer = (
    <>
      <label class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={skipNextTime}
          onChange={(e) => setSkipNextTime((e.target as HTMLInputElement).checked)}
          class="w-3.5 h-3.5 accent-primary cursor-pointer"
        />
        {t('screenCapture.dontShowAgain')}
      </label>

      <div class="flex gap-3 w-full max-w-xs">
        <Button variant="outline" class="flex-1" onClick={onCancel}>
          {t('screenCapture.back')}
        </Button>
        <Button class="flex-1" onClick={handleConfirm}>
          {mode === 'recording' ? t('screenCapture.confirmRecording') : t('screenCapture.confirm')}
        </Button>
      </div>
    </>
  );

  if (mode === 'recording') {
    return (
      <div class="flex-1 flex flex-col items-center justify-center p-6 gap-5 text-center">
        <div class="space-y-2 max-w-sm">
          <h1>{t('screenCapture.title')}</h1>
          <p class="text-sm text-muted-foreground">{t('screenCapture.recording.body')}</p>
          {needsWindowHint() && (
            <p class="text-sm text-muted-foreground">{t('screenCapture.recording.windowHint')}</p>
          )}
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div class="flex-1 flex flex-col items-center justify-center p-6 gap-5 text-center">
      <div class="space-y-2 max-w-sm">
        <h1>{t('screenCapture.title')}</h1>
        <p class="text-sm text-muted-foreground">{t('screenCapture.body')}</p>
      </div>

      <div class="grid grid-cols-2 pb-4 gap-3 w-full max-w-xl">
        {/* Firefox */}
        <div class="flex flex-col items-center gap-1.5">
          <div class="w-full rounded-lg overflow-hidden border border-solid border-border shadow-sm">
            <svg viewBox="0 0 200 148" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <filter id="ff-shadow" x="-4%" y="-4%" width="108%" height="108%">
                  <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.08" />
                </filter>
              </defs>

              <rect width="200" height="180" rx="10" fill="#ffffff" filter="url(#ff-shadow)" />

              {/* Heading */}
              <text
                x="16"
                y="24"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="10"
                font-weight="700"
                fill="#111"
              >
                Allow this site to see your screen?
              </text>

              {/* Dropdown selector */}
              <rect
                x="14"
                y="42"
                width="172"
                height="26"
                rx="6"
                fill="#f5f5f5"
                stroke="#ddd"
                stroke-width="1"
              />
              <rect x="23" y="50" width="11" height="10" rx="2" fill="#d0d0d0" />
              <rect x="25" y="48" width="3" height="3" rx="1" fill="#bbb" />
              <rect x="30" y="48" width="3" height="3" rx="1" fill="#bbb" />
              <text
                x="42"
                y="55"
                dominant-baseline="central"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="9"
                fill="#444"
              >
                Use operating system settings
              </text>

              {/* Checkbox row */}
              <rect
                x="16"
                y="74"
                width="11"
                height="11"
                rx="3"
                fill="white"
                stroke="#c8c8c8"
                stroke-width="1.2"
              />
              <text
                x="34"
                y="79.5"
                dominant-baseline="central"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="8"
                fill="#777"
              >
                Mute website notifications while sharing
              </text>

              {/* Divider */}
              <line x1="0" y1="112" x2="200" y2="112" stroke="#eaeaea" stroke-width="1" />

              {/* Block */}
              <rect
                x="82"
                y="119"
                width="50"
                height="22"
                rx="6"
                fill="white"
                stroke="#ddd"
                stroke-width="1"
              />
              <text
                x="107"
                y="130"
                dominant-baseline="central"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="8"
                fill="#444"
                text-anchor="middle"
              >
                Block
              </text>

              {/* Allow */}
              <rect x="136" y="117" width="56" height="26" rx="13" fill="#aaa" opacity="0.45" />
              <rect x="138" y="119" width="52" height="22" rx="11" fill="#9ca3af" />
              <text
                x="164"
                y="130"
                dominant-baseline="central"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="8"
                fill="white"
                font-weight="600"
                text-anchor="middle"
              >
                Allow
              </text>
            </svg>
          </div>
          <p class="text-xs font-medium text-muted-foreground">
            {t('screenCapture.browser.firefox')}
          </p>
        </div>

        {/* Chrome / Edge — preferCurrentTab confirmation dialog */}
        <div class="flex flex-col items-center gap-1.5">
          <div class="w-full rounded-lg overflow-hidden border border-solid border-border shadow-sm">
            <svg viewBox="0 0 200 148" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <defs>
                <filter id="ce-shadow" x="-4%" y="-4%" width="108%" height="108%">
                  <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.08" />
                </filter>
                <clipPath id="tab-preview-clip">
                  <rect x="14" y="48" width="172" height="56" rx="6" />
                </clipPath>
              </defs>

              <rect width="200" height="180" rx="10" fill="#ffffff" filter="url(#ce-shadow)" />

              {/* Heading */}
              <text
                x="16"
                y="24"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="10"
                font-weight="700"
                fill="#111"
              >
                Allow this site to see this tab?
              </text>

              {/* Subtitle */}
              <text
                x="16"
                y="43"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="8"
                fill="#777"
              >
                The site will see this tab's contents.
              </text>

              {/* Tab preview card */}
              <rect
                x="14"
                y="48"
                width="172"
                height="56"
                rx="6"
                fill="white"
                stroke="#d4d4d8"
                stroke-width="1"
              />
              <g clip-path="url(#tab-preview-clip)">
                {/* Mini browser bar */}
                <rect x="14" y="48" width="172" height="13" fill="#ececec" />
                <circle cx="26" cy="54" r="4" fill="#ccc" />
                <rect x="38" y="51" width="100" height="7" rx="3.5" fill="#ddd" />
                {/* Content skeleton */}
                <rect x="22" y="67" width="72" height="5" rx="2.5" fill="#ddd" />
                <rect x="22" y="76" width="140" height="3.5" rx="1.75" fill="#e8e8e8" />
                <rect x="22" y="83" width="120" height="3.5" rx="1.75" fill="#e8e8e8" />
                <rect x="22" y="89" width="130" height="3.5" rx="1.75" fill="#e8e8e8" />
                <rect x="22" y="95" width="100" height="3.5" rx="1.75" fill="#e8e8e8" />
              </g>

              {/* Divider — same y as Firefox */}
              <line x1="0" y1="112" x2="200" y2="112" stroke="#eaeaea" stroke-width="1" />

              {/* Cancel — same y/h as Firefox Block */}
              <rect
                x="86"
                y="119"
                width="48"
                height="22"
                rx="11"
                fill="white"
                stroke="#ddd"
                stroke-width="1"
              />
              <text
                x="110"
                y="130"
                dominant-baseline="central"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="8"
                fill="#444"
                text-anchor="middle"
              >
                Cancel
              </text>

              {/* Allow */}
              <rect x="137" y="117" width="56" height="26" rx="13" fill="#aaa" opacity="0.45" />
              <rect x="139" y="119" width="52" height="22" rx="11" fill="#9ca3af" />
              <text
                x="165"
                y="130"
                dominant-baseline="central"
                font-family="system-ui, -apple-system, sans-serif"
                font-size="8"
                fill="white"
                font-weight="600"
                text-anchor="middle"
              >
                Allow
              </text>
            </svg>
          </div>
          <p class="text-xs font-medium text-muted-foreground">
            {t('screenCapture.browser.chromeEdge')}
          </p>
        </div>
      </div>
      {footer}
    </div>
  );
};
