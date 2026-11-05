import { useEffect, useRef } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useUserPreferences } from '../hooks/useUserPreferences';

/**
 * Keeps the theme in the user's preferences. The theme provider sits outside the signed-in
 * area and keeps a browser copy, so the first paint already uses the last known theme.
 */
export function ThemePreferenceSync() {
  const { theme, setTheme } = useTheme();
  const { preferences, isLoaded, updatePreferences } = useUserPreferences();
  const storedTheme = preferences?.theme;
  const applied = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!applied.current) {
      applied.current = true;
      // The stored theme wins on load; without one, the browser's theme is saved once.
      if (storedTheme === undefined) updatePreferences({ theme });
      else if (storedTheme !== theme) setTheme(storedTheme);
      return;
    }
    if (storedTheme !== theme) updatePreferences({ theme });
  }, [isLoaded, theme, storedTheme, setTheme, updatePreferences]);

  return null;
}
