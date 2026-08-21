// ==========================================================
// DILIGÊNCIA 360 — Tela de Gestão de Usuários (Administração)
// ==========================================================

import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../../auth/types';
import { UserService } from '../services/user.service';
import { CreateUserModal } from './CreateUserModal';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';

export const UserManagementView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const roleLabelMap: Record<UserRole, { label: string; variant: 'primary' | 'info' | 'medium' | 'neutral' }> = {
    admin: { label: 'Administrador', variant: 'primary' },
    analyst: { label: 'Analista', variant: 'info' },
    reviewer: { label: 'Revisor', variant: 'medium' },
    viewer: { label: 'Consulta', variant: 'neutral' },
  };

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await UserService.listUsers();
      setUsers(items);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleActive = async (user: User) => {
    const nextState = !user.active;
    const confirmMsg = nextState
      ? `Reativar o acesso de ${user.name}?`
      : `Desativar o acesso de ${user.name}? O histórico antigo será preservado.`;

    if (!window.confirm(confirmMsg)) return;

    setActionLoadingId(user.id);
    try {
      await UserService.toggleActive(user.id, nextState);
      await loadUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao alterar status.';
      alert(msg);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
            Gestão de Usuários & Perfis (RBAC)
          </h1>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
            Controle de acesso, papéis funcionais e auditoria do Complexo de Suape
          </p>
        </div>

        <Button variant="primary" size="sm" icon={<Icons.Plus size={14} />} onClick={() => setIsCreateModalOpen(true)}>
          Novo Usuário
        </Button>
      </div>

      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xs)',
        }}
      >
        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            Carregando usuários cadastrados...
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            Nenhum usuário cadastrado.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-default)' }}>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)' }}>Usuário</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)' }}>Perfil</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)' }}>Último Acesso</th>
                <th style={{ padding: '0.75rem 1rem', fontWeight: 'var(--font-semibold)', color: 'var(--text-secondary)', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const roleConfig = roleLabelMap[u.role] || { label: u.role, variant: 'neutral' };
                return (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      opacity: u.active ? 1 : 0.6,
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>{u.name}</span>
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-2xs)' }}>{u.email}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={roleConfig.variant}>{roleConfig.label}</Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <Badge variant={u.active ? 'success' : 'neutral'}>
                        {u.active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-tertiary)' }}>
                      {u.lastLoginAt ? Formatters.dateTime(u.lastLoginAt) : 'Nunca acessou'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={actionLoadingId === u.id}
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.active ? 'Desativar' : 'Reativar'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadUsers}
      />
    </div>
  );
};
