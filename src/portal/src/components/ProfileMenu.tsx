import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, Globe, LogOut, Sun, User } from 'lucide-react';
import { Button } from '@shared-ui/components/ui/button';
import { Input } from '@shared-ui/components/ui/input';
import { Label } from '@shared-ui/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@shared-ui/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@shared-ui/components/ui/dropdown-menu';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/I18nProvider';
import { normalizeLocale } from '../i18n/catalog';
import { PersonAvatar } from './PersonAvatar';
import { ThemeRadioGroup } from './ThemeMenu';

export const languages = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  ja: '日本語',
  nl: 'Nederlands',
  zh: '中文',
};

export function ProfileMenu() {
  const auth = useAuth();
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [logoutFailed, setLogoutFailed] = useState(false);
  const logout = useMutation({ mutationFn: auth.signOut, onError: () => setLogoutFailed(true) });
  const update = useMutation({ mutationFn: auth.updateProfile, onSuccess: () => setOpen(false) });
  const accountName = auth.reporter?.displayName ?? auth.operator?.name;
  const accountEmail = auth.reporter?.email ?? auth.operator?.email;
  if (accountName === undefined) return null;
  const busy = update.isPending || logout.isPending;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim() && !busy) update.mutate({ displayName: name.trim() });
  }
  return (
    <div className="min-w-0 max-w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-10 max-w-full gap-2 px-2" disabled={busy}>
            <PersonAvatar name={accountName} className="h-7 w-7 [&>span]:text-[11px]" />
            <span className="sr-only sm:not-sr-only sm:max-w-40 sm:truncate">{accountName}</span>
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium">{accountName}</p>
            <p className="truncate text-xs text-muted-foreground">{accountEmail}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {auth.reporter && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  setName(auth.reporter?.displayName ?? '');
                  update.reset();
                  setOpen(true);
                }}
              >
                <User />
                {t('displayName')}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Globe />
                  {t('language')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={locale}
                    onValueChange={(value) => {
                      const next = normalizeLocale(value);
                      if (next) update.mutate({ locale: next });
                    }}
                  >
                    {Object.entries(languages).map(([value, label]) => (
                      <DropdownMenuRadioItem value={value} key={value}>
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuCheckboxItem
                checked={auth.reporter.emailUpdates}
                onCheckedChange={(emailUpdates) => update.mutate({ emailUpdates })}
              >
                {t('emailUpdates')}
              </DropdownMenuCheckboxItem>
            </>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Sun />
              {t('appearance')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <ThemeRadioGroup />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setLogoutFailed(false);
              logout.mutate();
            }}
          >
            <LogOut />
            {t('signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {((update.isError && !open) || logoutFailed) && (
        <p role="alert" className="max-w-64 text-sm text-destructive">
          {t('requestFailed')}
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!update.isPending) setOpen(value);
        }}
      >
        <DialogContent closeLabel={t('close')}>
          <DialogHeader>
            <DialogTitle>{t('displayName')}</DialogTitle>
            <DialogDescription>{t('displayNameHint')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <Label htmlFor="display-name">{t('displayName')}</Label>
            <Input
              id="display-name"
              autoComplete="name"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={update.isPending}
            />
            {update.isError && (
              <p role="alert" className="text-destructive">
                {t('requestFailed')}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={update.isPending}
                onClick={() => setOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button disabled={update.isPending || !name.trim()}>
                {t(update.isPending ? 'loading' : 'save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
