import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../../api/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { RotateCcw } from 'lucide-react';
import { Spinner } from '../../components/ui/spinner';
import { WidgetLauncherButtonSettingsForm } from '../../components/WidgetLauncherButtonSettingsForm';
import type {
  AppSettings,
  GlobalWidgetLauncherButtonSettings,
  WidgetLauncherButtonSettings,
} from '@shared/types';

const DEFAULT_BUTTON_SETTINGS: GlobalWidgetLauncherButtonSettings = {
  position: 'bottom-right',
  buttonText: null,
  buttonShape: 'round',
  buttonIcon: 'bug',
  buttonIconSize: 24,
  buttonIconStroke: 2,
  theme: 'auto',
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
  enableHoverScaleEffect: true,
  tooltipEnabled: true,
  tooltipText: 'Found a bug?',
};

export function WidgetLauncherButtonSettings() {
  return <WidgetLauncherButtonSettingsSection />;
}

function WidgetLauncherButtonSettingsSection() {
  const queryClient = useQueryClient();
  // Track local edits separately - null means use settings values
  const [localEdits, setLocalEdits] = useState<GlobalWidgetLauncherButtonSettings | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  // Use local edits if user has made changes, otherwise use settings directly
  const displayData = localEdits ?? settings?.widgetLauncherButton ?? DEFAULT_BUTTON_SETTINGS;

  const handleFormChange = (value: WidgetLauncherButtonSettings) => {
    const current = localEdits ?? settings?.widgetLauncherButton ?? DEFAULT_BUTTON_SETTINGS;
    const updated = { ...current };
    if (value.position !== undefined) updated.position = value.position;
    if (value.buttonText !== undefined) updated.buttonText = value.buttonText;
    if (value.buttonShape !== undefined) updated.buttonShape = value.buttonShape;
    if (value.buttonIcon !== undefined) updated.buttonIcon = value.buttonIcon;
    if (value.buttonIconSize !== undefined) updated.buttonIconSize = value.buttonIconSize;
    if (value.buttonIconStroke !== undefined) updated.buttonIconStroke = value.buttonIconStroke;
    if (value.theme !== undefined) updated.theme = value.theme;
    if (value.lightButtonColor !== undefined) updated.lightButtonColor = value.lightButtonColor;
    if (value.lightTextColor !== undefined) updated.lightTextColor = value.lightTextColor;
    if (value.lightButtonHoverColor !== undefined)
      updated.lightButtonHoverColor = value.lightButtonHoverColor;
    if (value.lightTextHoverColor !== undefined)
      updated.lightTextHoverColor = value.lightTextHoverColor;
    if (value.darkButtonColor !== undefined) updated.darkButtonColor = value.darkButtonColor;
    if (value.darkTextColor !== undefined) updated.darkTextColor = value.darkTextColor;
    if (value.darkButtonHoverColor !== undefined)
      updated.darkButtonHoverColor = value.darkButtonHoverColor;
    if (value.darkTextHoverColor !== undefined)
      updated.darkTextHoverColor = value.darkTextHoverColor;
    if (value.enableHoverScaleEffect !== undefined)
      updated.enableHoverScaleEffect = value.enableHoverScaleEffect;
    if (value.tooltipEnabled !== undefined) updated.tooltipEnabled = value.tooltipEnabled;
    if (value.tooltipText !== undefined) updated.tooltipText = value.tooltipText;
    setLocalEdits(updated);
  };

  const mutation = useMutation({
    mutationFn: async (data: Partial<AppSettings>) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setLocalEdits(null); // Clear local edits after save
      toast.success('Widget launcher button settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      widgetLauncherButton: displayData,
    });
  };

  const handleReset = () => {
    setLocalEdits(DEFAULT_BUTTON_SETTINGS);
    mutation.mutate({
      widgetLauncherButton: DEFAULT_BUTTON_SETTINGS,
    });
  };

  // Wait for settings to fully load before rendering the form
  if (isLoading || !settings?.widgetLauncherButton) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget Button Settings</CardTitle>
        <CardDescription>
          Configure the appearance and behavior of the floating widget launcher button.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <WidgetLauncherButtonSettingsForm value={displayData} onChange={handleFormChange} />

          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={mutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Default
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
