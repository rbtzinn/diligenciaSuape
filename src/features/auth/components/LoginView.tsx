// ==========================================================
// DILIGÊNCIA 360 — Tela de autenticação
// ==========================================================
// Era ~150 linhas de estilo em linha, com um `--radius-xl` que não
// existia nos tokens (o cartão ficava de canto reto) e um botão de
// altura fixa em 40px que não acompanhava a escala de toque. Agora
// usa os campos, o botão e os avisos do projeto.
// ==========================================================

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Icons } from '../../../components/ui/Icons';
import { TextField } from '../../../components/ui/Field';
import { Button } from '../../../components/ui/Button';
import { Note } from '../../../components/ui/Note';

function mapFirebaseError(err: unknown): string {
  if (!(err instanceof Error)) return 'Falha ao autenticar no sistema.';

  const msg = err.message || '';
  if (
    msg.includes('auth/invalid-credential') ||
    msg.includes('auth/user-not-found') ||
    msg.includes('auth/wrong-password')
  ) {
    return 'E-mail ou senha inválidos. No primeiro acesso, confirme que sua conta foi criada no Firebase ou use “Esqueci minha senha”.';
  }
  if (msg.includes('auth/too-many-requests')) return 'Muitas tentativas de acesso. Aguarde alguns minutos.';
  if (msg.includes('auth/user-disabled')) return 'Usuário desativado no sistema de autenticação.';
  if (msg.includes('auth/invalid-email')) return 'Formato de e-mail corporativo inválido.';
  if (msg.includes('auth/network-request-failed')) return 'Não foi possível conectar ao serviço de autenticação.';
  if (msg.includes('autorização para acessar')) return msg;
  return err.message;
}

export const LoginView: React.FC = () => {
  const { login, sendPasswordReset, loginDev } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isResetMode, setIsResetMode] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, [isResetMode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email.trim()) {
      setError('Por favor, informe seu e-mail corporativo.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setInfo(null);

    try {
      if (isResetMode) {
        await sendPasswordReset(email.trim());
        setInfo('Se o e-mail estiver cadastrado, as instruções de recuperação foram enviadas.');
        setIsResetMode(false);
        return;
      }

      if (!password) {
        setError('Por favor, informe sua senha.');
        return;
      }

      await login({ email: email.trim(), password });
    } catch (err: unknown) {
      setError(mapFirebaseError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="harbor-login">
      <aside className="harbor-login-story" aria-hidden="true">
        <div className="harbor-login-story-top"><span>SUAPE / COMPLIANCE</span><span>INTELIGÊNCIA DE INTEGRIDADE</span></div>
        <div className="harbor-login-orbit"><span /><span /><span /><i /></div>
        <div className="harbor-login-story-copy">
          <p>UMA VISÃO MAIS CLARA</p>
          <h2>Conexões revelam o contexto.</h2>
          <span>Pesquisa pública, vínculos e evidências em uma jornada de investigação.</span>
        </div>
      </aside>
      <section className="harbor-login-panel">
      <div className="harbor-login-card">
        <header className="flex flex-col items-start gap-1.5 text-left">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-lg border border-brand-line bg-brand-soft text-brand"
          >
            <Icons.Shield size={24} />
          </span>
          <p className="mt-5 text-2xs font-bold uppercase tracking-[0.16em] text-brand">Acesso ao ambiente</p>
          <h1 className="mt-1 text-3xl font-extrabold text-ink">Bem-vindo à Diligência 360.</h1>
          <p className="text-xs leading-snug text-ink-2">
            Entre para iniciar uma pesquisa ou retomar suas diligências.
          </p>
        </header>

        {error ? (
          <Note tone="high" role="alert" icon={<Icons.AlertCircle size={16} aria-hidden="true" />}>
            {error}
          </Note>
        ) : null}

        {info ? (
          <Note tone="ok" role="status" icon={<Icons.CheckCircle size={16} aria-hidden="true" />}>
            {info}
          </Note>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField
            ref={emailRef}
            id="login-email"
            label="E-mail corporativo"
            type="email"
            placeholder="nome@suape.pe.gov.br"
            autoComplete="username"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            disabled={isLoading}
            required
          />

          {!isResetMode ? (
            <TextField
              id="login-password"
              label="Senha"
              labelAction={
                <button
                  type="button"
                  onClick={() => {
                    setIsResetMode(true);
                    setError(null);
                    setInfo(null);
                  }}
                  className="text-2xs font-semibold text-brand hover:underline"
                >
                  Esqueci minha senha
                </button>
              }
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              disabled={isLoading}
              required
              trailing={
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  icon={showPassword ? <Icons.EyeOff size={17} /> : <Icons.Eye size={17} />}
                />
              }
            />
          ) : null}

          <Button type="submit" variant="primary" block isLoading={isLoading} loadingLabel="Processando…">
            {isResetMode ? 'Enviar link de recuperação' : 'Entrar no sistema'}
          </Button>

          {import.meta.env.DEV && !isResetMode && (
            <div className="mt-2 pt-3 border-t border-line flex flex-col gap-1.5">
              <Button
                type="button"
                variant="secondary"
                block
                onClick={() => loginDev('Roberto Gabriel (SUAPE Compliance)', 'roberto.gabriel@suape.pe.gov.br')}
                icon={<Icons.ShieldCheck size={16} className="text-ok" />}
              >
                Acesso Rápido Local (Analista SUAPE)
              </Button>
              <p className="text-center text-2xs text-ink-3">
                Modo local de desenvolvimento ativo · Conectado ao backend local
              </p>
            </div>
          )}

          {isResetMode ? (
            <Button
              variant="ghost"
              size="sm"
              block
              onClick={() => {
                setIsResetMode(false);
                setError(null);
              }}
            >
              ← Voltar ao login
            </Button>
          ) : null}
        </form>

        <footer className="border-t border-line-soft pt-3.5 text-center">
          <span className="text-2xs text-ink-muted">Autenticação segura via Firebase • Gestão SUAPE</span>
        </footer>
      </div>
      </section>
    </main>
  );
};
