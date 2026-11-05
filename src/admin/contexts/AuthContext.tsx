import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { User } from '@shared/types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  /** False while the user has no session or must change their password first */
  canLoadData: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The server refuses data requests until a required password change is done, so
  // queries are paused by default before the user state reaches any component.
  const setUser = useCallback(
    (nextUser: User | null) => {
      const defaults = queryClient.getDefaultOptions();
      queryClient.setDefaultOptions({
        ...defaults,
        queries: { ...defaults.queries, enabled: !nextUser?.mustChangePassword },
      });
      setUserState(nextUser);
    },
    [queryClient]
  );

  // Fetch current user on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.get('/auth/me');
        if (response.data.success && response.data.authenticated) {
          setUser(response.data.user);
        } else {
          setUser(null);
        }
      } catch {
        // Network error
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [setUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await api.post('/auth/login', { email, password });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Login failed');
      }

      setUser(response.data.user);
    },
    [setUser]
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore errors during logout
    }
    setUser(null);
  }, [setUser]);

  const refreshUser = useCallback(async () => {
    try {
      const response = await api.get('/auth/me');
      if (response.data.success && response.data.authenticated) {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, [setUser]);

  const canLoadData = !!user && !user.mustChangePassword;

  return (
    <AuthContext.Provider value={{ user, isLoading, canLoadData, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
