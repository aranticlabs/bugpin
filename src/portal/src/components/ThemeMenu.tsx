import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme, type Theme } from '@shared-ui/theme/ThemeProvider';
import { Button } from '@shared-ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@shared-ui/components/ui/dropdown-menu';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/catalog';

const themes: { value: Theme; label: MessageKey; icon: LucideIcon }[] = [
  { value: 'light', label: 'themeLight', icon: Sun },
  { value: 'dark', label: 'themeDark', icon: Moon },
  { value: 'system', label: 'themeSystem', icon: Monitor },
];

/** The Light, Dark and System choices, for a dropdown menu or submenu */
export function ThemeRadioGroup({ icons = false }: { icons?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  return (
    <DropdownMenuRadioGroup
      value={theme}
      onValueChange={(value) => {
        const next = themes.find((option) => option.value === value);
        if (next) setTheme(next.value);
      }}
    >
      {themes.map(({ value, label, icon: Icon }) => (
        <DropdownMenuRadioItem key={value} value={value} className="gap-2">
          {icons && <Icon className="size-4 shrink-0" aria-hidden />}
          {t(label)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function ThemeMenu() {
  const { resolvedTheme } = useTheme();
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('appearance')}>
          {resolvedTheme === 'dark' ? <Moon /> : <Sun />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeRadioGroup icons />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
