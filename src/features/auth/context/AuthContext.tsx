// ==========================================================
// DILIGÊNCIA 360 — Contexto de autenticação com Firebase
// ==========================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { User, LoginCredentials } from '../types';
import { AuthService } from '../services/auth.service';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshUser = useCallback(async () => {
    try {
      if (!auth.currentUser) {
        setUser(null);
        return;
      }
      const profile = await AuthService.getMe();
      if (profile && profile.active !== false) {
        setUser(profile);
        setAuthError(null);
      } else {
        setUser(null);
        await AuthService.logout();
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        await refreshUser();
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [refreshUser]);

  const login = async (credentials: LoginCredentials) => {
    setAuthError(null);
    const loggedUser = await AuthService.login(credentials);
    setUser(loggedUser);
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
    setAuthError(null);
  };

  const sendPasswordReset = async (email: string) => {
    await AuthService.sendPasswordReset(email);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        authError,
        login,
        logout,
        sendPasswordReset,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider.');
  }
  return context;
}
