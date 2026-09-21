// ==========================================================
// DILIGÊNCIA 360 — Relatório em prosa
//
// O relatório é o que sai do sistema e vira e-mail, reunião ou anexo de
// processo. O que estes testes protegem é justamente o que torna esse
// texto defensável: ele nunca troca "a fonte não respondeu" por "nada
// consta", nunca afirma o que uma matéria relata, e produz sempre o
// mesmo texto para a mesma diligência.
// ==========================================================

import { describe, it, expect } from 'vitest';
import { buildNarrativeReport } from './narrativeReport';
import type { DiligenceItem } from '../types';

const BASE = {
  id: 'dil-1',
  cnpj: '56211027000269',
  cnpjFmt: '56.211.027/0002-69',
  razaoSocial: 'TMP TERMINAIS S/A',
  nomeFantasia: '',
  dataAnalise: '2026-09-20T12:00:00Z',
  empresa: {
    cnpj: '56211027000269',
    razao_social: 'TMP TERMINAIS S/A',
    descricao_situacao_cadastral: 'ATIVA',
    data_inicio_atividade: '2025-05-05',
    cnae_fiscal: 5231102,
    cnae_fiscal_descricao: 'Atividades do Operador Portuário',
    natureza_juridica: 'Sociedade Anônima Fechada',
    municipio: 'IPOJUCA',
    uf: 'PE',
    capital_social: 5_000_000,
  },
  socios: [],
  pepResults: [],
  timeline: [],
  risco: { score: 56, nivel: 'Atenção Elevada', cor: 'warn', emoji: '', decisao: '', decisaoDesc: '', detalhes: [] },
} as unknown as DiligenceItem;

const texto = (diligence: DiligenceItem) => buildNarrativeReport(diligence).plainText;

describe('buildNarrativeReport', () => {
  it('é função pura: a mesma diligência produz sempre o mesmo texto', () => {
    expect(texto(BASE)).toBe(texto(BASE));
  });

  it('escreve em frases, não em rótulos: identifica a empresa em prosa', () => {
    const relatorio = texto(BASE);
    expect(relatorio).toContain('TMP TERMINAIS S/A');
    expect(relatorio).toContain('56.211.027/0002-69');
    expect(relatorio).toMatch(/atividade principal declarada é atividades do operador portuário/i);
    expect(relatorio).toMatch(/capital social registrado é de R\$/);
    expect(relatorio).toMatch(/sede em IPOJUCA\/PE/);
  });

  it('empresa recente é qualificada como tal, porque ausência de rastro diz menos', () => {
    expect(texto(BASE)).toMatch(/Empresa recente deixa pouco rastro/);
  });

  it('fonte que não respondeu nunca vira "nada consta"', () => {
    const comFalha = {
      ...BASE,
      ceis: { ok: false, fonte: 'CEIS', erro: 'tempo esgotado', encontrado: false, quantidade: 0, registros: [] },
    } as unknown as DiligenceItem;

    const relatorio = texto(comFalha);
    expect(relatorio).toMatch(/CEIS[^.]*a fonte não respondeu/);
    expect(relatorio).toMatch(/Nada pode ser afirmado nem descartado/);
    expect(relatorio).toMatch(/O QUE NÃO FOI VERIFICADO/);
  });

  it('consulta feita sem achado é dita como consulta feita, com a data', () => {
    const semAchado = {
      ...BASE,
      ceis: { ok: true, fonte: 'CEIS', consultadoEm: '2026-09-20T12:00:00Z', encontrado: false, quantidade: 0, registros: [] },
      cnep: { ok: true, fonte: 'CNEP', consultadoEm: '2026-09-20T12:00:00Z', encontrado: false, quantidade: 0, registros: [] },
    } as unknown as DiligenceItem;

    const relatorio = texto(semAchado);
    expect(relatorio).toMatch(/CEIS[^.]*nenhum registro localizado em consulta de 20\/09\/2026/);
    expect(relatorio).toMatch(/não é atestado de idoneidade/);
  });

  it('cita o título da notícia e diz explicitamente que não leu a matéria', () => {
    const comMidia = {
      ...BASE,
      adverseMedia: {
        ok: true,
        results: [{
          id: 'p1',
          title: 'Operação apura contratos no porto',
          url: 'https://jornal.test/a',
          domain: 'jornal.test',
          snippet: 'trecho',
          publishedAt: '2026-03-12T00:00:00Z',
          matchedTerms: ['contrato'],
          matchStrength: 'high',
          status: 'pending',
          queriesMatched: [],
        }],
        queriesExecuted: [],
      },
    } as unknown as DiligenceItem;

    const relatorio = texto(comMidia);
    expect(relatorio).toContain('"Operação apura contratos no porto"');
    expect(relatorio).toContain('jornal.test');
    expect(relatorio).toMatch(/não lê o corpo da matéria/);
    expect(relatorio).toMatch(/hipótese a verificar, nunca conclusão/);
  });

  it('sem questionário, diz que a classificação oficial está pendente em vez de arbitrar', () => {
    const relatorio = texto(BASE);
    expect(relatorio).toMatch(/classificação oficial de integridade ainda não pode ser apurada/);
    expect(relatorio).not.toMatch(/classificação oficial de integridade[^.]*é (Baixo|Médio|Alto|Muito Alto)/);
  });

  it('o relatório da pesquisa usa o índice próprio sem incluir a avaliação SUAPE', () => {
    const relatorio = buildNarrativeReport(BASE, null).plainText;
    expect(relatorio).toContain('índice de atenção da pesquisa ficou em 56 de 100');
    expect(relatorio).not.toMatch(/classificação oficial|Mapa de Risco|questionário de diligência/);
  });

  it('explica que o índice de atenção não é culpa nem impedimento', () => {
    expect(texto(BASE)).toMatch(/não culpa, irregularidade ou impedimento de contratar/);
  });

  // O ajuste de espaçamento já quebrou CNPJ, valor e domínio uma vez:
  // "insere espaço depois da pontuação" parece simétrico e arruína
  // justamente os campos que têm ponto no meio.
  it('não insere espaço dentro de CNPJ, valor em reais ou domínio', () => {
    const comMidia = {
      ...BASE,
      adverseMedia: {
        ok: true,
        queriesExecuted: [],
        results: [{
          id: 'p1', title: 'Matéria', url: 'https://g1.globo.com/a', domain: 'g1.globo.com',
          snippet: '', publishedAt: '2026-03-12T00:00:00Z', matchedTerms: ['contrato'],
          matchStrength: 'high', status: 'pending', queriesMatched: [],
        }],
      },
    } as unknown as DiligenceItem;

    const relatorio = texto(comMidia);
    expect(relatorio).toContain('56.211.027/0002-69');
    // `toLocaleString` separa "R$" do número com espaço não separável
    // (U+00A0), e não com espaço comum.
    expect(relatorio).toMatch(/R\$\s5\.000\.000,00/);
    expect(relatorio).toContain('g1.globo.com');
    expect(relatorio).not.toMatch(/\s[,.;:]/);
  });

  it('o texto para colar traz todas as seções montadas', () => {
    const relatorio = buildNarrativeReport(BASE);
    for (const secao of relatorio.sections) {
      expect(relatorio.plainText).toContain(secao.heading.toUpperCase());
    }
    expect(relatorio.sections.map((s) => s.id)).toContain('conclusao');
  });
});
