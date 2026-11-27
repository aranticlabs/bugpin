import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/client';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Spinner } from '../../components/ui/spinner';
import { SUPPORTED_LOCALES } from '@shared/types';
import type { AppSettings, LocaleCode, ProjectLanguageSettings } from '@shared/types';

const LOCALE_DISPLAY_LABELS: Record<LocaleCode, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  nl: 'Nederlands',
  es: 'Español',
  it: 'Italiano',
  ja: '日本語 (JP)',
  'pt-BR': 'Português (BR)',
  zh: '中文 (简体) (CN)',
};

export function Language() {
  const {
    data: settings,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.settings as AppSettings;
    },
  });

  if (isLoading) {
    return (
      <Card className="max-w-4xl">
        <CardContent className="py-12">
          <Spinner className="mx-auto text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Never mount the form with fallback values: its state is initialized once, so a later
  // successful load would not reach it and saving would overwrite the stored language.
  if (!settings) {
    return (
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Widget Language</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Language settings could not be loaded. No changes can be saved until the current
              settings are available.
            </AlertDescription>
          </Alert>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Retrying...
              </>
            ) : (
              'Retry'
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <LanguageForm initialLanguage={settings.language} />;
}

// Mounted only once settings are loaded: the Radix Select must receive the stored value on
// its first render. Changing its value programmatically after mount (e.g. syncing state in a
// useEffect) makes its hidden native <select> emit onValueChange('') and clears the selection.
function LanguageForm({ initialLanguage }: { initialLanguage: ProjectLanguageSettings }) {
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<ProjectLanguageSettings>(initialLanguage);

  const mutation = useMutation({
    mutationFn: async (data: Partial<AppSettings>) => {
      const response = await api.put('/settings', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Language settings saved successfully');
    },
    onError: (err: Error & { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ language });
  };

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Widget Language</CardTitle>
        <CardDescription>
          Default language behavior for all projects. Individual projects can override these
          settings.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Language Mode</Label>
              <p className="text-sm text-muted-foreground">
                Auto detects each visitor's language from the page or browser; manual locks the
                widget and reporter emails to one language for every report.
              </p>
            </div>
            <div role="radiogroup" aria-label="Language mode" className="flex gap-2">
              <Button
                type="button"
                variant={language.mode === 'auto' ? 'default' : 'outline'}
                role="radio"
                aria-checked={language.mode === 'auto'}
                onClick={() => setLanguage({ ...language, mode: 'auto' })}
                disabled={mutation.isPending}
              >
                Auto-detect
              </Button>
              <Button
                type="button"
                variant={language.mode === 'manual' ? 'default' : 'outline'}
                role="radio"
                aria-checked={language.mode === 'manual'}
                onClick={() => setLanguage({ ...language, mode: 'manual' })}
                disabled={mutation.isPending}
              >
                Manual (locked)
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-language" className="text-sm font-medium">
              Default Language
            </Label>
            <p className="text-sm text-muted-foreground">
              In auto mode this is the fallback when detection finds no supported match. In manual
              mode this is the locked language used for every report.
            </p>
            <Select
              value={language.defaultLanguage}
              onValueChange={(val) =>
                setLanguage({ ...language, defaultLanguage: val as LocaleCode })
              }
              disabled={mutation.isPending}
            >
              <SelectTrigger id="default-language" className="h-11 max-w-xl">
                <SelectValue placeholder="Select default language" />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LOCALES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {LOCALE_DISPLAY_LABELS[code]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
        </CardContent>
      </form>
    </Card>
  );
}
