// ==========================================================
// DILIGÊNCIA 360 — Casca de página
// ==========================================================
// Toda tela do app é a mesma estrutura: um contêiner que rola, uma
// faixa de cabeçalho que fica presa no topo e um corpo com largura
// de leitura limitada e calha lateral responsiva.
//
// Antes cada tela resolvia isso por conta própria — o dossiê com
// `max-w-[1200px] px-4`, o histórico com `.app-content`, o mapa com
// nada — e por isso o alinhamento nunca batia de uma aba para a
// outra. A largura e a calha agora são tokens (`--content-max`,
// `--gutter`): mudar lá realinha o app inteiro.
// ==========================================================

import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

type PageTone = 'canvas' | 'deep';

interface PageProps {
  /** `deep` pinta a página na superfície escura (mapa de vínculos). */
  tone?: PageTone;
  className?: string;
  children: React.ReactNode;
}

/**
 * Contêiner de rolagem da tela. É ele que rola — nunca o `body` —
 * para que o cabeçalho preso funcione e para que a barra horizontal
 * de uma tabela larga não vaze para a página.
 */
export const Page: React.FC<PageProps> = ({ tone = 'canvas', className, children }) => (
  <div
    className={cn(
      'flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto overflow-x-hidden',
      tone === 'deep' ? 'on-deep bg-deep text-on-deep' : 'bg-canvas text-ink',
      className,
    )}
  >
    {children}
  </div>
);

interface PageHeaderProps {
  /** Seta de voltar. Sem ela o cabeçalho não reserva a coluna. */
  onBack?: () => void;
  backLabel?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Ações à direita, a partir de `md`. */
  actions?: React.ReactNode;
  /**
   * Versão das ações para tela estreita — tipicamente os mesmos
   * comandos como botões só de ícone, que cabem na linha do título.
   * Sem isto, `actions` desce para uma fita que rola, e três botões
   * com rótulo em 390px ficam cortados no meio da palavra.
   */
  compactActions?: React.ReactNode;
  /** Fita de abas, colada na base do cabeçalho. */
  tabs?: React.ReactNode;
  tone?: PageTone;
  /**
   * Largura do miolo. `wide` para o mapa, `content` para telas de
   * tabela e `prose` para a ficha — nesta, cabeçalho e corpo precisam
   * da mesma medida, senão o título flutua sobre uma coluna de texto
   * com metade da largura dele.
   */
  width?: 'content' | 'wide' | 'sheet';
  sticky?: boolean;
  className?: string;
}

/**
 * Faixa superior da tela. Mantém título, ações e abas na mesma
 * linha de base em qualquer largura: o título encolhe com elipse, as
 * ações rolam lateralmente e as abas nunca quebram em duas fileiras
 * — era o que deixava o topo do dossiê com três alturas diferentes
 * no celular.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  onBack,
  backLabel = 'Voltar',
  eyebrow,
  title,
  subtitle,
  actions,
  compactActions,
  tabs,
  tone = 'canvas',
  width = 'content',
  sticky = true,
  className,
}) => {
  const deep = tone === 'deep';
  const headerRef = useRef<HTMLElement>(null);

  // Publica a altura real do cabeçalho preso como `--page-header-h`
  // no contêiner que rola, para que `scrollIntoView` numa seção não
  // pare com o alvo escondido atrás dele. A altura muda com a
  // largura da tela (no celular há uma fita de abas a mais), então
  // ela é medida, não estimada.
  useEffect(() => {
    const header = headerRef.current;
    const scroller = header?.parentElement;
    if (!header || !scroller || !sticky) return undefined;

    const publish = () => {
      scroller.style.setProperty('--page-header-h', `${Math.round(header.offsetHeight)}px`);
    };
    publish();

    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(publish);
    observer.observe(header);
    return () => observer.disconnect();
  }, [sticky]);

  return (
    <header
      ref={headerRef}
      className={cn(
        'z-sticky w-full min-w-0 border-b',
        sticky && 'sticky top-0',
        deep
          ? 'on-deep border-deep-line bg-deep/95 text-on-deep backdrop-blur-sm'
          : 'border-line-soft bg-surface/95 text-ink backdrop-blur-sm',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto w-full min-w-0 px-gutter',
          width === 'wide' ? 'max-w-content-wide' : width === 'sheet' ? 'max-w-sheet' : 'max-w-content',
        )}
      >
        <div className="flex min-w-0 items-center gap-3 py-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-md transition-colors',
                deep ? 'text-on-deep-2 hover:bg-deep-hover hover:text-on-deep' : 'text-ink-3 hover:bg-surface-hover hover:text-brand',
              )}
            >
              <BackArrow />
            </button>
          ) : null}

          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <div
                className={cn(
                  'truncate text-2xs font-semibold uppercase tracking-wider',
                  deep ? 'text-on-deep-3' : 'text-ink-3',
                )}
              >
                {eyebrow}
              </div>
            ) : null}
            {/* Um degrau menor no celular: com as ações compactas ao
                lado, o CNPJ inteiro só cabe em 14px. Cortar o número
                do documento é pior do que reduzi-lo. */}
            <h1 className="truncate text-base font-bold leading-tight md:text-lg">{title}</h1>
            {subtitle ? (
              <p className={cn('truncate text-xs', deep ? 'text-on-deep-2' : 'text-ink-3')}>{subtitle}</p>
            ) : null}
          </div>

          {compactActions ? (
            <div className="flex shrink-0 items-center gap-1 md:hidden">{compactActions}</div>
          ) : null}

          {actions ? <div className="hidden shrink-0 items-center gap-1 md:flex">{actions}</div> : null}
        </div>

        {/* Sem versão compacta, as ações descem para uma fita própria
            que rola — melhor do que espremer o título. */}
        {actions && !compactActions ? (
          <div className="scroll-fita -mx-gutter px-gutter pb-2 md:hidden">
            <div className="flex w-max items-center gap-1">{actions}</div>
          </div>
        ) : null}

        {tabs}
      </div>
    </header>
  );
};

const BackArrow: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </svg>
);

interface PageBodyProps {
  width?: 'content' | 'wide' | 'prose' | 'sheet';
  /** Ritmo vertical entre os cartões filhos. */
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}

/**
 * Miolo da tela: largura de leitura, calha lateral e o ritmo
 * vertical entre cartões. O espaçamento entre irmãos vem daqui e não
 * de uma margem no cartão, de modo que nenhuma seção precisa saber
 * quem vem antes dela.
 */
export const PageBody: React.FC<PageBodyProps> = ({ width = 'content', gap = 'md', className, children }) => (
  <div
    className={cn(
      'mx-auto flex w-full min-w-0 flex-col px-gutter pb-16 pt-4',
      // Toda âncora dentro do corpo desconta o cabeçalho preso.
      '[&_[id]]:scroll-mt-[calc(var(--page-header-h,0px)+12px)]',
      width === 'wide'
        ? 'max-w-content-wide'
        : width === 'sheet'
          ? 'max-w-sheet'
          : width === 'prose'
            ? 'max-w-prose'
            : 'max-w-content',
      gap === 'sm' ? 'gap-2' : gap === 'lg' ? 'gap-6' : 'gap-4',
      className,
    )}
  >
    {children}
  </div>
);
