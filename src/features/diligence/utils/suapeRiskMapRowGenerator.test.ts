import { describe, it, expect } from 'vitest';
import { generateRiskMapRow, evaluateSuapeIntegrity } from './suapeRiskMapRowGenerator';
import type { DiligenceItem } from '../types';

describe('SUAPE Risk Map Row & Integrity Evaluation', () => {
  const mockDiligence: DiligenceItem = {
    id: 'dil-1',
    cnpj: '56.211.027/0002-69',
    cnpjFmt: '56.211.027/0002-69',
    razaoSocial: 'TMP Terminais S/A',
    nomeFantasia: '',
    status: 'completed',
    dataAnalise: '2026-09-18T10:00:00Z',
    risco: { score: 75, nivel: 'Alto', cor: 'high', emoji: '⚠️', decisao: '', decisaoDesc: '', detalhes: [] },
    timeline: [],
    empresa: {
      cnpj: '56211027000269',
      razao_social: 'TMP Terminais S/A',
      nome_fantasia: '',
      natureza_juridica: 'Sociedade Anônima Fechada',
      cnae_fiscal: '5231-1/02',
      cnae_fiscal_descricao: 'Atividades do Operador Portuário',
      data_inicio_atividade: '2015-05-10',
      municipio: 'Ipojuca',
      uf: 'PE',
    },
    socios: [
      {
        nome_socio: 'Carlos Alberto Lima',
        cnpj_cpf_do_socio: '12345678901',
        qualificacao_socio: 'Diretor',
      },
    ],
    pepResults: [],
  };

  it('calculates Risco Alto for regulated port operations requiring licenses (formula =IF(OR(N23=TRUE(),N40=TRUE()),"Muito Alto",IF(OR(N28=TRUE()),"Alto",IF(N29=TRUE(),"Médio","Baixo"))))', () => {
    const evaluation = evaluateSuapeIntegrity(mockDiligence, 46056);
    expect(evaluation.n23).toBe(false);
    expect(evaluation.n40).toBe(false);
    expect(evaluation.n28).toBe(true); // Item 7.3 triggered
    expect(evaluation.calculatedRisk).toBe('Alto');
    expect(evaluation.riskDisplay).toBe('Risco Alto');
    expect(evaluation.recommendedAction).toContain('Diretor da Área demandante assinar a Declaração de Gestão de Contratos com Terceiros  de Risco Alto');
  });

  it('calculates Risco Muito Alto when CEIS/CNEP sanctions are present (N23 = true)', () => {
    const sanctionDiligence: DiligenceItem = {
      ...mockDiligence,
      ceis: { ok: true, quantidade: 1, encontrado: true, fonte: 'CEIS', registros: [{ id: 's1' } as any] },
    };
    const evaluation = evaluateSuapeIntegrity(sanctionDiligence, 50000);
    expect(evaluation.n23).toBe(true);
    expect(evaluation.calculatedRisk).toBe('Muito Alto');
    expect(evaluation.riskDisplay).toBe('Risco Muito Alto');
  });

  it('calculates Risco Muito Alto when contract value exceeds R$ 10.000.000,00 (N40 = true)', () => {
    const evaluation = evaluateSuapeIntegrity(mockDiligence, 12000000);
    expect(evaluation.n40).toBe(true);
    expect(evaluation.calculatedRisk).toBe('Muito Alto');
  });

  it('generates exactly 40 tab-separated columns ready to paste in Excel', () => {
    const result = generateRiskMapRow(mockDiligence, {
      id: '555',
      ano: '2026',
      area: 'Compliance',
      dataInicio: '17/09/2026',
      dataFim: '18/09/2026',
      dias: '1',
      diretoriaDemandante: 'DGP',
      analistaResponsavel: 'Nilson Monteiro',
      valorContrato: ' R$  46.056,00 ',
      notaTecnica: 'GOVPE - Nota Técnica 154 (93986496)',
      processoSei: 'SEI: 0050200077.001023/2024-54',
    });

    const parts = result.rawLine.split('\t');
    expect(parts.length).toBe(40);
    expect(parts[0]).toBe('555');
    expect(parts[1]).toBe('2026');
    expect(parts[2]).toBe('Compliance');
    expect(parts[3]).toBe('17/09/2026');
    expect(parts[4]).toBe('18/09/2026');
    expect(parts[5]).toBe('1');
    expect(parts[6]).toBe('DGP');
    expect(parts[7]).toBe('Nilson Monteiro');
    expect(parts[8]).toBe('TMP Terminais S/A');
    expect(parts[10]).toBe('56.211.027/0002-69');
    expect(parts[11]).toBe(' R$  46.056,00 ');
    expect(parts[12]).toBe('Risco Alto');
    expect(parts[25]).toBe('Sim');
    expect(parts[26]).toBe('Sim');
    expect(parts[27]).toBe('Sim');
    expect(parts[28]).toBe('GOVPE - Nota Técnica 154 (93986496)');
    expect(parts[29]).toContain('Diretor da Área demandante assinar a Declaração de Gestão de Contratos com Terceiros  de Risco Alto');
    expect(parts[30]).toBe('Sim');
    expect(parts[31]).toBe('SEI: 0050200077.001023/2024-54');
  });

  it('leaves empty fields blank instead of inserting dummy fake data', () => {
    const result = generateRiskMapRow(mockDiligence, {});
    const parts = result.rawLine.split('\t');
    expect(parts.length).toBe(40);
    expect(parts[0]).toBe(''); // ID is blank
    expect(parts[6]).toBe(''); // Diretoria is blank
    expect(parts[7]).toBe(''); // Analista is blank
    expect(parts[11]).toBe(''); // Valor is blank
    expect(parts[28]).toBe(''); // Nota técnica is blank
    expect(parts[31]).toBe(''); // Processo SEI is blank
    // Real data preserved
    expect(parts[8]).toBe('TMP Terminais S/A');
    expect(parts[10]).toBe('56.211.027/0002-69');
  });

  it('correctly calculates risk based on questionnaire overrides', () => {
    // Caso 1: Apenas licenças ordinárias (7.2) -> Risco Médio (N29 = true)
    const evalMedio = evaluateSuapeIntegrity(
      { ...mockDiligence, empresa: { ...mockDiligence.empresa!, cnae_fiscal: '6201-5/01', cnae_fiscal_descricao: 'Desenvolvimento de software' } },
      50000,
      { q7_2: true, q7_1: false, q7_3: false, q7_4: false, q4_4: false, q5_2: false }
    );
    expect(evalMedio.n29).toBe(true);
    expect(evalMedio.n28).toBe(false);
    expect(evalMedio.n23).toBe(false);
    expect(evalMedio.calculatedRisk).toBe('Médio');

    // Caso 2: Resposta 4.4 ou 5.2 do questionário -> Risco Muito Alto (N23 = true)
    const evalMuitoAlto = evaluateSuapeIntegrity(mockDiligence, 50000, { q4_4: true });
    expect(evalMuitoAlto.n23).toBe(true);
    expect(evalMuitoAlto.calculatedRisk).toBe('Muito Alto');

    // Caso 3: Alçada do Conselho (N40 = true) -> Risco Muito Alto
    const evalConselho = evaluateSuapeIntegrity(mockDiligence, 50000, { alcadaConselho: true });
    expect(evalConselho.n40).toBe(true);
    expect(evalConselho.calculatedRisk).toBe('Muito Alto');
  });
});

