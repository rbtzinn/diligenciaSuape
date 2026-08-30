import { describe, it, expect } from 'vitest';
import { buildGovernanceTimeline } from './governanceHistory';
import type { GovernanceHistoryResult, Shareholder } from '../types';

const HOJE = new Date('2026-06-15T00:00:00.000Z');

const socio = (extra: Partial<Shareholder> = {}): Shareholder => ({
  nome_socio: 'MARIA APARECIDA SOUZA',
  qualificacao_socio: 'Sócio-Administrador',
  ...extra,
} as Shareholder);

const porNome = (t: ReturnType<typeof buildGovernanceTimeline>, nome: string) =>
  t.entries.find((e) => e.name === nome);

describe('sem histórico da CVM', () => {
  it('projeta os cinco exercícios terminando no ano de referência', () => {
    const t = buildGovernanceTimeline([socio()], undefined, HOJE);
    expect(t.years).toEqual([2022, 2023, 2024, 2025, 2026]);
    expect(t.currentYear).toBe(2026);
  });

  // A distinção é o ponto: o QSA atual é uma foto, não uma série histórica.
  it('marca a linha como não histórica e declara cobertura de um exercício', () => {
    const t = buildGovernanceTimeline([socio()], undefined, HOJE);
    expect(t.historical).toBe(false);
    expect(t.consultedYears).toBe(1);
    expect(t.coverageStatus).toBe('current_only');
    expect(t.entries[0].sourceKind).toBe('current_registry');
  });

  it('classifica administrador e sócio por qualificação', () => {
    const t = buildGovernanceTimeline([
      socio({ nome_socio: 'ANA DIRETORA', qualificacao_socio: 'Diretor' }),
      socio({ nome_socio: 'BRUNO QUOTISTA', qualificacao_socio: 'Sócio' }),
      socio({ nome_socio: 'CARLA OUTRO', qualificacao_socio: 'Procurador' }),
    ], undefined, HOJE);

    expect(porNome(t, 'ANA DIRETORA')?.categories).toContain('director');
    expect(porNome(t, 'BRUNO QUOTISTA')?.categories).toContain('shareholder');
    expect(porNome(t, 'CARLA OUTRO')?.categories).toEqual(['other']);
    expect(t.directors).toBe(1);
    expect(t.shareholders).toBe(1);
  });

  it('ordena administradores antes de sócios e o resto por último', () => {
    const t = buildGovernanceTimeline([
      socio({ nome_socio: 'ZELIA OUTRO', qualificacao_socio: 'Procurador' }),
      socio({ nome_socio: 'BRUNO QUOTISTA', qualificacao_socio: 'Sócio' }),
      socio({ nome_socio: 'ANA DIRETORA', qualificacao_socio: 'Diretor' }),
    ], undefined, HOJE);
    expect(t.entries.map((e) => e.name)).toEqual(['ANA DIRETORA', 'BRUNO QUOTISTA', 'ZELIA OUTRO']);
  });

  it('descarta integrante sem nome', () => {
    const t = buildGovernanceTimeline([socio({ nome_socio: '  ' })], undefined, HOJE);
    expect(t.entries).toHaveLength(0);
  });

  it('usa rótulo explícito quando a qualificação não vem', () => {
    const t = buildGovernanceTimeline([socio({ qualificacao_socio: undefined })], undefined, HOJE);
    expect(t.entries[0].qualification).toBe('Vínculo não qualificado');
  });

  it('conta quantos integrantes têm data de entrada', () => {
    const t = buildGovernanceTimeline([
      socio({ nome_socio: 'COM DATA', data_entrada_sociedade: '2019-05-10' }),
      socio({ nome_socio: 'SEM DATA' }),
    ], undefined, HOJE);
    expect(t.datedEntries).toBe(1);
  });

  it('quem já saiu deixa de constar como atual', () => {
    const t = buildGovernanceTimeline([
      socio({ nome_socio: 'JA SAIU', data_entrada_sociedade: '2018-01-01', data_saida_sociedade: '2023-03-01' }),
      socio({ nome_socio: 'CONTINUA', data_entrada_sociedade: '2018-01-01' }),
    ], undefined, HOJE);
    expect(porNome(t, 'JA SAIU')?.isCurrent).toBe(false);
    expect(porNome(t, 'CONTINUA')?.isCurrent).toBe(true);
  });

  it('exercício anterior à entrada fica fora do período do vínculo', () => {
    const t = buildGovernanceTimeline(
      [socio({ data_entrada_sociedade: '2024-07-01' })], undefined, HOJE,
    );
    const exercicios = porNome(t, 'MARIA APARECIDA SOUZA')?.exercises || [];
    expect(exercicios.find((e) => e.year === 2022)?.status).toBe('outside');
    expect(exercicios.find((e) => e.year === 2025)?.status).not.toBe('outside');
  });

  it('propaga o aviso da consulta que não foi concluída', () => {
    const historico = {
      applicable: true, ok: false, members: [], coverageStatus: 'unavailable',
      aviso: 'Não foi possível completar os cinco exercícios.',
      provider: 'CVM — Formulário de Referência (FRE)',
    } as unknown as GovernanceHistoryResult;
    const t = buildGovernanceTimeline([socio()], historico, HOJE);
    // Sem membros da CVM, cai no registro atual — mas o aviso precisa sobreviver.
    expect(t.historical).toBe(false);
    expect(t.notice).toMatch(/não foi possível/i);
    expect(t.sourceName).toBe('CVM — Formulário de Referência (FRE)');
  });
});

/** Membro no formato que o serviço da CVM devolve. */
function membro(name: string, categoria: string, years: number[], qualification: string) {
  const snapshots = years.map((year) => ({
    year, category: categoria, qualification,
    referenceDate: `${year}-12-31`, totalSharePercent: categoria === 'shareholder' ? 12.5 : undefined,
  }));
  return {
    id: name.toLowerCase().replace(/ /g, '-'),
    name, qualification, categories: [categoria], years, snapshots,
    firstSeenExercise: years[0], lastSeenExercise: years[years.length - 1],
    presentInLatestExercise: years.includes(2026),
    latestSnapshot: snapshots[snapshots.length - 1],
  };
}

describe('com histórico da CVM', () => {
  const historico = (extra: Partial<GovernanceHistoryResult> = {}) => ({
    applicable: true,
    ok: true,
    coverageStatus: 'complete_public',
    consultedYears: 5,
    years: [2022, 2023, 2024, 2025, 2026],
    provider: 'CVM — Formulário de Referência (FRE)',
    consultadoEm: '2026-06-01T00:00:00.000Z',
    coverage: [2022, 2023, 2024, 2025, 2026].map((year) => ({ year, status: 'consulted' })),
    members: [
      membro('ANA DIRETORA', 'director', [2024, 2025, 2026], 'Diretora Presidente'),
      membro('BRUNO ACIONISTA', 'shareholder', [2022, 2023], 'Acionista'),
    ],
    ...extra,
  } as unknown as GovernanceHistoryResult);

  it('assume a série histórica no lugar da foto atual', () => {
    const t = buildGovernanceTimeline([socio()], historico(), HOJE);
    expect(t.historical).toBe(true);
    expect(t.entries.every((e) => e.sourceKind === 'cvm_fre')).toBe(true);
    // O QSA atual não deve contaminar a série da CVM.
    expect(porNome(t, 'MARIA APARECIDA SOUZA')).toBeUndefined();
  });

  it('marca como confirmado só o exercício em que a pessoa aparece', () => {
    const t = buildGovernanceTimeline([], historico(), HOJE);
    const ana = porNome(t, 'ANA DIRETORA')?.exercises || [];
    expect(ana.find((e) => e.year === 2025)?.status).toBe('confirmed');
    expect(ana.find((e) => e.year === 2022)?.status).not.toBe('confirmed');
  });

  // Dossiê gravado na planilha antes de o campo `coverage` existir volta sem
  // ele. O tipo o declara obrigatório, então o compilador não avisa.
  it('não quebra com registro antigo sem cobertura nem membros', () => {
    const antigo = historico({ coverage: undefined, members: undefined });
    expect(() => buildGovernanceTimeline([socio()], antigo, HOJE)).not.toThrow();

    const semCobertura = historico({ coverage: undefined });
    const t = buildGovernanceTimeline([], semCobertura, HOJE);
    expect(t.historical).toBe(true);
    expect(t.entries.length).toBeGreaterThan(0);
  });

  it('só usa a CVM quando ela é aplicável, respondeu e trouxe gente', () => {
    for (const invalido of [
      historico({ applicable: false }),
      historico({ ok: false }),
      historico({ members: [] }),
      historico({ members: undefined }),
    ]) {
      const t = buildGovernanceTimeline([socio()], invalido, HOJE);
      expect(t.historical, JSON.stringify({ a: invalido.applicable, o: invalido.ok })).toBe(false);
    }
  });
});
