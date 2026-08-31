import { FunctionComponent } from 'preact';
import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { WidgetConfig } from '../config.js';
import { WidgetLauncherButton } from './WidgetLauncherButton.js';
import { WidgetDialog, FormData } from './WidgetDialog.js';
import { Toast, ToastType } from './ui';
import { AnnotationCanvas } from '../annotate/AnnotationCanvas.js';
import { CapturedMedia } from './ScreenshotManager.js';
import { captureScreenshot, dataUrlToBlob } from '../capture/screenshot.js';
import { captureContext, clearUserActivity } from '../capture/context.js';
import { submitReport } from '../api/submit.js';
import { draftStorage } from '../storage/draft-storage.js';
import { useEffectiveTheme } from '../hooks/use-effective-theme.js';
import { useLocale } from '../hooks/use-locale.js';
import { getLocale, t } from '../i18n/index.js';

type WidgetStep = 'closed' | 'form' | 'annotating';

const INITIAL_FORM_DATA: FormData = {
  title: '',
  description: '',
  priority: 'medium',
  reporterEmail: '',
  reporterName: '',
};

function getInitialFormData(config: WidgetConfig): FormData {
  return {
    ...INITIAL_FORM_DATA,
    reporterEmail: config.reporterEmail ?? '',
    reporterName: config.reporterName ?? '',
  };
}

type AppDependencies = {
  WidgetDialog: typeof WidgetDialog;
  AnnotationCanvas: typeof AnnotationCanvas;
  captureScreenshot: typeof captureScreenshot;
  captureContext: typeof captureContext;
  submitReport: typeof submitReport;
  clearUserActivity: typeof clearUserActivity;
};

interface AppProps {
  config: WidgetConfig;
  deps?: Partial<AppDependencies>;
}

export const App: FunctionComponent<AppProps> = ({ config, deps }) => {
  const WidgetDialogComponent = deps?.WidgetDialog ?? WidgetDialog;
  const AnnotationCanvasComponent = deps?.AnnotationCanvas ?? AnnotationCanvas;
  const captureScreenshotFn = deps?.captureScreenshot ?? captureScreenshot;
  const captureContextFn = deps?.captureContext ?? captureContext;
  const submitReportFn = deps?.submitReport ?? submitReport;
  const clearUserActivityFn = deps?.clearUserActivity ?? clearUserActivity;
  useLocale();
  const containerRef = useRef<HTMLDivElement>(null);
  const effectiveTheme = useEffectiveTheme(config.theme);
  const [step, setStep] = useState<WidgetStep>('closed');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [media, setMedia] = useState<CapturedMedia[]>([]);
  const [annotatingMediaId, setAnnotatingMediaId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  // Lifted state for Modal persistence across screenshot capture
  const [activeTab, setActiveTab] = useState('details');
  const [formData, setFormData] = useState<FormData>(() => getInitialFormData(config));
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showScreenCaptureConsent, setShowScreenCaptureConsent] = useState(false);
  const [reduceScreenshotQuality, setReduceScreenshotQuality] = useState(false);
  const [oversizedCapture, setOversizedCapture] = useState<{
    sizeMb: number;
    limitMb: number;
  } | null>(null);

  // Load draft when widget opens
  useEffect(() => {
    if (step === 'form' && !draftLoaded) {
      draftStorage.load(config.apiKey, config.reporterEmail).then((draft) => {
        if (draft) {
          setFormData(draft.formData);
          setActiveTab(draft.activeTab);
          setMedia(draft.media);
        }
        setDraftLoaded(true);
      });
    }
  }, [step, draftLoaded, config.apiKey, config.reporterEmail]);

  // Apply theme-based CSS variables for dialog styling (uses dialog colors, not launcher colors)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (effectiveTheme === 'dark') {
      container.style.setProperty('--button-color', config.dialogDarkButtonColor);
      container.style.setProperty('--button-text-color', config.dialogDarkTextColor);
      container.style.setProperty('--button-hover-color', config.dialogDarkButtonHoverColor);
      container.style.setProperty('--button-hover-text-color', config.dialogDarkTextHoverColor);
      container.style.setProperty('--background', config.dialogDarkBackgroundColor);
      container.style.setProperty('--muted', config.dialogDarkSecondaryColor);
      container.style.setProperty('--input-background', config.dialogDarkInputColor);
      container.style.setProperty('--foreground', config.dialogDarkForegroundColor);
    } else {
      container.style.setProperty('--button-color', config.dialogLightButtonColor);
      container.style.setProperty('--button-text-color', config.dialogLightTextColor);
      container.style.setProperty('--button-hover-color', config.dialogLightButtonHoverColor);
      container.style.setProperty('--button-hover-text-color', config.dialogLightTextHoverColor);
      container.style.setProperty('--background', config.dialogLightBackgroundColor);
      container.style.setProperty('--muted', config.dialogLightSecondaryColor);
      container.style.setProperty('--input-background', config.dialogLightInputColor);
      container.style.setProperty('--foreground', config.dialogLightForegroundColor);
    }
  }, [
    effectiveTheme,
    config.dialogLightButtonColor,
    config.dialogLightTextColor,
    config.dialogLightButtonHoverColor,
    config.dialogLightTextHoverColor,
    config.dialogLightBackgroundColor,
    config.dialogLightSecondaryColor,
    config.dialogLightInputColor,
    config.dialogLightForegroundColor,
    config.dialogDarkButtonColor,
    config.dialogDarkTextColor,
    config.dialogDarkButtonHoverColor,
    config.dialogDarkTextHoverColor,
    config.dialogDarkBackgroundColor,
    config.dialogDarkSecondaryColor,
    config.dialogDarkInputColor,
    config.dialogDarkForegroundColor,
  ]);

  const handleOpenWidget = useCallback(() => {
    setStep('form');
  }, []);

  // Check if there's any content in the form
  const hasContent =
    formData.title.trim() ||
    formData.description.trim() ||
    formData.reporterEmail.trim() !== (config.reporterEmail ?? '').trim() ||
    formData.reporterName.trim() !== (config.reporterName ?? '').trim() ||
    media.length > 0;

  const resetUserActivity = useCallback(() => {
    clearUserActivityFn();
  }, [clearUserActivityFn]);

  // Request to close - show confirmation if there's content
  const handleRequestClose = useCallback(() => {
    if (hasContent) {
      setShowCloseConfirm(true);
    } else {
      // No content, just close
      resetUserActivity();
      setStep('closed');
      setAnnotatingMediaId(null);
      setDraftLoaded(false);
    }
  }, [hasContent, resetUserActivity]);

  // Close and keep draft
  const handleCloseKeepDraft = useCallback(() => {
    draftStorage.save(config.apiKey, formData, activeTab, media, config.reporterEmail);
    resetUserActivity();
    setShowCloseConfirm(false);
    setStep('closed');
    setAnnotatingMediaId(null);
    setDraftLoaded(false);
  }, [config.apiKey, config.reporterEmail, formData, activeTab, media, resetUserActivity]);

  // Close and discard draft
  const handleCloseDiscardDraft = useCallback(() => {
    resetUserActivity();
    setMedia([]);
    setActiveTab('details');
    setFormData(getInitialFormData(config));
    draftStorage.clear(config.apiKey);
    setShowCloseConfirm(false);
    setStep('closed');
    setAnnotatingMediaId(null);
    setDraftLoaded(false);
  }, [config.apiKey, config.reporterEmail, config.reporterName, resetUserActivity]);

  // Direct close (used after successful submission)
  const handleCloseWidget = useCallback(
    (clearDraftData = false) => {
      resetUserActivity();
      if (clearDraftData === true) {
        // Clear state and draft (after successful submission)
        setMedia([]);
        setActiveTab('details');
        setFormData(getInitialFormData(config));
        draftStorage.clear(config.apiKey);
      }
      setShowCloseConfirm(false);
      setStep('closed');
      setAnnotatingMediaId(null);
      setDraftLoaded(false);
    },
    [config.apiKey, config.reporterEmail, config.reporterName, resetUserActivity]
  );

  // Listen for external open/close events
  useEffect(() => {
    const handleOpen = () => handleOpenWidget();
    const handleClose = () => handleRequestClose();

    document.addEventListener('bugpin:open', handleOpen);
    document.addEventListener('bugpin:close', handleClose);

    return () => {
      document.removeEventListener('bugpin:open', handleOpen);
      document.removeEventListener('bugpin:close', handleClose);
    };
  }, [handleOpenWidget, handleRequestClose]);

  const handleCaptureScreenshot = useCallback(async () => {
    if (!config.enableScreenshot) return;

    if (config.useScreenCaptureAPI && !showScreenCaptureConsent) {
      const skipConsent = localStorage.getItem('bugpin-skip-screen-capture-consent') === 'true';
      if (!skipConsent) {
        setShowScreenCaptureConsent(true);
        return;
      }
    }
    // Reset consent flag before proceeding with actual capture
    setShowScreenCaptureConsent(false);

    setIsCapturing(true);
    // Brief delay to ensure modal is hidden from capture
    setStep('closed');
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const dataUrl = await captureScreenshotFn({
        method: config.captureMethod,
        useScreenCaptureAPI: config.useScreenCaptureAPI,
        pixelRatioOverride: reduceScreenshotQuality ? 1 : undefined,
      });

      // Reject oversized captures up-front instead of letting the server drop
      // them silently on submit. Surface the failure via an inline banner in
      // the screenshots tab so the user can lower the capture quality or
      // resize the window and retry.
      const blob = dataUrlToBlob(dataUrl);
      if (blob.size > config.maxScreenshotSize) {
        const sizeMb = Math.round((blob.size / (1024 * 1024)) * 10) / 10;
        const limitMb = Math.round(config.maxScreenshotSize / (1024 * 1024));
        setOversizedCapture({ sizeMb, limitMb });
        setIsCapturing(false);
        setActiveTab('media');
        setStep('form');
        return;
      }

      // Successful capture clears any previous oversize warning.
      setOversizedCapture(null);

      const img = new Image();

      img.onload = () => {
        // Debug: Log captured image info
        console.log(
          `[BugPin] Captured screenshot: ${img.width}x${img.height}, dataUrl length=${dataUrl.length}`
        );

        const newMedia: CapturedMedia = {
          id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          dataUrl,
          timestamp: new Date(),
          annotated: false,
          mimeType: 'image/png',
          width: img.width,
          height: img.height,
        };

        setMedia((prev) => [...prev, newMedia]);
        setIsCapturing(false);
        setActiveTab('media'); // Stay on media tab after capture
        setStep('form');
      };

      img.onerror = () => {
        // Still add the screenshot even if we can't get dimensions
        const newMedia: CapturedMedia = {
          id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          dataUrl,
          timestamp: new Date(),
          annotated: false,
          mimeType: 'image/png',
        };

        setMedia((prev) => [...prev, newMedia]);
        setIsCapturing(false);
        setActiveTab('media'); // Stay on media tab after capture
        setStep('form');
      };

      img.src = dataUrl;
    } catch (error) {
      console.error('[BugPin] Failed to capture screenshot:', error);
      setIsCapturing(false);
      setStep('form');
      setToast({
        message: t('toast.error.capture'),
        type: 'error',
      });
    }
  }, [config, captureScreenshotFn, showScreenCaptureConsent, reduceScreenshotQuality]);

  const handleConsentConfirm = useCallback(() => {
    handleCaptureScreenshot();
  }, [handleCaptureScreenshot]);

  const handleConsentCancel = useCallback(() => {
    setShowScreenCaptureConsent(false);
  }, []);

  const handleAddMedia = useCallback((item: CapturedMedia) => {
    setMedia((prev) => [...prev, item]);
  }, []);

  const handleRemoveMedia = useCallback((id: string) => {
    setMedia((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleAnnotateMedia = useCallback((id: string) => {
    setAnnotatingMediaId(id);
    setStep('annotating');
  }, []);

  const handleAnnotationSave = useCallback(
    (annotatedImage: string, annotationData: object) => {
      if (annotatingMediaId) {
        setMedia((prev) =>
          prev.map((item) =>
            item.id === annotatingMediaId
              ? {
                  ...item,
                  dataUrl: annotatedImage,
                  annotated: true,
                  annotations: annotationData,
                }
              : item
          )
        );
      }
      setAnnotatingMediaId(null);
      setStep('form');
    },
    [annotatingMediaId]
  );

  const handleAnnotationCancel = useCallback(() => {
    setAnnotatingMediaId(null);
    setStep('form');
  }, []);

  const handleSubmit = useCallback(
    async (formData: FormData, mediaItems: CapturedMedia[]) => {
      setIsSubmitting(true);

      try {
        // Capture context
        const metadata = captureContextFn({
          consoleCapture: config.enableConsoleCapture,
          networkCapture: config.enableNetworkCapture,
          storageKeysCapture: config.enableStorageKeysCapture,
          userActivityCapture: config.userActivityCapture === 'automatic',
        });

        // Submit report with all media
        await submitReportFn({
          apiKey: config.apiKey,
          serverUrl: config.serverUrl,
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          reporterEmail: formData.reporterEmail || undefined,
          reporterName: formData.reporterName || undefined,
          locale: getLocale(),
          media: mediaItems.map((item) => ({
            dataUrl: item.dataUrl,
            mimeType: item.mimeType,
            annotations: item.annotations,
          })),
          metadata,
        });

        // Show success toast
        setToast({ message: t('toast.success.submit'), type: 'success' });

        // Close modal and clear draft
        handleCloseWidget(true);
      } catch (error) {
        console.error('[BugPin] Failed to submit report:', error);
        setToast({
          message: error instanceof Error ? error.message : t('toast.error.submit'),
          type: 'error',
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [config, handleCloseWidget, captureContextFn, submitReportFn]
  );

  const handleToastClose = useCallback(() => {
    setToast(null);
  }, []);

  // Get the media item being annotated
  const annotatingMedia = annotatingMediaId
    ? media.find((item) => item.id === annotatingMediaId)
    : null;

  return (
    <div ref={containerRef} class={`bugpin-container bugpin-theme-${effectiveTheme}`}>
      <WidgetLauncherButton
        position={config.position}
        buttonText={config.buttonText}
        buttonShape={config.buttonShape}
        buttonIcon={config.buttonIcon}
        buttonIconSize={config.buttonIconSize}
        buttonIconStroke={config.buttonIconStroke}
        theme={config.theme}
        lightButtonColor={config.lightButtonColor}
        lightTextColor={config.lightTextColor}
        lightButtonHoverColor={config.lightButtonHoverColor}
        lightTextHoverColor={config.lightTextHoverColor}
        darkButtonColor={config.darkButtonColor}
        darkTextColor={config.darkTextColor}
        darkButtonHoverColor={config.darkButtonHoverColor}
        darkTextHoverColor={config.darkTextHoverColor}
        enableHoverScaleEffect={config.enableHoverScaleEffect}
        tooltipEnabled={config.tooltipEnabled}
        tooltipText={config.tooltipText}
        onClick={handleOpenWidget}
      />

      {step === 'annotating' && annotatingMedia && (
        <div class="fixed inset-0 z-[2147483646] bg-black/50 flex items-center justify-center p-5 animate-[fadeIn_0.2s_ease-out]">
          <div class="relative w-full max-w-4xl h-[770px] max-h-[calc(100vh-40px)] min-h-0 bg-background border border-solid border-border rounded shadow-lg overflow-hidden flex flex-col animate-[slideUp_0.2s_ease-out]">
            <AnnotationCanvasComponent
              screenshot={annotatingMedia.dataUrl}
              onSave={handleAnnotationSave}
              onCancel={handleAnnotationCancel}
            />
          </div>
        </div>
      )}

      {step === 'form' && (
        <WidgetDialogComponent
          onClose={handleRequestClose}
          onSubmit={handleSubmit}
          onCaptureScreenshot={handleCaptureScreenshot}
          onAnnotateMedia={handleAnnotateMedia}
          media={media}
          onAddMedia={handleAddMedia}
          onRemoveMedia={handleRemoveMedia}
          isSubmitting={isSubmitting}
          isCapturing={isCapturing}
          enableAnnotation={config.enableAnnotation}
          maxImageSize={config.maxImageUploadSize}
          maxVideoSize={config.maxVideoUploadSize}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
          formData={formData}
          onFormDataChange={setFormData}
          showScreenCaptureConsent={showScreenCaptureConsent}
          onConsentConfirm={handleConsentConfirm}
          onConsentCancel={handleConsentCancel}
          reduceScreenshotQuality={reduceScreenshotQuality}
          onReduceScreenshotQualityChange={setReduceScreenshotQuality}
          oversizedCapture={oversizedCapture}
          onDismissOversizedCapture={() => setOversizedCapture(null)}
        />
      )}

      {/* Close confirmation dialog */}
      {showCloseConfirm && (
        <div class="fixed inset-0 z-[2147483647] bg-black/50 flex items-center justify-center p-5 animate-[fadeIn_0.2s_ease-out]">
          <div
            class="relative w-full max-w-sm bg-background border border-solid border-border rounded shadow-lg overflow-hidden flex flex-col animate-[slideUp_0.2s_ease-out]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bugpin-confirm-title"
          >
            <div class="p-6">
              <h1 id="bugpin-confirm-title" class="tracking-tight mb-2">
                {t('closeConfirm.title')}
              </h1>
              <p class="text-sm text-muted-foreground mb-6">{t('closeConfirm.body')}</p>
              <div class="flex gap-3">
                <button
                  type="button"
                  onClick={handleCloseDiscardDraft}
                  class="flex-1 px-4 py-2 text-sm font-medium rounded border border-solid border-border bg-background text-foreground hover:bg-muted transition-colors"
                >
                  {t('closeConfirm.discardButton')}
                </button>
                <button
                  type="button"
                  onClick={handleCloseKeepDraft}
                  class="flex-1 px-4 py-2 text-sm font-medium rounded border border-solid border-transparent text-[var(--button-text-color)] bg-[var(--button-color)] hover:bg-[var(--button-hover-color)] hover:text-[var(--button-hover-text-color)] transition-colors"
                >
                  {t('closeConfirm.saveDraftButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={handleToastClose} />}
    </div>
  );
};
