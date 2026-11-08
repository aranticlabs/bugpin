import type { ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { SettingsCard } from '../ui/settings-card';
import { Spinner } from '../ui/spinner';

// Titles and descriptions shared by the project defaults pages and the project settings tabs,
// so both places always describe a section the same way.
export const SETTINGS_SECTIONS = {
  launcher: {
    title: 'General',
    description: 'Position, size, icon, text, theme and tooltip of the launcher button.',
  },
  launcherColors: {
    title: 'Colors',
    description: 'Button and text colors of the launcher button in light and dark mode.',
  },
  dialog: {
    title: 'Colors',
    description: 'Colors of the report dialog: buttons, background, inputs and text.',
  },
  dialogContent: {
    title: 'General',
    description: 'Title, placeholders, priority field and submit button of the report dialog.',
  },
  language: {
    title: 'Language',
    description: 'Language of the widget and of the emails reporters receive.',
  },
  screenshot: {
    title: 'Screenshot',
    description: 'How the widget captures and uploads screenshots.',
  },
  recording: {
    title: 'Recording',
    description: 'Screen recordings and video uploads.',
  },
  diagnostics: {
    title: 'Diagnostics',
    description: 'Technical context attached to every report.',
  },
  notifications: {
    title: 'Notifications',
    description: 'Default email notifications for the team and for reporters.',
  },
} as const;

export type SettingsSection = keyof typeof SETTINGS_SECTIONS;

interface SectionCardProps {
  section: SettingsSection;
  badge?: ReactNode;
  action?: ReactNode;
  // Hidden when the page header already shows the same title and description.
  showHeader?: boolean;
  children: ReactNode;
}

export function SectionCard({
  section,
  badge,
  action,
  showHeader = true,
  children,
}: SectionCardProps) {
  if (!showHeader) {
    return (
      <Card>
        <CardContent className="pt-6">{children}</CardContent>
      </Card>
    );
  }
  const { title, description } = SETTINGS_SECTIONS[section];
  return (
    <SettingsCard title={title} description={description} badge={badge} action={action}>
      {children}
    </SettingsCard>
  );
}

export function SectionLoading() {
  return (
    <div className="flex justify-center py-8">
      <Spinner className="text-primary" />
    </div>
  );
}

export function ResetToDefaultButton({
  onReset,
  disabled = false,
  label = 'Reset to Default',
}: {
  onReset: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div>
      <Button type="button" variant="outline" onClick={onReset} disabled={disabled}>
        <RotateCcw className="mr-2 h-4 w-4" />
        {label}
      </Button>
    </div>
  );
}
