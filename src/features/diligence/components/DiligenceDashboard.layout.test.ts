// ==========================================================
// DILIGÊNCIA 360 — Altura do cabeçalho da diligência no celular
//
// A barra da diligência ocupava quatro fileiras num aparelho: a
// identificação e as ações empilhavam (`flex-col sm:flex-row`) e as
// quatro abas quebravam em duas linhas (`flex-wrap`). Somada à barra do
// aplicativo, sobrava menos de metade da tela para o conteúdo.
//
// O cabeçalho é montado em JSX com classes utilitárias, então o que dá
// para fixar sem montar a árvore inteira é a regra de layout: a fita de
// abas rola, não quebra.
// ==========================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fonte = readFileSync(
  fileURLToPath(new URL('./DiligenceDashboard.tsx', import.meta.url)),
  'utf8'
);

const nav = fonte.slice(
  fonte.indexOf('aria-label="Visões da diligência"'),
  fonte.indexOf('</nav>')
);

describe('barra da diligência', () => {
  it('tem a fita de abas, e ela rola em vez de quebrar em duas fileiras', () => {
    expect(nav).not.toBe('');
    expect(nav).toContain('scroll-fita');
    expect(nav).not.toContain('flex-wrap');
  });

  it('a máscara das pontas acompanha a superfície escura', () => {
    expect(nav).toContain('--scroll-fade');
  });

  it('identificação e ações ficam na mesma fileira em qualquer largura', () => {
    const barra = fonte.slice(
      fonte.indexOf('<div className="shrink-0 border-b border-deep-line bg-deep'),
      fonte.indexOf('aria-label="Visões da diligência"')
    );
    expect(barra).not.toContain('flex-col');
  });

  it('no celular os botões da barra ficam só com o ícone', () => {
    expect(fonte).toContain('aria-label="Voltar para nova busca"');
    expect(fonte).toContain('aria-label="Exportar dossiê em PDF"');
  });
});
