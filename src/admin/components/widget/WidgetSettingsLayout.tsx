import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import type {
  GlobalWidgetLauncherButtonSettings,
  LocaleCode,
  ThemeColors,
  WidgetLauncherButtonSettings,
} from '@shared/types';
import { useTheme } from '../../contexts/ThemeContext';
import { usePreference } from '../../hooks/useUserPreferences';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { WidgetDialogPreview } from '../WidgetDialogSettingsForm';
import { WidgetLauncherPreview } from '../WidgetLauncherButtonSettingsForm';

type PreviewMode = 'light' | 'dark';

function PreviewCard({
  description,
  collapsible = false,
  children,
}: {
  description: string;
  collapsible?: boolean;
  children: (mode: PreviewMode) => ReactNode;
}) {
  const [storedOpen, setOpen] = usePreference('dialogPreviewOpen', true, {
    legacyKey: 'bugpin-dialog-preview-open',
    parseLegacy: (raw) => raw !== 'false',
  });
  const open = collapsible ? storedOpen : true;
  const { resolvedTheme } = useTheme();
  // A manual pick only holds until the console's own light or dark mode changes.
  const [choice, setChoice] = useState<{ mode: PreviewMode; consoleTheme: PreviewMode } | null>(
    null
  );
  const mode = choice?.consoleTheme === resolvedTheme ? choice.mode : resolvedTheme;
  const setMode = (next: PreviewMode) => setChoice({ mode: next, consoleTheme: resolvedTheme });
  const heading = (
    <div className="space-y-1.5 text-left">
      <CardTitle className="text-base">Live Preview</CardTitle>
      <CardDescription>{description}</CardDescription>
    </div>
  );
  const body = children(mode);
  const modeSwitch = (
    <Tabs value={mode} onValueChange={(value) => setMode(value as PreviewMode)}>
      <TabsList className="h-8">
        <TabsTrigger value="light" className="px-2 text-xs">
          Light
        </TabsTrigger>
        <TabsTrigger value="dark" className="px-2 text-xs">
          Dark
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (!collapsible) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
          {heading}
          {modeSwitch}
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card>
        <CardHeader
          className={cn(
            'flex flex-row items-start justify-between gap-4 space-y-0',
            open ? 'pb-3' : ''
          )}
        >
          <CollapsibleTrigger className="flex flex-1 items-start gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                open ? '' : '-rotate-90'
              )}
              aria-hidden="true"
            />
            {heading}
          </CollapsibleTrigger>
          {open && modeSwitch}
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{body}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// Stands in for the customer's page behind the widget preview, so it ignores the Admin Console theme.
const HOST_PAGE_BACKGROUND = { dark: 'bg-neutral-900', light: 'bg-neutral-100' } as const;

export function LauncherPreviewCard({
  launcher,
  launcherGlobals,
  locale,
}: {
  launcher: WidgetLauncherButtonSettings;
  launcherGlobals?: { widgetLauncherButton: GlobalWidgetLauncherButtonSettings };
  locale?: LocaleCode;
}) {
  return (
    <PreviewCard description="Hover over the button to see its effects.">
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

export function DialogPreviewCard({ colors }: { colors: ThemeColors }) {
  return (
    <PreviewCard description="How the report dialog looks with these colors." collapsible>
      {(mode) => (
        <div className={cn('rounded-lg border p-6', HOST_PAGE_BACKGROUND[mode])}>
          <div className="mx-auto max-w-3xl [zoom:0.85]">
            <WidgetDialogPreview colors={colors} mode={mode} />
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
  placement?: 'side' | 'below';
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
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,56rem)_340px]">
      <div className="min-w-0 max-w-4xl space-y-6">{children}</div>
      <div className="max-w-4xl xl:sticky xl:top-0 xl:max-w-none">{preview}</div>
    </div>
  );
}
