import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PortalMe } from '@shared/portal-types';
import { PortalApiError, portalFetch } from '../api/client';

const AuthContext = createContext<{
  reporter: PortalMe | null;
  loading: boolean;
  error: boolean;
  expired: boolean;
  refresh: () => void;
  signIn: (reporter: PortalMe) => Promise<void>;
  signOut: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [expired, setExpired] = useState(false);
  const [reporter, setReporter] = useState<PortalMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setFailed(false);
    void portalFetch<{ reporter: PortalMe }>('/me', { signal: abort.signal })
      .then((result) => {
        if (!abort.signal.aborted) setReporter(result.reporter);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        if (error instanceof PortalApiError && error.status === 401) setReporter(null);
        else setFailed(true);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [attempt]);

  useEffect(() => {
    const expire = () => {
      void client.cancelQueries();
      client.clear();
      setReporter(null);
      setExpired(true);
    };
    window.addEventListener('bugpin:portal-session-expired', expire);
    return () => window.removeEventListener('bugpin:portal-session-expired', expire);
  }, [client]);

  async function replaceSession(reporter: PortalMe | null) {
    await client.cancelQueries();
    client.clear();
    setReporter(reporter);
    setExpired(false);
  }

  return (
    <AuthContext.Provider
      value={{
        reporter,
        loading,
        error: failed,
        expired,
        refresh: () => setAttempt((value) => value + 1),
        signIn: replaceSession,
        signOut: async () => {
          await portalFetch('/auth/logout', { method: 'POST' });
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
