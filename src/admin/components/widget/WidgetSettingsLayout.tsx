import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import type {
  GlobalWidgetLauncherButtonSettings,
  LocaleCode,
  ThemeColors,
  WidgetLauncherButtonSettings,
} from '@shared/types';
import { useTheme } from '../../contexts/ThemeContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { WidgetDialogPreview } from '../WidgetDialogSettingsForm';
import { WidgetLauncherPreview } from '../WidgetLauncherButtonSettingsForm';
import type { ColorMode } from '../ThemeColorPicker';
import type { DialogContentPreview } from '../WidgetDialogContentForm';

export function useColorMode() {
  const { resolvedTheme } = useTheme();
  // A manual pick only holds until the console's own light or dark mode changes.
  const [choice, setChoice] = useState<{ mode: ColorMode; consoleTheme: ColorMode } | null>(null);
  const mode = choice?.consoleTheme === resolvedTheme ? choice.mode : resolvedTheme;
  const setMode = (next: ColorMode) => setChoice({ mode: next, consoleTheme: resolvedTheme });
  return [mode, setMode] as const;
}

function PreviewCard({
  description,
  mode,
  children,
}: {
  description: string;
  mode: ColorMode;
  children: (mode: ColorMode) => ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Live Preview</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children(mode)}</CardContent>
    </Card>
  );
}

// Stands in for the customer's page behind the widget preview, so it ignores the Admin Console theme.
const HOST_PAGE_BACKGROUND = { dark: 'bg-[#1f1f1f]', light: 'bg-neutral-100' } as const;

export function LauncherPreviewCard({
  launcher,
  launcherGlobals,
  locale,
  mode,
}: {
  mode: ColorMode;
  launcher: WidgetLauncherButtonSettings;
  launcherGlobals?: { widgetLauncherButton: GlobalWidgetLauncherButtonSettings };
  locale?: LocaleCode;
}) {
  return (
    <PreviewCard description="Hover over the button to see its effects." mode={mode}>
      {(mode) => (
        <div className={cn('relative min-h-50 rounded-lg border', HOST_PAGE_BACKGROUND[mode])}>
          <WidgetLauncherPreview
            value={launcher}
            globalSettings={launcherGlobals}
            mode={mode}
            locale={locale}
          />
        </div>
      )}
    </PreviewCard>
  );
}

export function DialogPreviewCard({
  colors,
  mode,
  content,
}: {
  colors: ThemeColors;
  mode: ColorMode;
  content?: DialogContentPreview;
}) {
  return (
    <PreviewCard description="How the report dialog looks with these colors." mode={mode}>
      {(mode) => (
        <div className={cn('rounded-lg border p-6', HOST_PAGE_BACKGROUND[mode])}>
          <div className="mx-auto max-w-3xl [zoom:0.85]">
            <WidgetDialogPreview colors={colors} mode={mode} content={content} />
          </div>
        </div>
      )}
    </PreviewCard>
  );
}

export function SettingsWithPreview({
  preview,
  placement = 'side',
  children,
}: {
  preview: ReactNode;
  placement?: 'side' | 'side-wide' | 'below';
  children: ReactNode;
}) {
  if (placement === 'below') {
    return (
      <div className="max-w-4xl space-y-6">
        {children}
        {preview}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'grid items-start gap-6',
        placement === 'side-wide'
          ? 'xl:max-w-[calc(56rem+340px+1.5rem)] xl:grid-cols-[minmax(0,40rem)_minmax(360px,1fr)]'
          : 'xl:grid-cols-[minmax(0,56rem)_340px]'
      )}
    >
      <div className="min-w-0 max-w-4xl space-y-6">{children}</div>
      <div className="max-w-4xl xl:sticky xl:top-0 xl:max-w-none">{preview}</div>
    </div>
  );
}
