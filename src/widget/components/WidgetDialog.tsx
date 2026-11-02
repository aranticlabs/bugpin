import { FunctionComponent } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { FileText, Image, Video, X } from 'lucide-preact';
import { ScreenshotManager, CapturedMedia } from './ScreenshotManager.js';
import { Button, Input, Textarea, Select, Label, Tabs } from './ui';
import { ScreenCaptureConsentDialog, type ConsentMode } from './ScreenCaptureConsentDialog.js';
import { ScreenRecordingPanel } from './ScreenRecordingPanel.js';
import { useLocale } from '../hooks/use-locale.js';
import { t } from '../i18n/index.js';

export interface FormData {
  title: string;
  description: string;
  priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  reporterEmail: string;
  reporterName: string;
}

interface WidgetDialogProps {
  hidePoweredBy?: boolean;
  onClose: () => void;
  onSubmit: (data: FormData, media: CapturedMedia[]) => void;
  onCaptureScreenshot: () => void;
  onAnnotateMedia: (id: string) => void;
  media: CapturedMedia[];
  onAddMedia: (item: CapturedMedia) => void;
  onRemoveMedia: (id: string) => void;
  isSubmitting: boolean;
  uploadProgress: number | null;
  onCancelSubmit: () => void;
  isCapturing: boolean;
  enableAnnotation: boolean;
  // Controlled state props (lifted to App for persistence across capture)
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  formData: FormData;
  onFormDataChange: (data: FormData) => void;
  showScreenCaptureConsent: boolean;
  consentMode?: ConsentMode;
  onConsentConfirm: () => void;
  onConsentCancel: () => void;
  maxImageSize?: number;
  maxVideoSize?: number;
  reduceScreenshotQuality: boolean;
  onReduceScreenshotQualityChange: (value: boolean) => void;
  oversizedCapture: { sizeMb: number; limitMb: number } | null;
  onDismissOversizedCapture: () => void;
  recordingEnabled?: boolean;
  allowRecordingMicrophone?: boolean;
  includeMicrophone?: boolean;
  onIncludeMicrophoneChange?: (value: boolean) => void;
  isRecordingStarting?: boolean;
  onStartRecording?: () => void;
  oversizedRecording?: { sizeMb: number; limitMb: number } | null;
  onDismissOversizedRecording?: () => void;
}

const TAB_ICONS = {
  details: <FileText />,
  media: <Image />,
  recording: <Video />,
};

export const WidgetDialog: FunctionComponent<WidgetDialogProps> = ({
  hidePoweredBy = false,
  onClose,
  onSubmit,
  onCaptureScreenshot,
  onAnnotateMedia,
  media,
  onAddMedia,
  onRemoveMedia,
  isSubmitting,
  uploadProgress,
  onCancelSubmit,
  isCapturing,
  enableAnnotation,
  activeTab,
  onActiveTabChange,
  formData,
  onFormDataChange,
  showScreenCaptureConsent,
  consentMode = 'screenshot',
  onConsentConfirm,
  onConsentCancel,
  maxImageSize,
  maxVideoSize,
  reduceScreenshotQuality,
  onReduceScreenshotQualityChange,
  oversizedCapture,
  onDismissOversizedCapture,
  recordingEnabled = false,
  allowRecordingMicrophone = false,
  includeMicrophone = false,
  onIncludeMicrophoneChange = () => undefined,
  isRecordingStarting = false,
  onStartRecording = () => undefined,
  oversizedRecording = null,
  onDismissOversizedRecording = () => undefined,
}) => {
  useLocale();
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const handleInputChange = useCallback(
    (field: keyof FormData, value: string) => {
      onFormDataChange({ ...formData, [field]: value });
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [formData, onFormDataChange, errors]
  );

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.title.trim()) {
      newErrors.title = t('validation.title.required');
    } else if (formData.title.trim().length < 4) {
      newErrors.title = t('validation.title.minLength');
    }

    if (formData.reporterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.reporterEmail)) {
      newErrors.reporterEmail = t('validation.email.invalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(
    (e: Event) => {
      e.preventDefault();

      if (!validate()) {
        onActiveTabChange('details');
        return;
      }

      onSubmit(formData, media);
    },
    [formData, media, validate, onSubmit, onActiveTabChange]
  );

  const images = media.filter((item) => item.mimeType.startsWith('image/'));
  const videos = media.filter((item) => item.mimeType.startsWith('video/'));
  const tabs = [
    { id: 'details', label: t('dialog.tabs.details'), icon: TAB_ICONS.details },
    {
      id: 'media',
      label:
        images.length > 0
          ? t('dialog.tabs.mediaWithCount', { count: images.length })
          : t('dialog.tabs.media'),
      icon: TAB_ICONS.media,
    },
    {
      id: 'recording',
      label:
        videos.length > 0
          ? t('dialog.tabs.recordingWithCount', { count: videos.length })
          : t('dialog.tabs.recording'),
      icon: TAB_ICONS.recording,
    },
  ];
  const currentTab = tabs.some((tab) => tab.id === activeTab) ? activeTab : 'details';

  return (
    <div class="fixed inset-0 z-[2147483646] bg-black/50 flex items-center justify-center p-5 animate-[fadeIn_0.2s_ease-out]">
      <div
        class="relative w-full max-w-3xl h-[770px] max-h-[calc(100vh-40px)] min-h-0 bg-background border border-solid border-border rounded shadow-lg overflow-hidden flex flex-col animate-[slideUp_0.2s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bugpin-title"
      >
        {/* Header */}
        <div class="shrink-0 flex items-center justify-between p-6 border-b border-solid border-border">
          <h1 id="bugpin-title">{t('dialog.title')}</h1>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('aria.close')}>
            <X class="w-5 h-5" />
          </Button>
        </div>

        {showScreenCaptureConsent ? (
          <ScreenCaptureConsentDialog
            mode={consentMode}
            onConfirm={onConsentConfirm}
            onCancel={onConsentCancel}
          />
        ) : (
          <>
            {/* Tabs */}
            <div class="shrink-0 p-4 pb-0 bg-transparent">
              <Tabs tabs={tabs} activeTab={currentTab} onTabChange={onActiveTabChange} />
            </div>

            {/* Body */}
            <div class="flex-auto min-h-0 flex flex-col">
              {/* Details Tab */}
              {currentTab === 'details' && (
                <form
                  class="flex-auto min-h-0 overflow-y-auto p-6 flex flex-col gap-4"
                  onSubmit={handleSubmit}
                >
                  {/* Title */}
                  <div class="flex flex-col gap-1.5">
                    <Label for="bugpin-title-input" required>
                      {t('dialog.fields.title.label')}
                    </Label>
                    <Input
                      id="bugpin-title-input"
                      type="text"
                      placeholder={t('dialog.fields.title.placeholder')}
                      value={formData.title}
                      onInput={(e) =>
                        handleInputChange('title', (e.target as HTMLInputElement).value)
                      }
                      maxLength={200}
                      error={!!errors.title}
                      aria-describedby={errors.title ? 'bugpin-title-error' : undefined}
                    />
                    {errors.title && (
                      <span id="bugpin-title-error" class="text-destructive text-xs mt-0.5">
                        {errors.title}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <div class="flex flex-col gap-1.5">
                    <Label for="bugpin-description">{t('dialog.fields.description.label')}</Label>
                    <Textarea
                      id="bugpin-description"
                      placeholder={t('dialog.fields.description.placeholder')}
                      value={formData.description}
                      onInput={(e) =>
                        handleInputChange('description', (e.target as HTMLTextAreaElement).value)
                      }
                    />
                  </div>

                  {/* Priority */}
                  <div class="flex flex-col gap-1.5">
                    <Label for="bugpin-priority">{t('dialog.fields.priority.label')}</Label>
                    <Select
                      id="bugpin-priority"
                      value={formData.priority}
                      onChange={(e) =>
                        handleInputChange('priority', (e.target as HTMLSelectElement).value)
                      }
                    >
                      <option value="highest">{t('dialog.priority.highest')}</option>
                      <option value="high">{t('dialog.priority.high')}</option>
                      <option value="medium">{t('dialog.priority.medium')}</option>
                      <option value="low">{t('dialog.priority.low')}</option>
                      <option value="lowest">{t('dialog.priority.lowest')}</option>
                    </Select>
                  </div>

                  {/* Name */}
                  <div class="flex flex-col gap-1.5">
                    <Label for="bugpin-name">{t('dialog.fields.name.label')}</Label>
                    <Input
                      id="bugpin-name"
                      type="text"
                      placeholder={t('dialog.fields.name.placeholder')}
                      value={formData.reporterName}
                      onInput={(e) =>
                        handleInputChange('reporterName', (e.target as HTMLInputElement).value)
                      }
                    />
                  </div>

                  {/* Email */}
                  <div class="flex flex-col gap-1.5">
                    <Label for="bugpin-email">{t('dialog.fields.email.label')}</Label>
                    <Input
                      id="bugpin-email"
                      type="email"
                      placeholder={t('dialog.fields.email.placeholder')}
                      value={formData.reporterEmail}
                      onInput={(e) =>
                        handleInputChange('reporterEmail', (e.target as HTMLInputElement).value)
                      }
                      error={!!errors.reporterEmail}
                      aria-describedby={errors.reporterEmail ? 'bugpin-email-error' : undefined}
                    />
                    {errors.reporterEmail && (
                      <span id="bugpin-email-error" class="text-destructive text-xs mt-0.5">
                        {errors.reporterEmail}
                      </span>
                    )}
                  </div>
                </form>
              )}

              {/* Media Tab */}
              {currentTab === 'media' && (
                <ScreenshotManager
                  media={images}
                  onCapture={onCaptureScreenshot}
                  onUpload={onAddMedia}
                  onRemove={onRemoveMedia}
                  onAnnotate={onAnnotateMedia}
                  isCapturing={isCapturing}
                  enableAnnotation={enableAnnotation}
                  maxImageSize={maxImageSize}
                  reduceQuality={reduceScreenshotQuality}
                  onReduceQualityChange={onReduceScreenshotQualityChange}
                  oversizedCapture={oversizedCapture}
                  onDismissOversizedCapture={onDismissOversizedCapture}
                />
              )}

              {/* Videos Tab */}
              {currentTab === 'recording' && (
                <ScreenRecordingPanel
                  clips={videos}
                  recordingEnabled={recordingEnabled}
                  onRecord={onStartRecording}
                  onUpload={onAddMedia}
                  onRemove={onRemoveMedia}
                  isStarting={isRecordingStarting}
                  maxVideoSize={maxVideoSize}
                  allowMicrophone={allowRecordingMicrophone}
                  includeMicrophone={includeMicrophone}
                  onIncludeMicrophoneChange={onIncludeMicrophoneChange}
                  oversizedRecording={oversizedRecording}
                  onDismissOversizedRecording={onDismissOversizedRecording}
                />
              )}
            </div>

            {/* Footer */}
            <div class="shrink-0 flex flex-col gap-3 p-6 border-t border-solid border-border bg-muted">
              {isSubmitting && uploadProgress !== null && (
                <div
                  class="h-1.5 overflow-hidden rounded-full bg-foreground/15"
                  role="progressbar"
                  aria-label={t('submit.uploading', {
                    percent: Math.round(uploadProgress * 100),
                  })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(uploadProgress * 100)}
                >
                  <div
                    class="h-full bg-[var(--button-color)] transition-[width]"
                    style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                  />
                </div>
              )}
              <div class="flex gap-3">
                <Button
                  variant="outline"
                  class="flex-1"
                  onClick={isSubmitting ? onCancelSubmit : onClose}
                >
                  {isSubmitting ? t('submit.cancelUpload') : t('dialog.buttons.cancel')}
                </Button>
                <Button class="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting && uploadProgress !== null
                    ? t('submit.uploading', { percent: Math.round(uploadProgress * 100) })
                    : t('dialog.buttons.submit')}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Branding */}
        {!hidePoweredBy && (
          <div class="shrink-0 py-3 px-6 text-center text-xs text-muted-foreground border-t border-solid border-border bg-background">
            {t('dialog.branding.poweredBy')}{' '}
            <a
              href="https://bugpin.io"
              target="_blank"
              rel="noopener noreferrer"
              class="text-primary no-underline font-medium hover:underline hover:text-primary-hover"
            >
              BugPin
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
