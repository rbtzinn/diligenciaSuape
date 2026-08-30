import { describe, it, expect } from 'vitest';
import { calculateRisk, RiskInput } from './risk';
import type { CompanyData } from '../types';

const EMPRESA_LIMPA: CompanyData = {
  cnpj: '20867216000166',
  razao_social: 'EMPRESA DE TESTE LTDA',
  descricao_situacao_cadastral: 'ATIVA',
  // Aberta há muito tempo: idade não deve pontuar.
  data_inicio_atividade: '2005-03-14',
  qsa: [],
} as CompanyData;

function entrada(extra: Partial<RiskInput> = {}): RiskInput {
  return { empresa: EMPRESA_LIMPA, pepResults: [], ...extra };
}

/** Procura um detalhe pelo início do critério. */
const detalhe = (r: ReturnType<typeof calculateRisk>, prefixo: string) =>
  r.detalhes.find((d) => d.criterio.startsWith(prefixo));

describe('faixas de classificação', () => {
  it('empresa ativa sem nenhuma fonte consultada não fica em Atenção Baixa', () => {
    // Nenhuma fonte foi entregue: o motor precisa cobrar as lacunas em vez de
    // tratar ausência de dado como ausência de risco.
    const r = calculateRisk(entrada({ ceis: undefined, cnep: undefined }));
    const lacunas = r.detalhes.filter((d) => d.categoria === 'COBERTURA');
    expect(lacunas.length).toBeGreaterThan(0);
  });

  it('mapeia o score para a faixa correta', () => {
    const critico = calculateRisk(entrada({
      ceis: { ok: true, fonte: 'CEIS', encontrado: true, quantidade: 3, vigentes: 3, registros: [
        { vigente: true }, { vigente: true }, { vigente: true },
      ] },
    }));
    expect(critico.nivel).toBe('Atenção Crítica');
    expect(critico.cor).toBe('critical');
    expect(critico.decisao).toBe('Submeter ao Comitê de Riscos');
  });

  it('nunca ultrapassa 100', () => {
    const r = calculateRisk(entrada({
      empresa: { ...EMPRESA_LIMPA, descricao_situacao_cadastral: 'BAIXADA', data_inicio_atividade: '2026-01-01' },
      ceis: { ok: true, fonte: 'CEIS', encontrado: true, quantidade: 9, vigentes: 9, registros: Array(9).fill({ vigente: true }) },
      cnep: { ok: true, fonte: 'CNEP', encontrado: true, quantidade: 9, vigentes: 9, registros: Array(9).fill({ vigente: true }) },
    }));
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBe(r.automaticScore);
  });
});

describe('situação cadastral', () => {
  it('pontua situação diferente de ativa como fato confirmado', () => {
    const r = calculateRisk(entrada({
      empresa: { ...EMPRESA_LIMPA, descricao_situacao_cadastral: 'BAIXADA' },
    }));
    const d = detalhe(r, 'Situação cadastral');
    expect(d?.natureza).toBe('confirmed');
    expect(d?.pontos).toBe(35);
  });
});

describe('sanções da empresa', () => {
  it('sanção vigente entra como confirmada e pesa mais que histórico', () => {
    const vigente = calculateRisk(entrada({
      ceis: { ok: true, fonte: 'CEIS', encontrado: true, quantidade: 1, vigentes: 1, registros: [{ vigente: true }] },
    }));
    const historica = calculateRisk(entrada({
      ceis: { ok: true, fonte: 'CEIS', encontrado: true, quantidade: 1, vigentes: 0, registros: [{ vigente: false }] },
    }));
    expect(detalhe(vigente, 'Sanção vigente')?.natureza).toBe('confirmed');
    expect(vigente.score).toBeGreaterThan(historica.score);
  });

  it('fonte sem chave vira lacuna declarada, não ausência de sanção', () => {
    const r = calculateRisk(entrada({
      ceis: { ok: false, semChave: true, fonte: 'CEIS', encontrado: false, quantidade: 0, registros: [] },
    }));
    const d = detalhe(r, 'CEIS não pôde');
    expect(d).toBeDefined();
    expect(d?.categoria).toBe('COBERTURA');
    expect(d?.natureza).toBe('coverage');
  });

  it('consulta concluída sem ocorrência não pontua', () => {
    const r = calculateRisk(entrada({
      ceis: { ok: true, fonte: 'CEIS', encontrado: false, quantidade: 0, vigentes: 0, registros: [] },
    }));
    expect(detalhe(r, 'Sanção vigente')).toBeUndefined();
    expect(detalhe(r, 'CEIS não pôde')).toBeUndefined();
  });
});

describe('sanções de sócio pessoa física', () => {
  const base = {
    ok: true, peopleInQsa: 1, peopleSearched: 1, resultados: [],
  };

  it('correspondência forte é hipótese, nunca fato confirmado', () => {
    const r = calculateRisk(entrada({
      personSanctions: { ...base, coverageStatus: 'CONSULTED', totalCandidates: 1, strongCandidates: 1 },
    }));
    const d = detalhe(r, 'Sócio pessoa física com correspondência forte');
    expect(d).toBeDefined();
    // Busca nominal não confirma identidade: o motor não pode marcar `confirmed`.
    expect(d?.natureza).toBe('uncertainty');
    expect(d?.requerRevisao).toBe(true);
  });

  it('homônimo pesa menos que correspondência forte', () => {
    const forte = calculateRisk(entrada({
      personSanctions: { ...base, coverageStatus: 'CONSULTED', totalCandidates: 1, strongCandidates: 1 },
    }));
    const fraco = calculateRisk(entrada({
      personSanctions: { ...base, coverageStatus: 'CONSULTED', totalCandidates: 1, strongCandidates: 0 },
    }));
    expect(forte.score).toBeGreaterThan(fraco.score);
  });

  it('quadro sem pessoa física não gera lacuna nem pontuação', () => {
    const r = calculateRisk(entrada({
      personSanctions: { ...base, coverageStatus: 'NOT_APPLICABLE', totalCandidates: 0, strongCandidates: 0, peopleInQsa: 0, peopleSearched: 0 },
    }));
    expect(detalhe(r, 'Sanções dos sócios não puderam')).toBeUndefined();
    expect(detalhe(r, 'Sócio pessoa física')).toBeUndefined();
  });

  it('fonte indisponível é cobrada como lacuna', () => {
    const r = calculateRisk(entrada({
      personSanctions: { ...base, ok: false, coverageStatus: 'UNAVAILABLE', totalCandidates: 0, strongCandidates: 0 },
    }));
    expect(detalhe(r, 'Sanções dos sócios não puderam')?.categoria).toBe('COBERTURA');
  });
});

describe('invariantes do resultado', () => {
  it('todo detalhe não confirmado exige revisão humana', () => {
    const r = calculateRisk(entrada({
      ceis: { ok: false, semChave: true, fonte: 'CEIS', encontrado: false, quantidade: 0, registros: [] },
      personSanctions: {
        ok: true, coverageStatus: 'CONSULTED', peopleInQsa: 1, peopleSearched: 1,
        totalCandidates: 2, strongCandidates: 1, resultados: [],
      },
    }));
    for (const d of r.detalhes) {
      if (d.natureza !== 'confirmed') expect(d.requerRevisao).toBe(true);
    }
  });

  it('carrega a versão da metodologia, para o dossiê ser reproduzível', () => {
    expect(calculateRisk(entrada()).methodologyVersion).toBe('v2.0-exposure');
  });
});
