// ==========================================================
// DILIGÊNCIA 360 — Serviço de Autenticação Firebase & Perfil Local
// ==========================================================

import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { request } from '../../../lib/api';
import { User, LoginCredentials } from '../types';

export const AuthService = {
  async login(credentials: LoginCredentials): Promise<User> {
    // 1. Autenticação de identidade no Firebase
    await signInWithEmailAndPassword(auth, credentials.email, credentials.password);

    // 2. Consulta autorização institucional no PostgreSQL via /api/auth/me
    const profile = await this.getMe();
    if (!profile) {
      await signOut(auth);
      throw new Error('Seu usuário não possui autorização para acessar o Diligência 360.');
    }
    return profile;
  },

  async logout(): Promise<void> {
    try {
      await signOut(auth);
    } catch {
      // Ignora erro ao deslogar
    }
  },

  async sendPasswordReset(email: string): Promise<void> {
    if (!email || !email.trim()) {
      throw new Error('Informe o e-mail cadastrado para redefinição de senha.');
    }
    await sendPasswordResetEmail(auth, email.trim());
  },

  async getMe(): Promise<User | null> {
    try {
      const res = await request<{ ok: boolean; user: User }>('/api/auth/me');
      return res.ok && res.user ? res.user : null;
    } catch {
      return null;
    }
  },
};
