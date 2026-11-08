import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '../api/client';
import { apiErrorMessage } from '../lib/apiError';
import { sameValue } from '../lib/changedFields';
import type { AppSettings } from '@shared/types';

const settingsKeys = {
  all: ['settings'] as const,
};

// Saved whole by the server, so a save always sends the complete object.
type WholeSettingsKeys = 'passwordPolicy' | 'language';

/** PUT /settings body: the server merges nested objects, so nested fields may be partial. */
export type SettingsUpdate = {
  [K in keyof AppSettings]?: K extends WholeSettingsKeys
    ? AppSettings[K]
    : NonNullable<AppSettings[K]> extends readonly unknown[]
      ? AppSettings[K]
      : NonNullable<AppSettings[K]> extends object
        ? Partial<NonNullable<AppSettings[K]>>
        : AppSettings[K];
};

export function useSettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: async () => (await api.get('/settings')).data.settings as AppSettings,
    enabled: options.enabled,
  });
}

interface UpdateSettingsOptions {
  /** Toast shown after a successful save. Pass null to stay silent. */
  successMessage?: string | null;
  errorMessage?: string;
}

/**
 * Saves a partial settings update. The server merges nested objects, so callers send only the
 * keys and nested fields they changed.
 */
export function useUpdateSettings({
  successMessage = 'Settings saved',
  errorMessage = 'Failed to save settings',
}: UpdateSettingsOptions = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: SettingsUpdate) =>
      (await api.put('/settings', changes)).data.settings as AppSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(settingsKeys.all, settings);
      queryClient.invalidateQueries({ queryKey: ['password-policy'] });
      if (successMessage) toast.success(successMessage);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, errorMessage));
    },
  });
}

/**
 * Holds only the unsaved edits of a form on top of the saved values. A refetch of the saved
 * values never overwrites what the user is changing, and `changes` lists only the fields that
 * differ from the saved values, so a save sends nothing the user did not touch.
 */
export function useDraft<T extends object>(saved: T | undefined) {
  const [edits, setEdits] = useState<Partial<T>>({});

  const changes: Partial<T> = {};
  if (saved) {
    for (const key of Object.keys(edits) as (keyof T)[]) {
      if (!sameValue(edits[key], saved[key])) changes[key] = edits[key];
    }
  }

  return {
    value: saved ? ({ ...saved, ...edits } as T) : undefined,
    changes,
    isDirty: Object.keys(changes).length > 0,
    set: <K extends keyof T>(key: K, value: T[K]) =>
      setEdits((current) => ({ ...current, [key]: value })),
    patch: (partial: Partial<T>) => setEdits((current) => ({ ...current, ...partial })),
    reset: () => setEdits({}),
  };
}
