// ==========================================================
// DILIGÊNCIA 360 — Falha de clique não pode morrer no console
//
// Remover um dossiê com a API fora do ar produzia
// "Uncaught (in promise) ApiError": o handler usava `try/finally` sem
// `catch`, então a rejeição não chegava a lugar nenhum. O diálogo
// continuava aberto sem dizer nada, o analista clicava de novo, e o
// único sinal era uma linha no console do navegador — que ninguém lê no
// celular, que é de onde este sistema é usado.
//
// `finally` sem `catch` é exatamente a forma desse defeito: o autor
// lembrou de desligar o "carregando" e esqueceu de contar o que deu
// errado. Este teste recusa essa forma nos arquivos onde ela já
// apareceu.
// ==========================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ARQUIVOS = [
  ['HistoryView.tsx', new URL('./HistoryView.tsx', import.meta.url)],
  ['Sidebar.tsx', new URL('../../../components/layout/Sidebar.tsx', import.meta.url)],
] as const;

/** Blocos `try { … } finally` sem um `catch` entre os dois. */
function tryFinallySemCatch(fonte: string): number {
  return [...fonte.matchAll(/\btry\s*\{/g)].filter((match) => {
    const depois = fonte.slice(match.index ?? 0);
    const fecha = depois.search(/\}\s*(catch|finally)\b/);
    if (fecha < 0) return false;
    return /^\}\s*finally\b/.test(depois.slice(fecha));
  }).length;
}

describe('falhas de clique no histórico', () => {
  for (const [nome, url] of ARQUIVOS) {
    it(`${nome} não deixa rejeição sem tratamento em try/finally`, () => {
      const fonte = readFileSync(fileURLToPath(url), 'utf8');
      expect(tryFinallySemCatch(fonte)).toBe(0);
    });
  }

  it('o detector realmente pega a forma do defeito', () => {
    expect(tryFinallySemCatch('async function f(){ try { await g(); } finally { h(); } }')).toBe(1);
    expect(tryFinallySemCatch('async function f(){ try { await g(); } catch { i(); } finally { h(); } }')).toBe(0);
  });

  it('a remoção informa o analista dentro do diálogo em que ele clicou', () => {
    const fonte = readFileSync(fileURLToPath(ARQUIVOS[0][1]), 'utf8');
    expect(fonte).toContain('setDeleteError');
    expect(fonte).toMatch(/Não foi possível remover/);
    // O dossiê segue na lista quando a remoção falha: dizer só "erro"
    // deixaria dúvida sobre o que aconteceu com o registro.
    expect(fonte).toMatch(/continua na lista/);
  });
});
