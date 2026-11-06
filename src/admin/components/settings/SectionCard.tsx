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
    title: 'Launcher Button',
    description: 'How the button that opens the widget looks on the website.',
  },
  dialog: {
    title: 'Dialog Colors',
    description: 'Colors of the report dialog: buttons, background, inputs and text.',
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
}: {
  onReset: () => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Button type="button" variant="outline" onClick={onReset} disabled={disabled}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Reset to Default
      </Button>
    </div>
  );
}
