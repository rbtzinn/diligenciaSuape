// ==========================================================
// DILIGÊNCIA 360 — Rascunho da avaliação
//
// O defeito que isto corrige: recarregar a página zerava o questionário
// e a classificação voltava a "Pendente", jogando fora a colagem do
// JSON e a conferência item a item.
//
// O que os testes protegem é o outro lado — um rascunho duvidoso não
// pode ser restaurado, porque apareceria na tela como conferência já
// feita, que é pior do que campo vazio.
// ==========================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadIntegrityDraft, saveIntegrityDraft, clearIntegrityDraft } from './integrityDraft';

class ArmazenamentoFalso {
  private dados = new Map<string, string>();
  getItem(chave: string) { return this.dados.get(chave) ?? null; }
  setItem(chave: string, valor: string) { this.dados.set(chave, valor); }
  removeItem(chave: string) { this.dados.delete(chave); }
  get bruto() { return this.dados; }
}

let armazenamento: ArmazenamentoFalso;

beforeEach(() => {
  armazenamento = new ArmazenamentoFalso();
  (globalThis as { window?: unknown }).window = { localStorage: armazenamento };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

const RASCUNHO = {
  answers: { '4.4': false, '7.1': true } as Record<string, boolean | null>,
  contractValueStr: '5.000.000,00',
};

describe('rascunho da avaliação', () => {
  it('sobrevive ao recarregamento da página', () => {
    saveIntegrityDraft('dil-1', RASCUNHO);

    const lido = loadIntegrityDraft('dil-1');
    expect(lido?.answers).toEqual(RASCUNHO.answers);
    expect(lido?.contractValueStr).toBe(RASCUNHO.contractValueStr);
  });

  it('guarda também os demais campos do questionário', () => {
    saveIntegrityDraft('dil-1', {
      ...RASCUNHO,
      extras: { choices: { '1.2': true }, texts: { representanteNome: 'MARIA SOUZA' } },
    });

    const lido = loadIntegrityDraft('dil-1');
    expect(lido?.extras?.choices['1.2']).toBe(true);
    expect(lido?.extras?.texts.representanteNome).toBe('MARIA SOUZA');
  });

  it('rascunho antigo, gravado sem os extras, ainda é restaurado', () => {
    // Quem já tinha rascunho salvo antes deste campo existir não pode
    // perdê-lo: os extras voltam vazios e o resto continua valendo.
    saveIntegrityDraft('dil-1', RASCUNHO);

    const lido = loadIntegrityDraft('dil-1');
    expect(lido?.answers).toEqual(RASCUNHO.answers);
    expect(lido?.extras).toEqual({ choices: {}, texts: {} });
  });

  it('é guardado por diligência, e uma não vaza para a outra', () => {
    saveIntegrityDraft('dil-1', RASCUNHO);
    expect(loadIntegrityDraft('dil-2')).toBeNull();
  });

  it('limpar o questionário apaga o rascunho em vez de guardar vazio', () => {
    saveIntegrityDraft('dil-1', RASCUNHO);
    saveIntegrityDraft('dil-1', { answers: { '4.4': null }, contractValueStr: '' });

    expect(loadIntegrityDraft('dil-1')).toBeNull();
    expect(armazenamento.bruto.size).toBe(0);
  });

  it('rascunho vencido não é restaurado, e some do armazenamento', () => {
    saveIntegrityDraft('dil-1', RASCUNHO);
    const chave = [...armazenamento.bruto.keys()][0];
    const registro = JSON.parse(armazenamento.bruto.get(chave)!);
    registro.salvoEm = Date.now() - 31 * 24 * 60 * 60 * 1000;
    armazenamento.setItem(chave, JSON.stringify(registro));

    expect(loadIntegrityDraft('dil-1')).toBeNull();
    expect(armazenamento.bruto.size).toBe(0);
  });

  it('conteúdo corrompido ou de outra versão é ignorado', () => {
    armazenamento.setItem('diligencia360:avaliacao:dil-1', 'isto não é json');
    expect(loadIntegrityDraft('dil-1')).toBeNull();

    armazenamento.setItem(
      'diligencia360:avaliacao:dil-1',
      JSON.stringify({ versao: 99, salvoEm: Date.now(), answers: { '4.4': true } }),
    );
    expect(loadIntegrityDraft('dil-1')).toBeNull();
  });

  it('sem armazenamento disponível, a tela funciona sem rascunho', () => {
    delete (globalThis as { window?: unknown }).window;

    expect(() => saveIntegrityDraft('dil-1', RASCUNHO)).not.toThrow();
    expect(loadIntegrityDraft('dil-1')).toBeNull();
    expect(() => clearIntegrityDraft('dil-1')).not.toThrow();
  });

  it('armazenamento que recusa gravação não derruba a tela', () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error('cota excedida'); },
        removeItem: () => undefined,
      },
    };

    expect(() => saveIntegrityDraft('dil-1', RASCUNHO)).not.toThrow();
  });
});
