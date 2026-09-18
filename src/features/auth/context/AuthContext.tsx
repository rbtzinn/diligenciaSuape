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
  loginDev: (name?: string, email?: string) => void;
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
    if (import.meta.env.DEV) {
      const savedDev = localStorage.getItem('diligencia360_dev_user');
      if (savedDev) {
        try {
          setUser(JSON.parse(savedDev));
          setIsLoading(false);
          return;
        } catch {
          // Ignora JSON corrompido no storage local
          localStorage.removeItem('diligencia360_dev_user');
        }
      }
    }

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

  const loginDev = (name?: string, email?: string) => {
    const devUser: User = {
      id: 'dev-analyst-suape',
      firebaseUid: 'dev-analyst-suape',
      name: name || 'Roberto Gabriel (SUAPE Compliance)',
      email: email || 'roberto.gabriel@suape.pe.gov.br',
      role: 'authenticated',
      active: true,
    };
    setUser(devUser);
    localStorage.setItem('diligencia360_dev_user', JSON.stringify(devUser));
    setAuthError(null);
  };

  const login = async (credentials: LoginCredentials) => {
    setAuthError(null);
    const loggedUser = await AuthService.login(credentials);
    setUser(loggedUser);
  };

  const logout = async () => {
    localStorage.removeItem('diligencia360_dev_user');
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
        loginDev,
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
