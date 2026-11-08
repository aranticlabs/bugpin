import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';
import { brandingApi, type BrandingConfig } from '../../api/branding';
import { useDraft } from '../../hooks/useSettings';
import { apiErrorMessage } from '../../lib/apiError';
import { ThemeColorPicker } from '../ThemeColorPicker';
import { UnsavedChangesGuard } from '../UnsavedChangesGuard';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { SettingsCard } from '../ui/settings-card';
import { Spinner } from '../ui/spinner';
import type { ThemeColors } from '@shared/types';

// Neutral gray theme - matching globals.css --primary colors
const DEFAULT_ADMIN_COLORS: ThemeColors = {
  lightButtonColor: '#02658D',
  lightTextColor: '#ffffff',
  lightButtonHoverColor: '#024F6F',
  lightTextHoverColor: '#ffffff',
  darkButtonColor: '#02658D',
  darkTextColor: '#ffffff',
  darkButtonHoverColor: '#036F9B',
  darkTextHoverColor: '#ffffff',
};

export function BrandColorSection() {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['branding-config'],
    queryFn: brandingApi.getConfig,
  });
  const draft = useDraft<ThemeColors>(config?.adminThemeColors);
  const displayColors = draft.value ?? DEFAULT_ADMIN_COLORS;

  const mutation = useMutation({
    mutationFn: brandingApi.updateAdminThemeColors,
    onSuccess: (_data, changes) => {
      queryClient.setQueryData<BrandingConfig>(['branding-config'], (current) =>
        current
          ? { ...current, adminThemeColors: { ...current.adminThemeColors, ...changes } }
          : current
      );
      queryClient.invalidateQueries({ queryKey: ['branding-config'] });
      draft.reset();
      toast.success('Brand colors updated');
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, 'Failed to update brand colors'));
    },
  });

  if (isLoading || !config?.adminThemeColors) {
    return (
      <Card>
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <SettingsCard
      title="Brand Colors"
      description="Configure the primary colors for buttons and interactive elements in the Admin Console."
    >
      <UnsavedChangesGuard
        isDirty={draft.isDirty}
        onSave={() => mutation.mutateAsync(draft.changes)}
        onDiscard={draft.reset}
      />
      <div className="space-y-4">
        <ThemeColorPicker
          value={displayColors}
          onChange={draft.patch}
          disabled={mutation.isPending}
        />

        <div className="flex gap-2 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => draft.patch(DEFAULT_ADMIN_COLORS)}
            disabled={mutation.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}
