// ==========================================================
// DILIGÊNCIA 360 — Composição do score, por eixo
// ==========================================================
// O score é um número só, e o número sozinho não diz de onde veio.
// Este módulo devolve a soma por eixo, para que a ficha mostre em que
// frente a atenção se acumulou.
//
// Dois grupos ficam de fora das faixas, e não por descuido:
//
// - COBERTURA é lacuna de consulta, não achado sobre a empresa.
//   Somá-la a um eixo faria "a fonte não respondeu" parecer
//   "encontramos algo aqui".
// - DECISAO_HUMANA é o ajuste do analista sobre o cálculo. Ela
//   substitui o número, não compõe um eixo dele.
//
// Ambos continuam visíveis na ficha, em linha própria.
// ==========================================================

import type { RiskAssessment, RiskDetail } from '../../types';

export type RiskAxisId = 'cadastral' | 'integridade' | 'societario' | 'reputacao';

export interface RiskAxisScore {
  id: RiskAxisId;
  label: string;
  points: number;
  /** Quantos critérios do eixo pontuaram. */
  criteria: number;
}

export interface RiskBreakdown {
  axes: RiskAxisScore[];
  /** Pontos vindos de lacuna de cobertura, fora dos eixos. */
  coveragePoints: number;
  /** Critérios que o motor marcou para revisão humana. */
  needsReview: RiskDetail[];
  /** Soma dos eixos mais a cobertura — deve bater com o score. */
  total: number;
}

const AXIS_OF: Record<NonNullable<RiskDetail['categoria']>, RiskAxisId | null> = {
  CADASTRAL: 'cadastral',

  INTEGRIDADE: 'integridade',
  JUDICIAL: 'integridade',
  CONTROLE_EXTERNO: 'integridade',
  OFFSHORE: 'integridade',

  ESTRUTURA_SOCIETARIA: 'societario',
  PESSOAS_RELACIONADAS: 'societario',
  REDE_EMPRESARIAL: 'societario',
  GOVERNANCA: 'societario',
  SOBREPOSICAO_OPERACIONAL: 'societario',

  MIDIA_REPUTACIONAL: 'reputacao',
  TRANSPARENCIA: 'reputacao',
  CONTRATOS_PUBLICOS: 'reputacao',

  COBERTURA: null,
  DECISAO_HUMANA: null,
};

const AXIS_LABEL: Record<RiskAxisId, string> = {
  cadastral: 'Cadastral',
  integridade: 'Integridade',
  societario: 'Societário',
  reputacao: 'Reputação',
};

const AXIS_ORDER: RiskAxisId[] = ['cadastral', 'integridade', 'societario', 'reputacao'];

export function deriveRiskBreakdown(risco?: RiskAssessment): RiskBreakdown {
  const detalhes = risco?.detalhes || [];
  const totals = new Map<RiskAxisId, { points: number; criteria: number }>(
    AXIS_ORDER.map((id) => [id, { points: 0, criteria: 0 }]),
  );
  let coveragePoints = 0;
  const needsReview: RiskDetail[] = [];

  for (const detalhe of detalhes) {
    const points = Number(detalhe.pontos) || 0;

    if (detalhe.categoria === 'COBERTURA') {
      coveragePoints += points;
      // Lacuna já tem linha própria na ficha. Repeti-la entre as
      // ressalvas faria a mesma fonte ausente ser contada duas vezes
      // pelo olho de quem lê.
      continue;
    }
    if (detalhe.requerRevisao) needsReview.push(detalhe);
    // Sem categoria o critério não pode ser atribuído a eixo nenhum.
    // Contá-lo em qualquer um seria inventar a origem do ponto.
    const axis = detalhe.categoria ? AXIS_OF[detalhe.categoria] : null;
    if (!axis) continue;

    const current = totals.get(axis);
    if (!current) continue;
    current.points += points;
    current.criteria += 1;
  }

  const axes = AXIS_ORDER.map((id) => ({
    id,
    label: AXIS_LABEL[id],
    points: totals.get(id)?.points || 0,
    criteria: totals.get(id)?.criteria || 0,
  }));

  return {
    axes,
    coveragePoints,
    needsReview,
    total: axes.reduce((sum, axis) => sum + axis.points, 0) + coveragePoints,
  };
}
