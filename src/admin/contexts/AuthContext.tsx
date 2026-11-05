import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { signInWithPasskey, verifyPasskeySecondFactor } from '../lib/passkeys';
import type { User } from '@shared/types';

export interface TwoFactorMethods {
  totp: boolean;
  passkey: boolean;
  recoveryCode: boolean;
}

export type LoginStep =
  | { status: 'signed-in' }
  | { status: 'two-factor'; challengeToken: string; methods: TwoFactorMethods };

export type SecondFactorInput = { code: string } | { recoveryCode: string };

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  /** False while the user has no session or must finish a required setup step first */
  canLoadData: boolean;
  login: (email: string, password: string) => Promise<LoginStep>;
  completeTwoFactor: (challengeToken: string, input: SecondFactorInput) => Promise<void>;
  loginWithPasskey: () => Promise<void>;
  completeTwoFactorWithPasskey: (challengeToken: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// The server refuses data requests until these setup steps are done
function hasPendingSetup(user: User | null): boolean {
  return !!user?.mustChangePassword || !!user?.twoFactorSetupRequired;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Queries are paused by default while a setup step is pending, before the user state
  // reaches any component.
  const setUser = useCallback(
    (nextUser: User | null) => {
      const defaults = queryClient.getDefaultOptions();
      queryClient.setDefaultOptions({
        ...defaults,
        queries: { ...defaults.queries, enabled: !hasPendingSetup(nextUser) },
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
    async (email: string, password: string): Promise<LoginStep> => {
      const response = await api.post('/auth/login', { email, password });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Login failed');
      }

      if (response.data.twoFactorRequired) {
        return {
          status: 'two-factor',
          challengeToken: response.data.challengeToken,
          methods: response.data.methods,
        };
      }

      setUser(response.data.user);
      return { status: 'signed-in' };
    },
    [setUser]
  );

  const completeTwoFactor = useCallback(
    async (challengeToken: string, input: SecondFactorInput) => {
      const response = await api.post('/auth/login/two-factor', { challengeToken, ...input });
      setUser(response.data.user);
    },
    [setUser]
  );

  const loginWithPasskey = useCallback(async () => {
    setUser(await signInWithPasskey());
  }, [setUser]);

  const completeTwoFactorWithPasskey = useCallback(
    async (challengeToken: string) => {
      setUser(await verifyPasskeySecondFactor(challengeToken));
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

  const canLoadData = !!user && !hasPendingSetup(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        canLoadData,
        login,
        completeTwoFactor,
        loginWithPasskey,
        completeTwoFactorWithPasskey,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Returns undefined outside an AuthProvider instead of throwing, for components also used there */
export function useOptionalAuth(): AuthContextType | undefined {
  return useContext(AuthContext);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
