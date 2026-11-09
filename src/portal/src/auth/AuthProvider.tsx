import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PortalMe } from '@shared/portal-types';
import { portalApi } from '../api/reports';
import { PortalApiError, portalFetch } from '../api/client';
import { isPrivatePortalQuery } from '../api/private-query';

const AuthContext = createContext<{
  reporter: PortalMe | null;
  loading: boolean;
  error: boolean;
  expired: boolean;
  refresh: () => void;
  reconcileSession: () => Promise<void>;
  signIn: (reporter: PortalMe) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (
    changes: Partial<Pick<PortalMe, 'displayName' | 'locale' | 'emailUpdates'>>
  ) => Promise<void>;
} | null>(null);

async function loadReporter(signal?: AbortSignal): Promise<PortalMe | null> {
  try {
    return (await portalFetch<{ reporter: PortalMe }>('/me', { signal })).reporter;
  } catch (error) {
    if (error instanceof PortalApiError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const sessionGeneration = useRef(0);
  const [expired, setExpired] = useState(false);
  const [reporter, setReporter] = useState<PortalMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  function clearPrivateData() {
    client.removeQueries({ predicate: isPrivatePortalQuery });
    client.getMutationCache().clear();
  }
  useEffect(() => {
    const abort = new AbortController();
    const generation = sessionGeneration.current;
    setLoading(true);
    setFailed(false);
    void loadReporter(abort.signal)
      .then((reporter) => {
        if (!abort.signal.aborted && generation === sessionGeneration.current)
          setReporter(reporter);
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        if (generation === sessionGeneration.current) setFailed(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [attempt]);

  useEffect(() => {
    const expire = () => {
      sessionGeneration.current++;
      void client.cancelQueries({ predicate: isPrivatePortalQuery });
      clearPrivateData();
      setReporter(null);
      setExpired(true);
    };
    window.addEventListener('bugpin:portal-session-expired', expire);
    return () => window.removeEventListener('bugpin:portal-session-expired', expire);
  }, [client]);

  async function replaceSession(reporter: PortalMe | null) {
    const generation = ++sessionGeneration.current;
    await client.cancelQueries({ predicate: isPrivatePortalQuery });
    if (generation !== sessionGeneration.current) return;
    clearPrivateData();
    setReporter(reporter);
    setExpired(false);
  }

  async function reconcileSession() {
    const generation = ++sessionGeneration.current;
    await client.cancelQueries({ predicate: isPrivatePortalQuery });
    if (generation !== sessionGeneration.current) return;
    clearPrivateData();
    try {
      const reporter = await loadReporter();
      if (generation === sessionGeneration.current) setReporter(reporter);
    } catch {
      if (generation === sessionGeneration.current) setReporter(null);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        reporter,
        loading,
        error: failed,
        expired,
        refresh: () => setAttempt((value) => value + 1),
        reconcileSession,
        signIn: replaceSession,
        updateProfile: async (changes) => {
          const generation = sessionGeneration.current;
          const updated = await portalApi.profile(changes);
          if (generation === sessionGeneration.current) setReporter(updated);
        },
        signOut: async () => {
          try {
            await portalFetch('/auth/logout', { method: 'POST' });
          } catch (error) {
            if (!(error instanceof PortalApiError && error.status === 401)) throw error;
          }
          await replaceSession(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
