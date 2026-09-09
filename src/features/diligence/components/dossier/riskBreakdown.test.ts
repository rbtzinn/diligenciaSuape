import { describe, expect, it } from 'vitest';
import { deriveRiskBreakdown } from './riskBreakdown';
import type { RiskAssessment, RiskDetail } from '../../types';

function detail(overrides: Partial<RiskDetail>): RiskDetail {
  return {
    criterio: 'critério',
    pontos: 10,
    info: 'informação',
    ...overrides,
  };
}

function risk(detalhes: RiskDetail[]): RiskAssessment {
  return {
    score: detalhes.reduce((sum, item) => sum + item.pontos, 0),
    nivel: 'Atenção Moderada',
    cor: 'medium',
    emoji: '',
    decisao: '',
    decisaoDesc: '',
    detalhes,
  };
}

describe('deriveRiskBreakdown', () => {
  it('devolve os quatro eixos mesmo sem nenhum achado', () => {
    const breakdown = deriveRiskBreakdown(undefined);
    expect(breakdown.axes.map((axis) => axis.id)).toEqual([
      'cadastral',
      'integridade',
      'societario',
      'reputacao',
    ]);
    expect(breakdown.axes.every((axis) => axis.points === 0)).toBe(true);
    expect(breakdown.total).toBe(0);
  });

  it('soma as categorias no eixo correspondente', () => {
    const breakdown = deriveRiskBreakdown(risk([
      detail({ pontos: 35, categoria: 'CADASTRAL' }),
      detail({ pontos: 20, categoria: 'JUDICIAL' }),
      detail({ pontos: 15, categoria: 'CONTROLE_EXTERNO' }),
      detail({ pontos: 8, categoria: 'REDE_EMPRESARIAL' }),
      detail({ pontos: 5, categoria: 'MIDIA_REPUTACIONAL' }),
    ]));

    const points = Object.fromEntries(breakdown.axes.map((axis) => [axis.id, axis.points]));
    expect(points.cadastral).toBe(35);
    // Judicial e controle externo são o mesmo eixo de integridade.
    expect(points.integridade).toBe(35);
    expect(points.societario).toBe(8);
    expect(points.reputacao).toBe(5);
  });

  it('conta quantos critérios pontuaram em cada eixo', () => {
    const breakdown = deriveRiskBreakdown(risk([
      detail({ pontos: 10, categoria: 'ESTRUTURA_SOCIETARIA' }),
      detail({ pontos: 4, categoria: 'PESSOAS_RELACIONADAS' }),
      detail({ pontos: 6, categoria: 'GOVERNANCA' }),
    ]));

    const societario = breakdown.axes.find((axis) => axis.id === 'societario');
    expect(societario?.points).toBe(20);
    expect(societario?.criteria).toBe(3);
  });

  // Lacuna de consulta não é achado sobre a empresa. Somá-la a um eixo
  // faria "a fonte não respondeu" ser lido como "encontramos algo aqui".
  it('mantém a cobertura fora dos eixos, mas dentro do total', () => {
    const breakdown = deriveRiskBreakdown(risk([
      detail({ pontos: 12, categoria: 'CADASTRAL' }),
      detail({ pontos: 6, categoria: 'COBERTURA' }),
    ]));

    expect(breakdown.axes.reduce((sum, axis) => sum + axis.points, 0)).toBe(12);
    expect(breakdown.coveragePoints).toBe(6);
    expect(breakdown.total).toBe(18);
  });

  // O ajuste manual substitui o número; não é um eixo do cálculo.
  it('não atribui a decisão humana a eixo nenhum', () => {
    const breakdown = deriveRiskBreakdown(risk([
      detail({ pontos: 25, categoria: 'DECISAO_HUMANA' }),
    ]));
    expect(breakdown.axes.every((axis) => axis.points === 0)).toBe(true);
    expect(breakdown.coveragePoints).toBe(0);
  });

  it('ignora critério sem categoria em vez de chutar um eixo', () => {
    const breakdown = deriveRiskBreakdown(risk([
      detail({ pontos: 9, categoria: undefined }),
      detail({ pontos: 3, categoria: 'CADASTRAL' }),
    ]));
    expect(breakdown.axes.find((axis) => axis.id === 'cadastral')?.points).toBe(3);
    expect(breakdown.total).toBe(3);
  });

  it('separa os critérios que o motor marcou para revisão', () => {
    const breakdown = deriveRiskBreakdown(risk([
      detail({ pontos: 10, categoria: 'CADASTRAL', requerRevisao: false }),
      detail({ pontos: 8, categoria: 'REDE_EMPRESARIAL', requerRevisao: true, criterio: 'Rede extensa' }),
    ]));
    expect(breakdown.needsReview).toHaveLength(1);
    expect(breakdown.needsReview[0].criterio).toBe('Rede extensa');
  });
});
