// ==========================================================
// DILIGÊNCIA 360 — Conteúdo do formulário preenchido
//
// O PDF vai a processo, então o que sai daqui precisa ser o que o
// terceiro declarou — nem mais, nem menos. As duas regras que importam:
// item sem resposta não vira "não", e ausência de apuração não vira 0%.
// ==========================================================

import { describe, it, expect } from 'vitest';
import { buildIntegrityFormPayload } from './integrityFormPayload';
import { evaluateSuapeIntegrity, SUAPE_REQUIRED_ITEMS } from './suapeRiskMapRowGenerator';
import type { IntegrityAnswers } from './suapeRiskMapRowGenerator';
import { SUAPE_QUESTION_TEXTS } from './suapeIntegrityCatalog';
import type { DiligenceItem } from '../types';

const DILIGENCIA = {
  id: 'dil-1',
  cnpj: '56211027000269',
  cnpjFmt: '56.211.027/0002-69',
  razaoSocial: 'TMP TERMINAIS S/A',
  empresa: {
    cnae_fiscal: 5231102,
    cnae_fiscal_descricao: 'Atividades do Operador Portuário',
    data_inicio_atividade: '2025-05-05',
    logradouro: 'DOS TANQUES',
    numero: 'S/N',
    bairro: 'ILHA COCAIA',
    municipio: 'IPOJUCA',
    uf: 'PE',
  },
  socios: [],
  pepResults: [],
  timeline: [],
  risco: { score: 56, nivel: 'Atenção Elevada', cor: 'warn', emoji: '', decisao: '', decisaoDesc: '', detalhes: [] },
} as unknown as DiligenceItem;

/** Formulário em branco: todo item obrigatório sem resposta. */
const VAZIO = Object.fromEntries(
  [...SUAPE_REQUIRED_ITEMS, 'alcadaConselho'].map((chave) => [chave, null]),
) as IntegrityAnswers;

const montar = (respostas: Record<string, boolean | null>) => {
  const answers = { ...VAZIO, ...respostas };
  const avaliacao = evaluateSuapeIntegrity(DILIGENCIA, 0, answers);
  return buildIntegrityFormPayload(DILIGENCIA, answers, avaliacao);
};

describe('buildIntegrityFormPayload', () => {
  it('identifica a empresa com os dados do cadastro', () => {
    const dados = montar({});
    expect(dados.empresa.razaoSocial).toBe('TMP TERMINAIS S/A');
    expect(dados.empresa.cnpj).toBe('56.211.027/0002-69');
    expect(dados.empresa.endereco).toContain('IPOJUCA/PE');
    expect(dados.empresa.ramoAtividade).toContain('CNAE 5231102');
  });

  it('traz as perguntas na redação oficial da planilha', () => {
    const dados = montar({});
    const perguntas = dados.blocos.flatMap((bloco) => bloco.perguntas);
    const item44 = perguntas.find((p) => p.codigo === '4.4');

    expect(item44?.texto).toBe(SUAPE_QUESTION_TEXTS['4.4']);
    expect(perguntas.map((p) => p.codigo)).toContain('7.9');
  });

  it('item sem resposta chega como null, e nunca como "não"', () => {
    const dados = montar({ '4.4': false, '7.1': true });
    const perguntas = dados.blocos.flatMap((bloco) => bloco.perguntas);

    expect(perguntas.find((p) => p.codigo === '4.4')?.resposta).toBe(false);
    expect(perguntas.find((p) => p.codigo === '7.1')?.resposta).toBe(true);
    // 5.2 não foi respondido: o formulário precisa mostrar isso como
    // pendência, não como negativa do terceiro.
    expect(perguntas.find((p) => p.codigo === '5.2')?.resposta).toBeNull();
  });

  it('sem questionário, a classificação vai vazia em vez de arbitrada', () => {
    const dados = montar({});
    expect(dados.classificacao).toBe('');
  });

  it('com o questionário completo, leva a classificação apurada e o plano oficial', () => {
    const todosNao = Object.fromEntries(
      Object.keys(VAZIO).map((chave) => [chave, false]),
    ) as Record<string, boolean>;

    const dados = montar({ ...todosNao, '4.4': true });

    expect(dados.classificacao).toBe('Muito Alto');
    expect(dados.planoDeAcao).toMatch(/RISCO MUITO ALTO/i);
  });

  it('maturidade não apurada não vira 0%: seria afirmar programa inexistente', () => {
    const dados = montar({});
    expect(dados.maturidade.percentual).toBe('Não apurado');
    expect(dados.maturidade.nivel).toBe('Não apurado');
  });

  it('o bloco de valor traz a alçada do Conselho com o limite oficial', () => {
    const dados = montar({});
    const bloco = dados.blocos.find((b) => b.numero === '03');

    expect(bloco?.titulo).toBe('Valor da Contratação');
    expect(bloco?.nota).toMatch(/10\.000\.000/);
  });

  it('os quatro critérios da planilha acompanham o documento', () => {
    const dados = montar({});
    expect(dados.criterios.map((c) => c.grupo)).toEqual(['Muito Alto', 'Alto', 'Médio', 'Baixo']);
  });
});
