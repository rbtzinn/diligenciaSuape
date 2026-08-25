// ==========================================================
// DILIGÊNCIA 360 — Tipos de identidade autenticada pelo Firebase
// ==========================================================

export type UserRole = 'authenticated';

export interface User {
  id: string;
  firebaseUid?: string;
  name: string;
  email: string;
  role: UserRole;
  active?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  ok: boolean;
  user: User;
  erro?: string;
}
