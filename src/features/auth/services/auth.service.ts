// ==========================================================
// DILIGÊNCIA 360 — Serviço de autenticação Firebase
// ==========================================================

import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { User, LoginCredentials } from '../types';

export const AuthService = {
  async login(credentials: LoginCredentials): Promise<User> {
    // 1. Autenticação de identidade no Firebase
    await signInWithEmailAndPassword(auth, credentials.email, credentials.password);

    // 2. Toda identidade cadastrada no Firebase recebe acesso completo.
    const profile = await this.getMe();
    if (!profile) {
      await signOut(auth);
      throw new Error('Erro ao obter perfil do usuário.');
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
    const fbUser = auth.currentUser;
    if (!fbUser) return null;

    // Retorna usuário direto do Firebase com permissões totais
    return {
      id: fbUser.uid,
      firebaseUid: fbUser.uid,
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Usuário',
      email: fbUser.email || '',
      role: 'authenticated',
      active: true,
    };
  },
};
