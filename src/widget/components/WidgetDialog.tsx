import { FunctionComponent } from 'preact';
import { useState, useCallback } from 'preact/hooks';
import { ScreenshotManager, CapturedMedia } from './ScreenshotManager.js';
import { Button, Input, Textarea, Select, Label, Tabs } from './ui';

export interface FormData {
  title: string;
  description: string;
  priority: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  reporterEmail: string;
  reporterName: string;
}

interface WidgetDialogProps {
  onClose: () => void;
  onSubmit: (data: FormData, media: CapturedMedia[]) => void;
  onCaptureScreenshot: () => void;
  onAnnotateMedia: (id: string) => void;
  media: CapturedMedia[];
  onAddMedia: (item: CapturedMedia) => void;
  onRemoveMedia: (id: string) => void;
  isSubmitting: boolean;
  isCapturing: boolean;
  enableAnnotation: boolean;
  // Controlled state props (lifted to App for persistence across capture)
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  formData: FormData;
  onFormDataChange: (data: FormData) => void;
}

const TABS = [
  {
    id: 'details',
    label: 'Details',
    icon: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    id: 'media',
    label: 'Screenshots',
    icon: (
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
          fill="currentColor"
        />
      </svg>
    ),
  },
];

export const WidgetDialog: FunctionComponent<WidgetDialogProps> = ({
  onClose,
  onSubmit,
  onCaptureScreenshot,
  onAnnotateMedia,
  media,
  onAddMedia,
  onRemoveMedia,
  isSubmitting,
  isCapturing,
  enableAnnotation,
  activeTab,
  onActiveTabChange,
  formData,
  onFormDataChange,
}) => {
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const handleInputChange = useCallback(
    (field: keyof FormData, value: string) => {
      onFormDataChange({ ...formData, [field]: value });
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [formData, onFormDataChange, errors],
  );

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    } else if (formData.title.trim().length < 4) {
      newErrors.title = 'Title must be at least 4 characters';
    }

    if (formData.reporterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.reporterEmail)) {
      newErrors.reporterEmail = 'Invalid email address';
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
    [formData, media, validate, onSubmit, onActiveTabChange],
  );

  const mediaCount = media.length;

  return (
    <div class="fixed inset-0 z-[2147483646] bg-black/50 flex items-center justify-center p-5 animate-[fadeIn_0.2s_ease-out]">
      <div
        class="relative w-full max-w-3xl max-h-[90vh] bg-background border border-solid border-border rounded shadow-lg overflow-hidden flex flex-col animate-[slideUp_0.2s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bugpin-title"
      >
        {/* Header */}
        <div class="flex items-center justify-between p-6 border-b border-solid border-border">
          <h2 id="bugpin-title" class="text-lg font-semibold text-foreground tracking-tight">
            Report a Bug
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <svg class="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                fill="currentColor"
              />
            </svg>
          </Button>
        </div>

        {/* Tabs */}
        <div class="p-4 pb-0 bg-transparent">
          <Tabs
            tabs={TABS.map((tab) => ({
              ...tab,
              label:
                tab.id === 'media' && mediaCount > 0 ? `${tab.label} (${mediaCount})` : tab.label,
            }))}
            activeTab={activeTab}
            onTabChange={onActiveTabChange}
          />
        </div>

        {/* Body */}
        <div class="flex-1 overflow-y-auto p-6">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <form class="flex flex-col gap-4" onSubmit={handleSubmit}>
              {/* Title */}
              <div class="flex flex-col gap-1.5">
                <Label for="bugpin-title-input" required>
                  Title
                </Label>
                <Input
                  id="bugpin-title-input"
                  type="text"
                  placeholder="Brief description of the issue"
                  value={formData.title}
                  onInput={(e) => handleInputChange('title', (e.target as HTMLInputElement).value)}
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
                <Label for="bugpin-description">Description</Label>
                <Textarea
                  id="bugpin-description"
                  placeholder="Steps to reproduce, expected behavior, etc."
                  value={formData.description}
                  onInput={(e) =>
                    handleInputChange('description', (e.target as HTMLTextAreaElement).value)
                  }
                />
              </div>

              {/* Priority */}
              <div class="flex flex-col gap-1.5">
                <Label for="bugpin-priority">Priority</Label>
                <Select
                  id="bugpin-priority"
                  value={formData.priority}
                  onChange={(e) =>
                    handleInputChange('priority', (e.target as HTMLSelectElement).value)
                  }
                >
                  <option value="highest">Highest</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                  <option value="lowest">Lowest</option>
                </Select>
              </div>

              {/* Name */}
              <div class="flex flex-col gap-1.5">
                <Label for="bugpin-name">Name (optional)</Label>
                <Input
                  id="bugpin-name"
                  type="text"
                  placeholder="Your name"
                  value={formData.reporterName}
                  onInput={(e) =>
                    handleInputChange('reporterName', (e.target as HTMLInputElement).value)
                  }
                />
              </div>

              {/* Email */}
              <div class="flex flex-col gap-1.5">
                <Label for="bugpin-email">Email (optional)</Label>
                <Input
                  id="bugpin-email"
                  type="email"
                  placeholder="your@email.com"
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
          {activeTab === 'media' && (
            <ScreenshotManager
              media={media}
              onCapture={onCaptureScreenshot}
              onUpload={onAddMedia}
              onRemove={onRemoveMedia}
              onAnnotate={onAnnotateMedia}
              isCapturing={isCapturing}
              enableAnnotation={enableAnnotation}
            />
          )}
        </div>

        {/* Footer */}
        <div class="flex gap-3 p-6 border-t border-solid border-border bg-muted">
          <Button variant="outline" class="flex-1" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button class="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <span class="w-4 h-4 border-2 border-solid border-white/30 border-t-white rounded-full animate-[spin_0.8s_linear_infinite]" />
            ) : (
              'Submit Report'
            )}
          </Button>
        </div>

        {/* Branding */}
        <div class="py-3 px-6 text-center text-xs text-muted-foreground border-t border-solid border-border bg-background">
          Powered by{' '}
          <a
            href="https://bugpin.io"
            target="_blank"
            rel="noopener noreferrer"
            class="text-primary no-underline font-medium hover:underline hover:text-primary-hover"
          >
            BugPin
          </a>
        </div>
      </div>
    </div>
  );
};
