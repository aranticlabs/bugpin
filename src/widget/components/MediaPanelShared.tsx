import { FunctionComponent } from 'preact';
import { CircleAlert, Plus, TriangleAlert, Upload, X } from 'lucide-preact';
import { cn } from '../lib/utils';
import { t } from '../i18n';

export const MEDIA_DROPZONE_CLASS =
  'border-2 border-dashed border-border rounded bg-muted hover:border-primary hover:bg-primary/5';
export const MEDIA_DROPZONE_ACTIVE_CLASS =
  'border-2 border-dashed border-primary rounded bg-primary/5';

export const MediaOptionToggle: FunctionComponent<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}> = ({ label, checked, onChange, title }) => (
  <div
    class="flex items-center justify-end gap-2 text-xs text-muted-foreground select-none"
    title={title}
  >
    <label class="flex items-center gap-2 cursor-pointer">
      <span>{label}</span>
      <input
        type="checkbox"
        class="peer sr-only"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        aria-label={label}
      />
      <span
        aria-hidden="true"
        class="relative flex-shrink-0 inline-block w-8 h-4 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-[var(--button-color)] peer-focus-visible:[outline:2px_solid_var(--primary)] peer-focus-visible:outline-offset-2 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
      />
    </label>
  </div>
);

export const MediaUploadButton: FunctionComponent<{
  hasMedia: boolean;
  onClick: () => void;
}> = ({ hasMedia, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    class={cn(
      'w-full flex flex-col items-center justify-center text-center cursor-pointer transition-colors focus-visible:[outline:2px_solid_var(--primary)] focus-visible:outline-offset-2',
      hasMedia
        ? [
            'h-full gap-2 min-h-28 hover:[&_svg]:text-primary hover:[&_span]:text-primary',
            MEDIA_DROPZONE_CLASS,
          ]
        : 'py-8 px-4 text-muted-foreground hover:text-primary hover:[&_svg]:text-primary'
    )}
  >
    {hasMedia ? (
      <>
        <Plus class="w-8 h-8 text-muted-foreground transition-colors" />
        <span class="text-xs text-muted-foreground transition-colors">
          {t('screenshot.addMore')}
        </span>
      </>
    ) : (
      <>
        <Upload class="w-12 h-12 mb-3 text-muted-foreground transition-colors" />
        <span class="text-sm font-medium mb-1 text-foreground">
          {t('screenshot.dropzone.title')}
        </span>
        <span class="text-xs text-muted-foreground">{t('screenshot.dropzone.subtitle')}</span>
      </>
    )}
  </button>
);

export const MediaCaptureFeedback: FunctionComponent<{
  error: string | null;
  warning: { message: string; hint: string } | null;
  onDismiss?: () => void;
}> = ({ error, warning, onDismiss }) => (
  <>
    {warning && (
      <div
        role="alert"
        class="flex items-start gap-2 px-3 py-2.5 bg-warning/10 border border-solid border-warning/30 rounded text-warning text-xs"
      >
        <TriangleAlert class="w-4 h-4 flex-shrink-0 mt-px" />
        <div class="min-w-0 flex-1 leading-relaxed [overflow-wrap:anywhere]">
          <p class="text-xs text-inherit font-medium">{warning.message}</p>
          <p class="text-xs text-inherit mt-1 opacity-90">{warning.hint}</p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            class="flex-shrink-0 -mt-0.5 -mr-1 p-1 rounded text-inherit hover:bg-warning/15 transition-colors focus-visible:[outline:2px_solid_currentColor] focus-visible:outline-offset-2"
            aria-label={t('aria.close')}
          >
            <X class="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    )}
    {error && (
      <div
        role="alert"
        class="flex items-center gap-2 px-3 py-2.5 bg-destructive/10 border border-solid border-destructive/30 rounded text-destructive text-sm [overflow-wrap:anywhere]"
      >
        <CircleAlert class="w-4.5 h-4.5 flex-shrink-0" />
        <span class="min-w-0">{error}</span>
      </div>
    )}
  </>
);
