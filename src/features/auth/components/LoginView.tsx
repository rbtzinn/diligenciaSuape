// ==========================================================
// DILIGÊNCIA 360 — Tela de Autenticação Firebase Institucional
// ==========================================================

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Icons } from '../../../components/ui/Icons';

function mapFirebaseError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message || '';
    if (msg.includes('auth/invalid-credential') || msg.includes('auth/user-not-found') || msg.includes('auth/wrong-password')) {
      return 'E-mail ou senha inválidos. No primeiro acesso, confirme que sua conta foi criada no Firebase ou use “Esqueci minha senha”.';
    }
    if (msg.includes('auth/too-many-requests')) {
      return 'Muitas tentativas de acesso. Aguarde alguns minutos.';
    }
    if (msg.includes('auth/user-disabled')) {
      return 'Usuário desativado no sistema de autenticação.';
    }
    if (msg.includes('auth/invalid-email')) {
      return 'Formato de e-mail corporativo inválido.';
    }
    if (msg.includes('auth/network-request-failed')) {
      return 'Não foi possível conectar ao serviço de autenticação.';
    }
    if (msg.includes('autorização para acessar')) {
      return msg;
    }
    return err.message;
  }
  return 'Falha ao autenticar no sistema.';
}

export const LoginView: React.FC = () => {
  const { login, sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isResetMode, setIsResetMode] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailInputRef.current?.focus();
  }, [isResetMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Por favor, informe seu e-mail corporativo.');
      return;
    }

    if (isResetMode) {
      setIsLoading(true);
      setError(null);
      setInfoMessage(null);
      try {
        await sendPasswordReset(email.trim());
        setInfoMessage('Se o e-mail estiver cadastrado, as instruções de recuperação foram enviadas.');
        setIsResetMode(false);
      } catch (err) {
        setError(mapFirebaseError(err));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!password) {
      setError('Por favor, informe sua senha.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setInfoMessage(null);
    try {
      await login({ email: email.trim(), password });
    } catch (err: unknown) {
      setError(mapFirebaseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100dvh', width: '100%', display: 'grid', placeItems: 'center', backgroundColor: 'var(--bg-canvas)', padding: '1rem' }}>
      <div
        style={{
          width: 'min(100% - 24px, 420px)',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          padding: '2.25rem 2rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
        className="animate-fade-in-up"
      >
        <header style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--brand-blue-subtle)',
              color: 'var(--brand-blue)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--brand-blue-border)',
            }}
          >
            <Icons.Shield size={24} />
          </div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            Diligência 360
          </h1>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            <span>Compliance & Due Diligence</span><br />
            <span style={{ color: 'var(--text-tertiary)' }}>Complexo Portuário de Suape</span>
          </div>
        </header>

        {error && (
          <div role="alert" aria-live="polite" style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--status-critical-bg)', color: 'var(--status-critical-text)', border: '1px solid var(--status-critical-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icons.AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {infoMessage && (
          <div role="status" aria-live="polite" style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--status-low-bg)', color: 'var(--status-low-text)', border: '1px solid var(--status-low-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Icons.CheckCircle size={16} style={{ flexShrink: 0 }} />
            <span>{infoMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label htmlFor="login-email" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--text-secondary)' }}>
              E-mail corporativo
            </label>
            <input
              id="login-email"
              ref={emailInputRef}
              type="email"
              className="input-control"
              placeholder="nome@suape.pe.gov.br"
              autoComplete="username"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              disabled={isLoading}
              required
            />
          </div>

          {!isResetMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor="login-password" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--text-secondary)' }}>
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => { setIsResetMode(true); setError(null); setInfoMessage(null); }}
                  style={{ background: 'none', border: 'none', color: 'var(--brand-blue)', fontSize: 'var(--text-2xs)', cursor: 'pointer', padding: 0 }}
                >
                  Esqueci minha senha
                </button>
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="input-control"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  disabled={isLoading}
                  required={!isResetMode}
                  style={{ paddingRight: '2.5rem', width: '100%' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  style={{ position: 'absolute', right: '0.625rem', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0.25rem', display: 'inline-flex' }}
                >
                  {showPassword ? <Icons.EyeOff size={18} /> : <Icons.Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ width: '100%', marginTop: '0.25rem', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 'var(--font-semibold)' }}
          >
            {isLoading ? (
              <span>Processando...</span>
            ) : isResetMode ? (
              <span>Enviar link de recuperação</span>
            ) : (
              <span>Entrar no sistema</span>
            )}
          </button>

          {isResetMode && (
            <button
              type="button"
              onClick={() => { setIsResetMode(false); setError(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer', textAlign: 'center' }}
            >
              ← Voltar ao login
            </button>
          )}
        </form>

        <footer style={{ textAlign: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '0.85rem' }}>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
            Autenticação segura via Firebase • Gestão SUAPE
          </span>
        </footer>
      </div>
    </main>
  );
};
