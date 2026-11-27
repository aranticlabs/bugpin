import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { readDismissal, writeDismissal } from '../lib/noticeStorage';
import { useSnooze } from './useSnooze';

const STALE_TIME_MS = 60 * 60 * 1000;
const APP_URL_DISMISS_KEY = 'bugpin.addressWarning.appUrl.dismissedId';
const PROXY_DISMISS_KEY = 'bugpin.addressWarning.proxy.dismissedId';
const APP_URL_SNOOZE_KEY = 'bugpin.addressWarning.appUrl.snoozedUntil';
const PROXY_SNOOZE_KEY = 'bugpin.addressWarning.proxy.snoozedUntil';

interface AddressCheckResponse {
  success: boolean;
  appUrl: string;
  requestOrigin: string | null;
  requiredTrustProxy: 'auto' | 'true' | null;
}

export interface AppUrlMismatch {
  configuredOrigin: string;
  browserOrigin: string;
}

export interface ProxyMismatch {
  requestOrigin: string | null;
  browserOrigin: string;
  requiredTrustProxy: 'auto' | 'true' | null;
}

function toOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function useAddressCheck() {
  const { user, canLoadData } = useAuth();
  const isAdmin = user?.role === 'admin';

  // The key sits under ['settings'] so saving the settings refreshes the check.
  const query = useQuery({
    queryKey: ['settings', 'address-check'],
    queryFn: async () => {
      const response = await api.get('/settings/address-check');
      return response.data as AddressCheckResponse;
    },
    enabled: isAdmin && canLoadData,
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const [dismissedAppUrlId, setDismissedAppUrlId] = useState<string | null>(() =>
    readDismissal(APP_URL_DISMISS_KEY)
  );
  const [dismissedProxyId, setDismissedProxyId] = useState<string | null>(() =>
    readDismissal(PROXY_DISMISS_KEY)
  );

  const { isSnoozed: isAppUrlSnoozed, snooze: snoozeAppUrlMismatch } =
    useSnooze(APP_URL_SNOOZE_KEY);
  const { isSnoozed: isProxySnoozed, snooze: snoozeProxyMismatch } = useSnooze(PROXY_SNOOZE_KEY);

  const browserOrigin = window.location.origin;
  const configuredOrigin = query.data?.appUrl ? toOrigin(query.data.appUrl) : null;

  const appUrlMismatch: AppUrlMismatch | null =
    configuredOrigin !== null && configuredOrigin !== browserOrigin
      ? { configuredOrigin, browserOrigin }
      : null;
  const proxyMismatch: ProxyMismatch | null =
    query.data && query.data.requestOrigin !== browserOrigin
      ? {
          requestOrigin: query.data.requestOrigin,
          browserOrigin,
          requiredTrustProxy: query.data.requiredTrustProxy,
        }
      : null;

  // A dismissal only covers the exact situation it was made for.
  const appUrlId = appUrlMismatch
    ? `${appUrlMismatch.configuredOrigin}|${appUrlMismatch.browserOrigin}`
    : null;
  const proxyId = proxyMismatch
    ? `${proxyMismatch.requestOrigin}|${proxyMismatch.browserOrigin}|${proxyMismatch.requiredTrustProxy}`
    : null;

  const dismissAppUrlMismatch = () => {
    if (!appUrlId) return;
    writeDismissal(APP_URL_DISMISS_KEY, appUrlId);
    setDismissedAppUrlId(appUrlId);
  };

  const dismissProxyMismatch = () => {
    if (!proxyId) return;
    writeDismissal(PROXY_DISMISS_KEY, proxyId);
    setDismissedProxyId(proxyId);
  };

  return {
    appUrlMismatch:
      appUrlId !== null && appUrlId !== dismissedAppUrlId && !isAppUrlSnoozed
        ? appUrlMismatch
        : null,
    proxyMismatch:
      proxyId !== null && proxyId !== dismissedProxyId && !isProxySnoozed ? proxyMismatch : null,
    dismissAppUrlMismatch,
    dismissProxyMismatch,
    snoozeAppUrlMismatch,
    snoozeProxyMismatch,
  };
}
