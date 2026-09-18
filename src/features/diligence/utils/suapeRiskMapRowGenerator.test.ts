import { describe, it, expect } from 'vitest';
import {
  generateRiskMapRow,
  evaluateSuapeIntegrity,
  calculateN23,
  calculateN40,
  calculateN28,
  calculateN29,
  RISK_MAP_COLUMNS_SCHEMA,
  type IntegrityAnswers,
} from './suapeRiskMapRowGenerator';
import type { DiligenceItem } from '../types';

describe('SUAPE Risk Map Row & Official Integrity Evaluation Engine', () => {
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

  const defaultAllNoAnswers: IntegrityAnswers = {
    '4.4': false,
    '5.2': false,
    '7.1': false,
    '7.2': false,
    '7.3': false,
    '7.4': false,
    '7.5': false,
    '7.6': false,
    '7.7': false,
    '7.8': false,
    '7.9': false,
    '8.2': false,
    '8.7': false,
    '9.0': false,
    alcadaConselho: false,
  };

  describe('Gatilhos Oficiais e Precedência da Fórmula J16', () => {
    // 1. Somente N23 (Muito Alto)
    it('1. Deve classificar "Muito Alto" quando apenas N23 está ativo', () => {
      const answers: IntegrityAnswers = { ...defaultAllNoAnswers, '4.4': true };
      const n23 = calculateN23(mockDiligence, answers);
      const n40 = calculateN40(0, answers);
      const n28 = calculateN28(mockDiligence, answers);
      const n29 = calculateN29(answers);

      expect(n23.active).toBe(true);
      expect(n40.active).toBe(false);
      expect(n28.active).toBe(false);
      expect(n29.active).toBe(false);

      const evaluation = evaluateSuapeIntegrity(mockDiligence, 0, answers);
      expect(evaluation.calculatedRisk).toBe('Muito Alto');
      expect(evaluation.riskDisplay).toBe('Risco Muito Alto');
    });

    // 2. Somente N40 (Muito Alto - Fórmula Oficial da Célula J16)
    it('2. Deve classificar "Muito Alto" quando apenas N40 está ativo (Fórmula Real J16: OR(N23, N40))', () => {
      const answers: IntegrityAnswers = { ...defaultAllNoAnswers, alcadaConselho: true };
      const n23 = calculateN23(mockDiligence, answers);
      const n40 = calculateN40(0, answers);
      const n28 = calculateN28(mockDiligence, answers);
      const n29 = calculateN29(answers);

      expect(n23.active).toBe(false);
      expect(n40.active).toBe(true);
      expect(n28.active).toBe(false);
      expect(n29.active).toBe(false);

      const evaluation = evaluateSuapeIntegrity(mockDiligence, 0, answers);
      expect(evaluation.calculatedRisk).toBe('Muito Alto');
      expect(evaluation.riskDisplay).toBe('Risco Muito Alto');

      // Testando também via valor monetário >= 10.000.000,00
      const evaluationPorValor = evaluateSuapeIntegrity(mockDiligence, 10000000, defaultAllNoAnswers);
      expect(evaluationPorValor.n40).toBe(true);
      expect(evaluationPorValor.calculatedRisk).toBe('Muito Alto');
    });

    // 3. Somente N28 (Alto)
    it('3. Deve classificar "Alto" quando apenas N28 está ativo (Itens 7.1, 7.3 a 7.9)', () => {
      const answers: IntegrityAnswers = { ...defaultAllNoAnswers, '7.1': true };
      const n23 = calculateN23(mockDiligence, answers);
      const n40 = calculateN40(0, answers);
      const n28 = calculateN28(mockDiligence, answers);
      const n29 = calculateN29(answers);

      expect(n23.active).toBe(false);
      expect(n40.active).toBe(false);
      expect(n28.active).toBe(true);
      expect(n29.active).toBe(false);

      const evaluation = evaluateSuapeIntegrity(mockDiligence, 0, answers);
      expect(evaluation.calculatedRisk).toBe('Alto');
      expect(evaluation.riskDisplay).toBe('Risco Alto');
    });

    // 4. Somente N29 (Médio)
    it('4. Deve classificar "Médio" quando apenas N29 está ativo (Item 7.2)', () => {
      const answers: IntegrityAnswers = { ...defaultAllNoAnswers, '7.2': true };
      const n23 = calculateN23(mockDiligence, answers);
      const n40 = calculateN40(0, answers);
      const n28 = calculateN28(mockDiligence, answers);
      const n29 = calculateN29(answers);

      expect(n23.active).toBe(false);
      expect(n40.active).toBe(false);
      expect(n28.active).toBe(false);
      expect(n29.active).toBe(true);

      const evaluation = evaluateSuapeIntegrity(mockDiligence, 0, answers);
      expect(evaluation.calculatedRisk).toBe('Médio');
      expect(evaluation.riskDisplay).toBe('Risco Médio');
    });

    // 5. Nenhum gatilho (Baixo)
    it('5. Deve classificar "Baixo" quando nenhum gatilho estiver ativo', () => {
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 50000, defaultAllNoAnswers);
      expect(evaluation.n23).toBe(false);
      expect(evaluation.n40).toBe(false);
      expect(evaluation.n28).toBe(false);
      expect(evaluation.n29).toBe(false);
      expect(evaluation.calculatedRisk).toBe('Baixo');
      expect(evaluation.riskDisplay).toBe('Risco Baixo');
    });

    // 6. N23 + N40 (Muito Alto)
    it('6. Combinação N23 + N40 deve resultar em "Muito Alto"', () => {
      const answers: IntegrityAnswers = { ...defaultAllNoAnswers, '5.2': true, alcadaConselho: true };
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 0, answers);
      expect(evaluation.n23).toBe(true);
      expect(evaluation.n40).toBe(true);
      expect(evaluation.calculatedRisk).toBe('Muito Alto');
    });

    // 7. N40 + N28 (Muito Alto - N40 tem precedência sobre N28)
    it('7. Combinação N40 + N28 deve resultar em "Muito Alto" (precedência da fórmula)', () => {
      const answers: IntegrityAnswers = { ...defaultAllNoAnswers, alcadaConselho: true, '7.4': true };
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 0, answers);
      expect(evaluation.n40).toBe(true);
      expect(evaluation.n28).toBe(true);
      expect(evaluation.calculatedRisk).toBe('Muito Alto');
    });

    // 8. N28 + N29 (Alto - N28 tem precedência sobre N29)
    it('8. Combinação N28 + N29 deve resultar em "Alto" (precedência da fórmula)', () => {
      const answers: IntegrityAnswers = { ...defaultAllNoAnswers, '7.3': true, '7.2': true };
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 0, answers);
      expect(evaluation.n28).toBe(true);
      expect(evaluation.n29).toBe(true);
      expect(evaluation.calculatedRisk).toBe('Alto');
    });

    // 9. Todos simultaneamente (Muito Alto)
    it('9. Todos os gatilhos simultaneamente devem resultar em "Muito Alto"', () => {
      const answers: IntegrityAnswers = {
        '4.4': true,
        '5.2': true,
        '7.1': true,
        '7.2': true,
        '7.3': true,
        '7.4': true,
        '7.5': true,
        '7.6': true,
        '7.7': true,
        '7.8': true,
        '7.9': true,
        '8.2': true,
        '8.7': true,
        '9.0': true,
        alcadaConselho: true,
      };
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 20000000, answers);
      expect(evaluation.n23).toBe(true);
      expect(evaluation.n40).toBe(true);
      expect(evaluation.n28).toBe(true);
      expect(evaluation.n29).toBe(true);
      expect(evaluation.calculatedRisk).toBe('Muito Alto');
    });
  });

  describe('Sem Inferências Falsas e Resposta Tri-State', () => {
    it('não inventa respostas com base em CNAE ou tipo societário S/A', () => {
      // Diligência sem questionário preenchido (todas respostas null)
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 50000);
      expect(evaluation.n28).toBe(false);
      expect(evaluation.n29).toBe(false);
      expect(evaluation.n23).toBe(false);
      // Nenhuma inferência artificial de CNAE portuário ativou 7.1/7.2/7.3
      expect(evaluation.unidentifiedItems.length).toBeGreaterThan(0);
      expect(evaluation.unidentifiedItems).toContain('7.1');
      expect(evaluation.unidentifiedItems).toContain('7.2');
    });

    it('sanções oficiais (CEIS/CNEP/TCE-PE/MTE) ativam N23 legitimamente', () => {
      const sanctionDiligence: DiligenceItem = {
        ...mockDiligence,
        ceis: { ok: true, quantidade: 1, encontrado: true, fonte: 'CEIS', registros: [{ id: 's1' } as any] },
      };
      const evaluation = evaluateSuapeIntegrity(sanctionDiligence, 50000, defaultAllNoAnswers);
      expect(evaluation.n23).toBe(true);
      expect(evaluation.calculatedRisk).toBe('Muito Alto');
      expect(evaluation.triggers.n23Reasons[0]).toContain('CEIS');
    });

    it('processos judiciais comuns que NÃO sejam das bases sancionatórias oficiais NÃO ativam N23', () => {
      const cleanDiligence: DiligenceItem = {
        ...mockDiligence,
        ceis: { ok: true, quantidade: 0, encontrado: false, fonte: 'CEIS', registros: [] },
        cnep: { ok: true, quantidade: 0, encontrado: false, fonte: 'CNEP', registros: [] },
      };
      const evaluation = evaluateSuapeIntegrity(cleanDiligence, 50000, defaultAllNoAnswers);
      expect(evaluation.n23).toBe(false);
    });
  });

  describe('Planos de Ação Oficiais (Células O48, P48, Q48, R48)', () => {
    it('reproduz fielmente o texto oficial do Plano de Ação para Baixo', () => {
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 1000, defaultAllNoAnswers);
      expect(evaluation.recommendedAction).toContain('RISCO BAIXO');
      expect(evaluation.recommendedAction).toContain('Comunicar ao Diretor Executivo da área demandante');
      expect(evaluation.recommendedAction).toContain('Arquivamento do Formulário de Diligência de SUAPE');
    });

    it('reproduz fielmente o texto oficial do Plano de Ação para Médio', () => {
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 1000, { ...defaultAllNoAnswers, '7.2': true });
      expect(evaluation.recommendedAction).toContain('RISCO MÉDIO');
      expect(evaluation.recommendedAction).toContain('Comunicar ao Diretor Executivo da área demandante');
    });

    it('reproduz fielmente o texto oficial do Plano de Ação para Alto', () => {
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 1000, { ...defaultAllNoAnswers, '7.1': true });
      expect(evaluation.recommendedAction).toContain('RISCO ALTO');
      expect(evaluation.recommendedAction).toContain('Diretor Executivo da área demandante deverá assinar a Declaração de Gestão de Contratos com Terceiros de Risco');
    });

    it('reproduz fielmente o texto oficial do Plano de Ação para Muito Alto', () => {
      const evaluation = evaluateSuapeIntegrity(mockDiligence, 15000000, defaultAllNoAnswers);
      expect(evaluation.recommendedAction).toContain('RISCO MUITO ALTO');
      expect(evaluation.recommendedAction).toContain('Prover treinamento e orientação para o gestor do contrato');
    });
  });

  describe('Gerador do Mapa de Risco (40 Colunas Oficiais)', () => {
    it('o schema possui exatamente 40 colunas mapeadas', () => {
      expect(RISK_MAP_COLUMNS_SCHEMA.length).toBe(40);
      expect(RISK_MAP_COLUMNS_SCHEMA[0].index).toBe(1);
      expect(RISK_MAP_COLUMNS_SCHEMA[39].index).toBe(40);
      expect(RISK_MAP_COLUMNS_SCHEMA[0].header).toBe('REGISTRO Nº');
      expect(RISK_MAP_COLUMNS_SCHEMA[1].header).toBe('ANO');
      expect(RISK_MAP_COLUMNS_SCHEMA[6].header).toBe('DIRETORIA');
      expect(RISK_MAP_COLUMNS_SCHEMA[8].header).toBe('EMPRESA');
      expect(RISK_MAP_COLUMNS_SCHEMA[10].header).toBe('CNPJ');
      expect(RISK_MAP_COLUMNS_SCHEMA[11].header).toBe('VALOR');
      expect(RISK_MAP_COLUMNS_SCHEMA[12].header).toBe('CLASSIFICAÇÃO');
      expect(RISK_MAP_COLUMNS_SCHEMA[25].header).toBe('A EMPRESA POSSUI CÓDIGO DE CONDUTA?');
      expect(RISK_MAP_COLUMNS_SCHEMA[26].header).toBe('A EMPRESA CONDUZ TREINAMENTO PARA GESTÃO SOCIETÁRIA ?');
      expect(RISK_MAP_COLUMNS_SCHEMA[27].header).toBe('POSSUI PROFISSIONAL RESPONSÁVEL POR UM PROGRAMA OU POLÍTICA ANTICORRUPÇÃO?');
      expect(RISK_MAP_COLUMNS_SCHEMA[28].header).toBe('NOTA ORIENTATIVA');
      expect(RISK_MAP_COLUMNS_SCHEMA[29].header).toBe('RECOMENDAÇÕES');
      expect(RISK_MAP_COLUMNS_SCHEMA[31].header).toBe('DOCUMENTO DE CONTROLE');
    });

    it('gera linha TSV com exatamente 40 colunas (rawLine.split("\\t").length === 40)', () => {
      const answers: IntegrityAnswers = {
        ...defaultAllNoAnswers,
        '7.1': true,
        '7.3': true,
        '7.4': true,
        '8.2': true,
        '8.7': true,
        '9.0': true,
      };

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
        answers,
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
      expect(parts[13]).toContain('autorização, licença, registros ou permissão'); // Col 14: RISCO 1 (Fator 1)
      expect(parts[25]).toBe('Sim'); // Item 8.2
      expect(parts[26]).toBe('Sim'); // Item 8.7
      expect(parts[27]).toBe('Sim'); // Item 9.0
      expect(parts[28]).toBe('GOVPE - Nota Técnica 154 (93986496)');
      expect(parts[29]).toContain('Diretor Executivo da área demandante deverá assinar a Declaração de Gestão de Contratos com Terceiros de Risco');
      expect(parts[30]).toBe('Sim'); // Declaração assinada
      expect(parts[31]).toBe('SEI: 0050200077.001023/2024-54');
    });

    it('quando processo SEI, valor ou diretoria não existem, mantém vazio sem inventar', () => {
      const result = generateRiskMapRow(mockDiligence, {
        answers: defaultAllNoAnswers,
      });
      const parts = result.rawLine.split('\t');
      expect(parts.length).toBe(40);
      expect(parts[0]).toBe(''); // ID
      expect(parts[6]).toBe(''); // Diretoria
      expect(parts[7]).toBe(''); // Analista
      expect(parts[11]).toBe(''); // Valor Contrato
      expect(parts[28]).toBe(''); // Nota Técnica
      expect(parts[31]).toBe(''); // Processo SEI
    });

    it('não insere "Sim" hardcoded nas colunas 26, 27 e 28 se a resposta for desconhecida ou não', () => {
      const resultNo = generateRiskMapRow(mockDiligence, {
        answers: { ...defaultAllNoAnswers, '8.2': false, '8.7': false, '9.0': false },
      });
      const partsNo = resultNo.rawLine.split('\t');
      expect(partsNo[25]).toBe('Não');
      expect(partsNo[26]).toBe('Não');
      expect(partsNo[27]).toBe('Não');

      const resultUnset = generateRiskMapRow(mockDiligence, {
        answers: { ...defaultAllNoAnswers, '8.2': null, '8.7': null, '9.0': null },
      });
      const partsUnset = resultUnset.rawLine.split('\t');
      expect(partsUnset[25]).toBe('');
      expect(partsUnset[26]).toBe('');
      expect(partsUnset[27]).toBe('');
    });
  });
});
