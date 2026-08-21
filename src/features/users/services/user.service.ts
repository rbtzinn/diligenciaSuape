// ==========================================================
// DILIGÊNCIA 360 — Serviço de Gestão de Usuários Frontend
// ==========================================================

import { request } from '../../../lib/api';
import { User, UserRole } from '../../auth/types';

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

export const UserService = {
  async listUsers(): Promise<User[]> {
    const res = await request<{ ok: boolean; items: User[] }>('/api/users');
    return res.ok && Array.isArray(res.items) ? res.items : [];
  },

  async createUser(data: CreateUserData): Promise<User> {
    const res = await request<{ ok: boolean; user: User }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.user;
  },

  async toggleActive(userId: string, active: boolean): Promise<User> {
    const res = await request<{ ok: boolean; user: User }>(`/api/users/${userId}/toggle-active`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    return res.user;
  },
};
