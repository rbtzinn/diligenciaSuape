// ==========================================================
// DILIGÊNCIA 360 — Modal de Cadastro de Novo Usuário
// ==========================================================

import React, { useState } from 'react';
import { UserRole } from '../../auth/types';
import { UserService, CreateUserData } from '../services/user.service';
import { Button } from '../../../components/ui/Button';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateUserModal: React.FC<CreateUserModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('analyst');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Todos os campos são obrigatórios.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const payload: CreateUserData = { name, email, password, role };
      await UserService.createUser(payload);
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao cadastrar usuário.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-backdrop animate-fade-in" style={{ zIndex: 1100 }}>
      <div className="modal-content animate-fade-in-up" style={{ maxWidth: '460px' }}>
        <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
          Cadastrar Novo Usuário
        </h2>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
          Defina o perfil de acesso e credenciais de acesso corporativo.
        </p>

        {error && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.625rem 0.875rem',
              backgroundColor: 'var(--status-critical-bg)',
              color: 'var(--status-critical-text)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>Nome Completo</label>
            <input
              type="text"
              className="input-control"
              placeholder="Ex: Carlos Alberto da Silva"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>E-mail Corporativo</label>
            <input
              type="email"
              className="input-control"
              placeholder="nome@suape.pe.gov.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>Senha Inicial</label>
            <input
              type="password"
              className="input-control"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}>Perfil de Acesso (RBAC)</label>
            <select
              className="input-control"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              <option value="analyst">Analista (Executa, trata pendências e envia para revisão)</option>
              <option value="reviewer">Revisor (Avalia, devolve com justificativa ou conclui)</option>
              <option value="viewer">Consulta (Somente leitura e histórico)</option>
              <option value="admin">Administrador (Gestão de usuários e permissão total)</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={isLoading}>
              Salvar Usuário
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
