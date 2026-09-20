import { describe, it, expect } from 'vitest';
import {
  RISK_MAP_COLUMNS_SCHEMA,
  SUAPE_RISK_CATALOG,
  calculateN23,
  calculateN28,
  calculateN29,
  calculateN40,
  collectEvidenceSignals,
  evaluateIntegrityMaturity,
  evaluateSuapeIntegrity,
  generateRiskMapRow,
  requiresReputationResearch,
  SUAPE_QUESTIONARIO_VALOR_MINIMO,
  type IntegrityAnswers,
} from './suapeRiskMapRowGenerator';
import { countSuapeBusinessDays } from './suapeIntegrityCatalog';
import type { DiligenceItem } from '../types';

const baseDiligence = {
  id: 'dil-1',
  cnpj: '56.211.027/0002-69',
  cnpjFmt: '56.211.027/0002-69',
  razaoSocial: 'TMP Terminais S/A',
  nomeFantasia: '',
  status: 'completed',
  dataAnalise: '2026-09-18T10:00:00Z',
  risco: { score: 0, nivel: 'Baixo', cor: 'low', emoji: '', decisao: '', decisaoDesc: '', detalhes: [] },
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
  socios: [],
  pepResults: [],
} as unknown as DiligenceItem;

/** Respostas completas "Não", ponto de partida de cada cenário. */
const todasNao: IntegrityAnswers = {
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
  alcadaConselho: false,
};

describe('Classificação oficial (célula J16)', () => {
  it('não classifica enquanto o questionário não chega', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, {});
    expect(evaluation.status).toBe('pendente');
    expect(evaluation.calculatedRisk).toBeNull();
    expect(evaluation.riskDisplay).toBe('');
    expect(evaluation.statusLabel).toBe('Classificação pendente de questionário');
  });

  it('classifica Muito Alto quando o item 4.4 é positivo (N23)', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, '4.4': true });
    expect(calculateN23({ ...todasNao, '4.4': true }).active).toBe(true);
    expect(evaluation.calculatedRisk).toBe('Muito Alto');
    expect(evaluation.riskDisplay).toBe('Risco Muito Alto');
  });

  it('classifica Muito Alto quando o item 5.2 é positivo (N23)', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, '5.2': true });
    expect(evaluation.calculatedRisk).toBe('Muito Alto');
  });

  it('classifica Alto na alçada do Conselho e expõe a divergência da planilha', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 33_000_000, {
      ...todasNao,
      alcadaConselho: true,
    });
    expect(evaluation.n40).toBe(true);
    expect(evaluation.calculatedRisk).toBe('Alto');
    expect(evaluation.alcadaDivergence).not.toBeNull();
    expect(evaluation.alcadaDivergence?.literal).toBe('Muito Alto');
  });

  it('classifica Alto por interação com a administração pública (N28)', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, '7.4': true });
    expect(calculateN28({ ...todasNao, '7.4': true }).active).toBe(true);
    expect(evaluation.calculatedRisk).toBe('Alto');
  });

  it('classifica Médio quando só o item 7.2 é positivo (N29)', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, '7.2': true });
    expect(calculateN29({ ...todasNao, '7.2': true }).active).toBe(true);
    expect(evaluation.calculatedRisk).toBe('Médio');
  });

  it('classifica Baixo quando nenhum gatilho é positivo', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, todasNao);
    expect(evaluation.calculatedRisk).toBe('Baixo');
    expect(evaluation.isProvisional).toBe(false);
  });

  it('N23 tem precedência sobre os demais gatilhos', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 50_000_000, {
      ...todasNao,
      '4.4': true,
      '7.2': true,
      '7.4': true,
      alcadaConselho: true,
    });
    expect(evaluation.calculatedRisk).toBe('Muito Alto');
  });
});

describe('Valor da contratação e alçada do Conselho', () => {
  it('não liga N40 só porque o valor passa de R$ 10 milhões', () => {
    const resultado = calculateN40(15_000_000, todasNao);
    expect(resultado.active).toBe(false);
    expect(resultado.suggestedByValue).toBe(true);
  });

  it('sugere a confirmação da alçada quando o valor atinge o patamar', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 15_000_000, todasNao);
    expect(evaluation.calculatedRisk).toBe('Baixo');
    expect(evaluation.evidenceSignals.some((signal) => signal.item === 'alcadaConselho')).toBe(true);
  });
});

describe('Respostas parciais', () => {
  it('marca como provisória a classificação com itens em aberto', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, { '7.2': true });
    expect(evaluation.status).toBe('parcial');
    expect(evaluation.calculatedRisk).toBe('Médio');
    expect(evaluation.isProvisional).toBe(true);
    expect(evaluation.unidentifiedItems).toContain('4.4');
  });

  it('não marca Muito Alto como provisório, por já ser o teto', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, { '4.4': true });
    expect(evaluation.calculatedRisk).toBe('Muito Alto');
    expect(evaluation.isProvisional).toBe(false);
  });
});

describe('Pesquisa como evidência, não como resposta', () => {
  const comSancao = {
    ...baseDiligence,
    ceis: { registros: [{ nome: 'TMP Terminais S/A' }] },
  } as unknown as DiligenceItem;

  it('sanção em CEIS não classifica sozinha', () => {
    const evaluation = evaluateSuapeIntegrity(comSancao, 0, {});
    expect(evaluation.calculatedRisk).toBeNull();
    expect(evaluation.evidenceSignals.some((signal) => signal.item === '4.4')).toBe(true);
  });

  it('acusa contradição quando o terceiro nega o que a fonte oficial registra', () => {
    const evaluation = evaluateSuapeIntegrity(comSancao, 0, todasNao);
    expect(evaluation.calculatedRisk).toBe('Baixo');
    expect(evaluation.contradictions).toHaveLength(1);
    expect(evaluation.contradictions[0].item).toBe('4.4');
  });

  it('coleta sinais de PEP para o item 7.6', () => {
    const comPep = {
      ...baseDiligence,
      pepResults: [{ nome: 'Fulano', encontrado: true }],
    } as unknown as DiligenceItem;
    const { signals } = collectEvidenceSignals(comPep);
    expect(signals.some((signal) => signal.item === '7.6')).toBe(true);
  });
});

describe('Maturidade do programa de integridade (bloco 04)', () => {
  it('não pontua sem respostas do bloco 8/9', () => {
    const maturity = evaluateIntegrityMaturity({}, {});
    expect(maturity.score).toBeNull();
    expect(maturity.level).toBeNull();
  });

  it('chega a 100% com todos os itens positivos e nenhum cadastro atingido', () => {
    const maturity = evaluateIntegrityMaturity(
      {
        '8.1': true,
        '8.2': true,
        '8.3': true,
        '8.4': true,
        '8.5': true,
        '8.6': true,
        '8.7': true,
        '8.8': true,
        '8.9': true,
        '9.0': true,
      },
      {}
    );
    expect(maturity.score).toBe(1);
    expect(maturity.percent).toBe(100);
    expect(maturity.level).toBe('Baixo');
  });

  it('aplica os pesos oficiais: só 8.1 vale 5 de 25, mais o bloco de cadastros', () => {
    const maturity = evaluateIntegrityMaturity({ '8.1': true }, {});
    // 5 pontos do item + 1 ponto dos 8 cadastros limpos = 6/25 = 24%
    expect(maturity.pointsEarned).toBeCloseTo(6, 5);
    expect(maturity.level).toBe('Muito Alto');
  });

  it('reduz a nota conforme os cadastros atingidos (R231)', () => {
    const limpo = evaluateIntegrityMaturity({ '8.1': true, '8.2': true, '8.7': true }, {});
    const sujo = evaluateIntegrityMaturity(
      { '8.1': true, '8.2': true, '8.7': true },
      { ceis: true, cnep: true }
    );
    expect(sujo.score!).toBeLessThan(limpo.score!);
    expect(sujo.registriesHit).toEqual(['ceis', 'cnep']);
  });
});

describe('Linha do Mapa de Risco', () => {
  it('mantém exatamente 40 colunas separadas por tabulação', () => {
    const row = generateRiskMapRow(baseDiligence, { answers: todasNao });
    expect(row.columns).toHaveLength(40);
    expect(row.rawLine.split('\t')).toHaveLength(40);
    expect(RISK_MAP_COLUMNS_SCHEMA).toHaveLength(40);
  });

  it('preserva as 40 colunas mesmo com todos os riscos disparados', () => {
    const todosSim = Object.fromEntries(
      SUAPE_RISK_CATALOG.map((entry) => [entry.item, true])
    ) as IntegrityAnswers;
    const row = generateRiskMapRow(baseDiligence, { answers: todosSim });
    expect(row.rawLine.split('\t')).toHaveLength(40);
  });

  it('coloca cada risco no slot fixo do catálogo oficial', () => {
    const row = generateRiskMapRow(baseDiligence, {
      answers: { ...todasNao, '7.3': true, '7.2': true },
    });
    const risco1 = row.columns.find((column) => column.key === 'risco1')!;
    const risco12 = row.columns.find((column) => column.key === 'risco12')!;
    const risco4 = row.columns.find((column) => column.key === 'risco4')!;

    expect(risco1.value).toContain('É esperado obter (ou alterar ou renovar)');
    expect(risco12.value).toContain('São necessárias autorizações, licenças');
    expect(risco4.value).toBe('');
  });

  it('usa a frase curta do Mapa na coluna RECOMENDAÇÕES, não o plano integral', () => {
    const alto = generateRiskMapRow(baseDiligence, { answers: { ...todasNao, '7.4': true } });
    const baixo = generateRiskMapRow(baseDiligence, { answers: todasNao });

    expect(
      alto.columns.find((column) => column.key === 'recomendacoes')!.value
    ).toBe('Diretor da Área demandante assinar a Declaração de Gestão de Contratos com Terceiros  de Risco Alto e Treinamento para Gestor e Diretor. ');
    expect(baixo.columns.find((column) => column.key === 'recomendacoes')!.value).toBe(
      'Comunicar ao Gestor e Arquivar Processo'
    );
    expect(alto.columns.find((column) => column.key === 'recomendacoes')!.value).not.toContain('\n');
  });

  it('marca a declaração como "Não se aplica" em risco Baixo e não supõe assinatura em risco Alto', () => {
    const baixo = generateRiskMapRow(baseDiligence, { answers: todasNao });
    const alto = generateRiskMapRow(baseDiligence, { answers: { ...todasNao, '7.4': true } });

    expect(baixo.columns.find((column) => column.key === 'declaracaoAssinada')!.value).toBe('Não se aplica');
    expect(alto.columns.find((column) => column.key === 'declaracaoAssinada')!.value).toBe('');
  });

  it('calcula os dias úteis a partir das datas informadas', () => {
    const row = generateRiskMapRow(baseDiligence, {
      answers: todasNao,
      dataInicio: '17/09/2026',
      dataFim: '18/09/2026',
    });
    expect(row.columns.find((column) => column.key === 'tempoDecorrido')!.value).toBe('1');
  });

  it('bloqueia a cópia enquanto o questionário não foi importado', () => {
    const row = generateRiskMapRow(baseDiligence, {});
    expect(row.columns.find((column) => column.key === 'classificacao')!.value).toBe('');
    expect(row.blockers.some((blocker) => blocker.includes('não importado'))).toBe(true);
  });

  it('reproduz a linha real do TMP Terminais (registro 555 da planilha)', () => {
    const row = generateRiskMapRow(baseDiligence, {
      id: 555,
      ano: 2026,
      dataInicio: '17/09/2026',
      dataFim: '18/09/2026',
      diretoriaDemandante: 'DGP',
      gestor: 'Nilson Monteiro',
      valorContrato: 46056,
      processoSei: 'SEI: 0050200077.001023/2024-54',
      notaTecnica: 'GOVPE - Nota Técnica 154 (93986496)',
      declaracaoAssinada: 'Sim',
      answers: {
        ...todasNao,
        '7.2': true,
        '7.3': true,
        '8.2': true,
        '8.7': true,
        '9.0': true,
      },
    });

    const valorDe = (key: string) => row.columns.find((column) => column.key === key)!.value;

    expect(valorDe('id')).toBe('555');
    expect(valorDe('ano')).toBe('2026');
    expect(valorDe('responsavel')).toBe('Compliance');
    expect(valorDe('diretoria')).toBe('DGP');
    expect(valorDe('gestor')).toBe('Nilson Monteiro');
    expect(valorDe('empresa')).toBe('TMP Terminais S/A');
    expect(valorDe('cnpj')).toBe('56.211.027/0002-69');
    expect(valorDe('valor')).toBe(' R$  46.056,00 ');
    expect(valorDe('classificacao')).toBe('Risco Alto');
    expect(valorDe('codigoConduta')).toBe('Sim');
    expect(valorDe('treinamentoGestao')).toBe('Sim');
    expect(valorDe('profissionalAnticorrupcao')).toBe('Sim');
    expect(valorDe('documentoControle')).toBe('SEI: 0050200077.001023/2024-54');
    expect(valorDe('declaracaoAssinada')).toBe('Sim');
  });
});

describe('Dias úteis sem fim de semana e feriado', () => {
  it('conta zero no mesmo dia e um no dia seguinte', () => {
    expect(
      countSuapeBusinessDays(new Date('2026-09-04T00:00:00Z'), new Date('2026-09-04T00:00:00Z'))
    ).toBe(0);
    expect(
      countSuapeBusinessDays(new Date('2026-09-17T00:00:00Z'), new Date('2026-09-18T00:00:00Z'))
    ).toBe(1);
  });

  it('pula fim de semana', () => {
    // Sexta 11/09/2026 a segunda 14/09/2026.
    expect(
      countSuapeBusinessDays(new Date('2026-09-11T00:00:00Z'), new Date('2026-09-14T00:00:00Z'))
    ).toBe(1);
  });

  it('pula feriado de Ipojuca', () => {
    // 29/09 é o padroeiro de Ipojuca; de 28/09 (seg) a 30/09 (qua) sobra um dia.
    expect(
      countSuapeBusinessDays(new Date('2026-09-28T00:00:00Z'), new Date('2026-09-30T00:00:00Z'))
    ).toBe(1);
  });
});

// ==========================================================
// Política de Contratação de Terceiros (Capítulo V, 2023)
// ==========================================================

describe('Grupos de risco da política (itens 3.2.1 a 3.2.4)', () => {
  it('3.2.1 — Muito Alto só com resposta positiva em 4.4 e/ou 5.2', () => {
    expect(evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, '4.4': true }).calculatedRisk).toBe(
      'Muito Alto'
    );
    expect(evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, '5.2': true }).calculatedRisk).toBe(
      'Muito Alto'
    );
  });

  it('3.2.2 — Alto em 7.1, 7.3 a 7.9 e na alçada do Conselho', () => {
    for (const item of ['7.1', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9'] as const) {
      const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, [item]: true });
      expect(evaluation.calculatedRisk, `item ${item}`).toBe('Alto');
    }
    expect(
      evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, alcadaConselho: true }).calculatedRisk
    ).toBe('Alto');
  });

  it('3.2.3 — Médio apenas com 7.2', () => {
    expect(evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, '7.2': true }).calculatedRisk).toBe(
      'Médio'
    );
  });

  it('3.2.4 — Baixo quando nenhuma hipótese se aplica', () => {
    expect(evaluateSuapeIntegrity(baseDiligence, 0, todasNao).calculatedRisk).toBe('Baixo');
  });

  it('3.2 — predomina sempre a classificação mais elevada', () => {
    // 7.2 (Médio) + 7.4 (Alto) + 4.4 (Muito Alto) convivendo.
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, {
      ...todasNao,
      '7.2': true,
      '7.4': true,
      '4.4': true,
    });
    expect(evaluation.calculatedRisk).toBe('Muito Alto');
    expect(evaluation.triggeredRisks).toHaveLength(3);
  });
});

describe('Pesquisas exigidas pelo item 3.3', () => {
  it('só são obrigatórias em risco alto ou muito alto', () => {
    expect(requiresReputationResearch('Muito Alto')).toBe(true);
    expect(requiresReputationResearch('Alto')).toBe(true);
    expect(requiresReputationResearch('Médio')).toBe(false);
    expect(requiresReputationResearch('Baixo')).toBe(false);
    expect(requiresReputationResearch(null)).toBe(false);
  });

  it('a avaliação sinaliza a exigência junto da classificação', () => {
    expect(evaluateSuapeIntegrity(baseDiligence, 0, { ...todasNao, '7.4': true }).researchRequired).toBe(
      true
    );
    expect(evaluateSuapeIntegrity(baseDiligence, 0, todasNao).researchRequired).toBe(false);
  });
});

describe('Cadastros do item 3.3.3', () => {
  it('lista os 8 cadastros da política', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, todasNao);
    expect(evaluation.registryCoverage).toHaveLength(8);
    expect(evaluation.registryCoverage.map((registry) => registry.key)).toEqual([
      'ceis',
      'cnep',
      'cepim',
      'improbidadeCnj',
      'tcu',
      'tcePe',
      'trabalhoEscravo',
      'decisoesAdversas',
    ]);
  });

  it('não passa cadastro não consultado por "nada consta"', () => {
    const evaluation = evaluateSuapeIntegrity(baseDiligence, 0, todasNao);
    const cepim = evaluation.registryCoverage.find((registry) => registry.key === 'cepim')!;
    const tcu = evaluation.registryCoverage.find((registry) => registry.key === 'tcu')!;

    expect(cepim.status).toBe('nao-consultado');
    expect(tcu.status).toBe('nao-consultado');
    expect(cepim.detail).toContain('manual');
  });

  it('marca como "consta" o cadastro em que a empresa aparece', () => {
    const comSancao = {
      ...baseDiligence,
      ceis: { registros: [{ nome: 'TMP Terminais S/A' }] },
      cnep: { registros: [] },
    } as unknown as DiligenceItem;

    const evaluation = evaluateSuapeIntegrity(comSancao, 0, todasNao);
    expect(evaluation.registryCoverage.find((registry) => registry.key === 'ceis')!.status).toBe('consta');
    expect(evaluation.registryCoverage.find((registry) => registry.key === 'cnep')!.status).toBe(
      'nada-consta'
    );
  });
});

describe('Obrigatoriedade do questionário (item 3.3.1)', () => {
  it('fixa o limite de R$ 50.000,00 para dispensa e inexigibilidade', () => {
    expect(SUAPE_QUESTIONARIO_VALOR_MINIMO).toBe(50000);
  });
});
