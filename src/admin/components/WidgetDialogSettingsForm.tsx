import { useState, type CSSProperties, type ReactNode } from 'react';
import { FileText, Image as ImageIcon, Video, X } from 'lucide-react';
import { ThemeColorPicker, type ColorMode } from './ThemeColorPicker';
import type { DialogContentPreview } from './WidgetDialogContentForm';
import type { ThemeColors } from '@shared/types';
import { cn } from '../lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export const DEFAULT_WIDGET_COLORS: Required<ThemeColors> = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  lightBackgroundColor: '#ffffff',
  lightSecondaryColor: '#f5f5f5',
  lightInputColor: '#ffffff',
  lightForegroundColor: '#0a0a0a',
  lightSecondaryButtonColor: '#ffffff',
  lightSecondaryButtonTextColor: '#0a0a0a',
  lightSecondaryButtonHoverColor: '#e5e5e5',
  lightSecondaryButtonTextHoverColor: '#0a0a0a',
  lightTabBarColor: '#f5f5f5',
  lightActiveTabColor: '#ffffff',
  lightActiveTabTextColor: '#0a0a0a',
  lightTabTextColor: '#737373',
  lightTabTextHoverColor: '#0a0a0a',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
  darkBackgroundColor: '#0a0a0a',
  darkSecondaryColor: '#262626',
  darkInputColor: '#1a1a1a',
  darkForegroundColor: '#fafafa',
  darkSecondaryButtonColor: '#0a0a0a',
  darkSecondaryButtonTextColor: '#fafafa',
  darkSecondaryButtonHoverColor: '#404040',
  darkSecondaryButtonTextHoverColor: '#fafafa',
  darkTabBarColor: '#262626',
  darkActiveTabColor: '#0a0a0a',
  darkActiveTabTextColor: '#fafafa',
  darkTabTextColor: '#a3a3a3',
  darkTabTextHoverColor: '#fafafa',
};

interface WidgetDialogSettingsFormProps {
  value: Partial<ThemeColors>;
  onChange: (value: Partial<ThemeColors>) => void;
  globalWidgetColors?: ThemeColors;
  disabled?: boolean;
  colorMode?: ColorMode;
  onColorModeChange?: (mode: ColorMode) => void;
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
  asLabel = true,
  children,
}: {
  label: string;
  required?: boolean;
  asLabel?: boolean;
  children: ReactNode;
}) {
  const Wrapper = asLabel ? 'label' : 'div';
  return (
    <Wrapper className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--wp-foreground)]">
        {label}
        {required && <span className="ml-0.5 text-(--wp-destructive)">*</span>}
      </span>
      {children}
    </Wrapper>
  );
}

// Mirrors the widget's form control styles, including its border and ring color mixes.
const PREVIEW_INPUT_CLASS =
  'w-full rounded-[4px] border border-[var(--wp-control-border)] bg-[var(--wp-input)] px-3 py-2 text-sm text-[var(--wp-foreground)] transition-colors placeholder:text-[var(--wp-muted-foreground)] focus:border-[var(--wp-ring)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--wp-ring)_20%,transparent)]';

const PREVIEW_TABS = [
  { id: 'details', label: 'Details', icon: FileText },
  { id: 'screenshots', label: 'Screenshots', icon: ImageIcon },
  { id: 'recordings', label: 'Recordings', icon: Video },
] as const;

const DEFAULT_PREVIEW_CONTENT: DialogContentPreview = {
  title: 'Report a Bug',
  titlePlaceholder: 'Brief description of the issue',
  descriptionPlaceholder: 'Steps to reproduce, expected behavior, etc.',
  submitButtonText: 'Submit Report',
  showPriority: true,
};

export function WidgetDialogPreview({
  colors,
  mode,
  content = DEFAULT_PREVIEW_CONTENT,
}: {
  colors: ThemeColors;
  mode: 'light' | 'dark';
  content?: DialogContentPreview;
}) {
  const [activeTab, setActiveTab] = useState<(typeof PREVIEW_TABS)[number]['id']>('details');
  const dark = mode === 'dark';
  const tokens = WIDGET_THEME_TOKENS[mode];
  const style = {
    '--wp-background': dark ? colors.darkBackgroundColor : colors.lightBackgroundColor,
    '--wp-muted': dark ? colors.darkSecondaryColor : colors.lightSecondaryColor,
    '--wp-input': dark ? colors.darkInputColor : colors.lightInputColor,
    '--wp-foreground': dark ? colors.darkForegroundColor : colors.lightForegroundColor,
    '--wp-border': tokens.border,
    '--wp-control-border': `color-mix(in srgb, var(--wp-foreground) ${dark ? 12 : 11}%, var(--wp-background))`,
    '--wp-ring': `color-mix(in srgb, var(--wp-foreground) ${dark ? 84 : 38}%, var(--wp-background))`,
    colorScheme: mode,
    '--wp-muted-foreground': tokens.mutedForeground,
    '--wp-destructive': tokens.destructive,
    '--wp-primary': dark ? colors.darkButtonColor : colors.lightButtonColor,
    '--wp-primary-foreground': dark ? colors.darkTextColor : colors.lightTextColor,
    '--wp-primary-hover': dark ? colors.darkButtonHoverColor : colors.lightButtonHoverColor,
    '--wp-primary-hover-foreground': dark ? colors.darkTextHoverColor : colors.lightTextHoverColor,
    '--wp-secondary-button': dark
      ? colors.darkSecondaryButtonColor
      : colors.lightSecondaryButtonColor,
    '--wp-secondary-button-foreground': dark
      ? colors.darkSecondaryButtonTextColor
      : colors.lightSecondaryButtonTextColor,
    '--wp-secondary-button-hover': dark
      ? colors.darkSecondaryButtonHoverColor
      : colors.lightSecondaryButtonHoverColor,
    '--wp-secondary-button-hover-foreground': dark
      ? colors.darkSecondaryButtonTextHoverColor
      : colors.lightSecondaryButtonTextHoverColor,
    '--wp-tab-bar': dark ? colors.darkTabBarColor : colors.lightTabBarColor,
    '--wp-active-tab': dark ? colors.darkActiveTabColor : colors.lightActiveTabColor,
    '--wp-active-tab-foreground': dark
      ? colors.darkActiveTabTextColor
      : colors.lightActiveTabTextColor,
    '--wp-tab-foreground': dark ? colors.darkTabTextColor : colors.lightTabTextColor,
    '--wp-tab-hover-foreground': dark
      ? colors.darkTabTextHoverColor
      : colors.lightTabTextHoverColor,
  } as CSSProperties;

  return (
    <div
      aria-label="Dialog preview"
      style={style}
      className="overflow-hidden rounded border border-[var(--wp-border)] bg-[var(--wp-background)] text-[var(--wp-foreground)] shadow-lg"
    >
      <div className="flex items-center justify-between border-b border-[var(--wp-border)] p-6">
        <span className="text-xl font-semibold">{content.title}</span>
        <X className="h-5 w-5" aria-hidden="true" />
      </div>

      <div className="px-4 pt-4">
        <div
          role="tablist"
          className="inline-flex max-w-full flex-wrap gap-1 rounded bg-[var(--wp-tab-bar)] p-1"
        >
          {PREVIEW_TABS.map(({ id, label, icon: Icon }) => {
            const active = id === activeTab;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[var(--wp-active-tab)] text-[var(--wp-active-tab-foreground)] shadow-sm'
                    : 'text-[var(--wp-tab-foreground)] hover:text-[var(--wp-tab-hover-foreground)]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6">
        <PreviewField label="Title" required>
          <input
            type="text"
            placeholder={content.titlePlaceholder}
            className={cn(PREVIEW_INPUT_CLASS, 'h-10')}
          />
        </PreviewField>
        <PreviewField label="Description">
          <textarea
            placeholder={content.descriptionPlaceholder}
            className={cn(PREVIEW_INPUT_CLASS, 'min-h-20 resize-y')}
          />
        </PreviewField>
        {content.showPriority && (
          <PreviewField label="Priority" asLabel={false}>
            <Select defaultValue="medium">
              <SelectTrigger
                aria-label="Priority"
                className={cn(PREVIEW_INPUT_CLASS, 'h-10 cursor-pointer shadow-none')}
              >
                <SelectValue />
              </SelectTrigger>
              {/* The list renders in a portal, so it needs the preview colors applied directly. */}
              <SelectContent
                style={style}
                className="rounded-[6px] border-[var(--wp-control-border)] bg-[var(--wp-background)] text-[var(--wp-foreground)]"
              >
                {['Highest', 'High', 'Medium', 'Low', 'Lowest'].map((priority) => (
                  <SelectItem
                    key={priority}
                    value={priority.toLowerCase()}
                    className="cursor-pointer rounded-[4px] focus:bg-[color-mix(in_srgb,var(--wp-foreground)_8%,transparent)]"
                  >
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PreviewField>
        )}
      </div>

      <div className="flex gap-3 border-t border-[var(--wp-border)] bg-[var(--wp-muted)] p-6">
        <span className="flex h-10 flex-1 cursor-default items-center justify-center rounded-md border border-[var(--wp-border)] bg-[var(--wp-secondary-button)] text-sm font-medium text-[var(--wp-secondary-button-foreground)] transition-colors hover:bg-[var(--wp-secondary-button-hover)] hover:text-[var(--wp-secondary-button-hover-foreground)]">
          Cancel
        </span>
        <span className="flex h-10 flex-1 cursor-default items-center justify-center rounded-md bg-[var(--wp-primary)] text-sm font-medium text-[var(--wp-primary-foreground)] transition-colors hover:bg-[var(--wp-primary-hover)] hover:text-[var(--wp-primary-hover-foreground)]">
          {content.submitButtonText}
        </span>
      </div>

      <div className="border-t border-[var(--wp-border)] bg-[var(--wp-background)] px-6 py-3 text-center text-xs text-[var(--wp-muted-foreground)]">
        Powered by <span className="font-medium text-[#02658D]">BugPin</span>
      </div>
    </div>
  );
}

export function WidgetDialogSettingsForm({
  value,
  onChange,
  globalWidgetColors,
  disabled = false,
  colorMode,
  onColorModeChange,
}: WidgetDialogSettingsFormProps) {
  return (
    <ThemeColorPicker
      value={resolveDialogColors(value, globalWidgetColors)}
      onChange={(colors) => onChange({ ...value, ...colors })}
      disabled={disabled}
      showSurfaceColors
      mode={colorMode}
      onModeChange={onColorModeChange}
    />
  );
}
