import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useOptionalAuth } from '../contexts/AuthContext';
import type { UserPreferences } from '@shared/types';

interface PreferencesResponse {
  success: boolean;
  preferences: UserPreferences;
}

const CACHE_PREFIX = 'bugpin.preference.';

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota); the database copy still applies.
  }
}

function parseJson<T>(raw: string | null): T | undefined {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/**
 * Preferences of the signed-in user. Changes apply to the cache at once and are saved in the
 * background. Outside a signed-in session they stay in memory only.
 */
export function useUserPreferences() {
  const auth = useOptionalAuth();
  const userId = auth?.user?.id;
  const canSave = auth?.canLoadData ?? false;
  const queryClient = useQueryClient();
  const queryKey = ['user-preferences', userId ?? null];

  const query = useQuery({
    queryKey,
    queryFn: async () =>
      (await api.get<PreferencesResponse>('/user-preferences/me')).data.preferences,
    enabled: canSave,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (changes: UserPreferences) =>
      (await api.patch<PreferencesResponse>('/user-preferences/me', changes)).data.preferences,
  });

  const updatePreferences = (changes: UserPreferences) => {
    // Written to the cache synchronously so the next render already shows the change.
    queryClient.setQueryData<UserPreferences>(queryKey, (current) => ({ ...current, ...changes }));
    if (canSave) mutation.mutate(changes);
  };

  return {
    preferences: query.data,
    isLoaded: query.isSuccess,
    updatePreferences,
  };
}

interface PreferenceOptions<T> {
  /** Keep a browser copy so the value is known before the preferences have loaded. */
  cache?: boolean;
  /** Former localStorage key; its value is moved into the preferences once, then removed. */
  legacyKey?: string;
  parseLegacy?: (raw: string) => T | undefined;
}

/**
 * One preference as [value, setValue], falling back to the browser copy, then to a value left
 * under a former localStorage key, then to the default.
 */
export function usePreference<
  K extends keyof UserPreferences,
  F extends NonNullable<UserPreferences[K]> | null,
>(
  key: K,
  fallback: F,
  options: PreferenceOptions<NonNullable<UserPreferences[K]>> = {}
): [NonNullable<UserPreferences[K]> | F, (value: Exclude<UserPreferences[K], undefined>) => void] {
  type Value = NonNullable<UserPreferences[K]>;
  const { preferences, isLoaded, updatePreferences } = useUserPreferences();
  const cacheKey = `${CACHE_PREFIX}${key}`;

  const initial = useRef<{ cached?: Value; legacy?: Value } | null>(null);
  if (initial.current === null) {
    const legacyRaw = options.legacyKey ? readLocal(options.legacyKey) : null;
    initial.current = {
      cached: options.cache ? parseJson<Value>(readLocal(cacheKey)) : undefined,
      legacy:
        legacyRaw !== null && options.parseLegacy ? options.parseLegacy(legacyRaw) : undefined,
    };
  }

  const stored = preferences?.[key] as Value | null | undefined;
  // A stored null means the user cleared the value, so it must not fall back to older copies.
  const value: Value | F =
    stored !== undefined
      ? (stored ?? fallback)
      : (initial.current.cached ?? initial.current.legacy ?? fallback);

  const legacy = initial.current.legacy;
  useEffect(() => {
    if (!isLoaded || !options.legacyKey) return;
    if (stored === undefined && legacy !== undefined) {
      updatePreferences({ [key]: legacy } as UserPreferences);
    }
    writeLocal(options.legacyKey, null);
  }, [isLoaded]);

  useEffect(() => {
    if (options.cache && stored !== undefined) {
      writeLocal(cacheKey, stored === null ? null : JSON.stringify(stored));
    }
  }, [options.cache, cacheKey, stored]);

  const setValue = (next: Exclude<UserPreferences[K], undefined>) =>
    updatePreferences({ [key]: next } as UserPreferences);

  return [value, setValue];
}
