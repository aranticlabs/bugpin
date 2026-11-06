import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown, FileText, Image as ImageIcon, Video, X } from 'lucide-react';
import { ThemeColorPicker } from './ThemeColorPicker';
import type { ThemeColors } from '@shared/types';
import { cn } from '../lib/utils';

const DEFAULT_WIDGET_COLORS: Required<ThemeColors> = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  lightBackgroundColor: '#ffffff',
  lightSecondaryColor: '#f5f5f5',
  lightInputColor: '#ffffff',
  lightForegroundColor: '#0a0a0a',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
  darkBackgroundColor: '#0a0a0a',
  darkSecondaryColor: '#262626',
  darkInputColor: '#1a1a1a',
  darkForegroundColor: '#fafafa',
};

interface WidgetDialogSettingsFormProps {
  value: Partial<ThemeColors>;
  onChange: (value: Partial<ThemeColors>) => void;
  globalWidgetColors?: ThemeColors;
  disabled?: boolean;
}

export function resolveDialogColors(
  value: Partial<ThemeColors>,
  globalWidgetColors?: ThemeColors
): ThemeColors {
  const resolved: Required<ThemeColors> = { ...DEFAULT_WIDGET_COLORS };
  for (const key of Object.keys(DEFAULT_WIDGET_COLORS) as Array<keyof ThemeColors>) {
    resolved[key] = value[key] ?? globalWidgetColors?.[key] ?? DEFAULT_WIDGET_COLORS[key];
  }
  return resolved;
}

// Fixed widget theme tokens that the dialog colors do not override.
const WIDGET_THEME_TOKENS = {
  light: { border: '#e5e5e5', mutedForeground: '#737373', destructive: '#ef4444' },
  dark: { border: '#262626', mutedForeground: '#a3a3a3', destructive: '#ef4444' },
} as const;

function PreviewField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--wp-foreground)]">
        {label}
        {required && <span className="ml-0.5 text-(--wp-destructive)">*</span>}
      </span>
      {children}
    </div>
  );
}

const PREVIEW_INPUT_CLASS =
  'flex h-10 w-full items-center rounded-md border border-[var(--wp-border)] bg-[var(--wp-input)] px-3 text-sm';

export function WidgetDialogPreview({
  colors,
  mode,
}: {
  colors: ThemeColors;
  mode: 'light' | 'dark';
}) {
  const dark = mode === 'dark';
  const tokens = WIDGET_THEME_TOKENS[mode];
  const style = {
    '--wp-background': dark ? colors.darkBackgroundColor : colors.lightBackgroundColor,
    '--wp-muted': dark ? colors.darkSecondaryColor : colors.lightSecondaryColor,
    '--wp-input': dark ? colors.darkInputColor : colors.lightInputColor,
    '--wp-foreground': dark ? colors.darkForegroundColor : colors.lightForegroundColor,
    '--wp-border': tokens.border,
    '--wp-muted-foreground': tokens.mutedForeground,
    '--wp-destructive': tokens.destructive,
    '--wp-primary': dark ? colors.darkButtonColor : colors.lightButtonColor,
    '--wp-primary-foreground': dark ? colors.darkTextColor : colors.lightTextColor,
    '--wp-primary-hover': dark ? colors.darkButtonHoverColor : colors.lightButtonHoverColor,
    '--wp-primary-hover-foreground': dark ? colors.darkTextHoverColor : colors.lightTextHoverColor,
  } as CSSProperties;

  return (
    <div
      aria-label="Dialog preview"
      style={style}
      className="overflow-hidden rounded border border-[var(--wp-border)] bg-[var(--wp-background)] text-[var(--wp-foreground)] shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-[var(--wp-border)] p-6">
        <span className="text-xl font-semibold">Report a Bug</span>
        <X className="h-5 w-5" aria-hidden="true" />
      </div>

      <div className="px-4 pt-4">
        <div className="inline-flex max-w-full flex-wrap gap-1 rounded bg-[var(--wp-muted)] p-1">
          {[
            { label: 'Details', icon: FileText, active: true },
            { label: 'Screenshots', icon: ImageIcon, active: false },
            { label: 'Recordings', icon: Video, active: false },
          ].map(({ label, icon: Icon, active }) => (
            <span
              key={label}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
                active
                  ? 'bg-[var(--wp-background)] text-[var(--wp-foreground)] shadow-sm'
                  : 'text-[var(--wp-muted-foreground)]'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <PreviewField label="Title" required>
          <div className={cn(PREVIEW_INPUT_CLASS, 'text-[var(--wp-muted-foreground)]')}>
            Brief description of the issue
          </div>
        </PreviewField>
        <PreviewField label="Description">
          <div
            className={cn(
              PREVIEW_INPUT_CLASS,
              'h-20 items-start py-2 text-[var(--wp-muted-foreground)]'
            )}
          >
            Steps to reproduce, expected behavior, etc.
          </div>
        </PreviewField>
        <PreviewField label="Priority">
          <div className={cn(PREVIEW_INPUT_CLASS, 'justify-between')}>
            Medium
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </div>
        </PreviewField>
      </div>

      <div className="flex gap-3 border-t border-[var(--wp-border)] bg-[var(--wp-muted)] p-6">
        <span className="flex h-10 flex-1 items-center justify-center rounded-md border border-[var(--wp-border)] bg-[var(--wp-background)] text-sm font-medium">
          Cancel
        </span>
        <span className="flex h-10 flex-1 cursor-default items-center justify-center rounded-md bg-[var(--wp-primary)] text-sm font-medium text-[var(--wp-primary-foreground)] transition-colors hover:bg-[var(--wp-primary-hover)] hover:text-[var(--wp-primary-hover-foreground)]">
          Submit Report
        </span>
      </div>

      <div className="border-t border-[var(--wp-border)] bg-[var(--wp-background)] px-6 py-3 text-center text-xs text-[var(--wp-muted-foreground)]">
        Powered by <span className="font-medium text-[var(--wp-primary)]">BugPin</span>
      </div>
    </div>
  );
}

export function WidgetDialogSettingsForm({
  value,
  onChange,
  globalWidgetColors,
  disabled = false,
}: WidgetDialogSettingsFormProps) {
  return (
    <ThemeColorPicker
      value={resolveDialogColors(value, globalWidgetColors)}
      onChange={(colors) => onChange({ ...value, ...colors })}
      disabled={disabled}
      showSurfaceColors
    />
  );
}
