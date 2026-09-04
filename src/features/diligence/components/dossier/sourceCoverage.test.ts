// ==========================================================
// DILIGÊNCIA 360 — Cobertura das fontes no dossiê
// ==========================================================
// Estes testes existem por causa de um defeito concreto: as camadas de dados
// abertos do TCE-PE ficaram quatro fases sem aparecer no dossiê porque ninguém
// as passava adiante. Passavam nos testes de unidade e não chegavam à tela.
//
// A regra que sustenta cada asserção: EMPTY e UNAVAILABLE produzem a mesma
// lista vazia e dizem o oposto. A cobertura é o lugar onde essa diferença
// precisa sobreviver.
// ==========================================================

import { describe, it, expect } from 'vitest';
import { deriveSourceCoverage, summarizeCoverage } from './sourceCoverage';
import type { DiligenceItem, TceOpenDataSummary, TceProviderReport } from '../../types';

const provider = (id: string, status: TceProviderReport['status'], extra: Partial<TceProviderReport> = {}) => ({
  provider: id,
  providerLabel: id,
  endpoint: 'X',
  category: 'CONTRATOS',
  status,
  quantidade: status === 'SUCCESS' ? 3 : 0,
  descartados: 0,
  totalLinhasNaFonte: null,
  truncado: false,
  erros: [],
  warnings: [],
  retrievedAt: '2026-09-04T12:00:00.000Z',
  ...extra,
}) as TceProviderReport;

function dossie(tcePeOpenData?: Partial<TceOpenDataSummary>): DiligenceItem {
  return {
    empresa: { cnpj: '10811370000162', razao_social: 'GUERRA CONSTRUCOES LTDA' },
    socios: [],
    pepResults: [],
    tcePeOpenData: tcePeOpenData as TceOpenDataSummary,
  } as unknown as DiligenceItem;
}

const linha = (items: ReturnType<typeof deriveSourceCoverage>, id: string) => items.find((item) => item.id === id);

describe('dados abertos do TCE-PE na cobertura', () => {
  it('cada dataset aparece com o seu próprio estado', () => {
    const items = deriveSourceCoverage(dossie({
      providers: [
        provider('tce-pe-contratos', 'SUCCESS'),
        provider('tce-pe-aditivos', 'SUCCESS'),
        provider('tce-pe-licitacoes', 'PARTIAL'),
        provider('tce-pe-obras', 'EMPTY'),
        provider('tce-pe-despesas-municipais', 'UNAVAILABLE', { erros: ['timeout'] }),
      ],
    }));

    expect(linha(items, 'tce-contratos')?.status).toBe('com-achado');
    expect(linha(items, 'tce-aditivos')?.status).toBe('com-achado');
    expect(linha(items, 'tce-licitacoes')?.status).toBe('com-achado');
    expect(linha(items, 'tce-obras')?.status).toBe('sem-achado');
    expect(linha(items, 'tce-despesas')?.status).toBe('falhou');
  });

  it('obras EMPTY e despesas UNAVAILABLE não colapsam no mesmo estado', () => {
    const items = deriveSourceCoverage(dossie({
      providers: [
        provider('tce-pe-obras', 'EMPTY'),
        provider('tce-pe-despesas-municipais', 'UNAVAILABLE', { erros: ['timeout'] }),
      ],
    }));

    // As duas devolvem zero registros e significam o oposto.
    expect(linha(items, 'tce-obras')?.status).toBe('sem-achado');
    expect(linha(items, 'tce-despesas')?.status).toBe('falhou');
    expect(linha(items, 'tce-despesas')?.detail).toBe('timeout');
  });

  it('fonte não consultada não é apresentada como fonte sem achado', () => {
    const items = deriveSourceCoverage(dossie({ providers: [provider('tce-pe-contratos', 'SUCCESS')] }));

    expect(linha(items, 'tce-contratos')?.status).toBe('com-achado');
    expect(linha(items, 'tce-obras')?.status).toBe('nao-consultada');
  });

  it('sem os dados abertos, os cinco datasets ficam como não consultados', () => {
    const items = deriveSourceCoverage(dossie(undefined));

    for (const id of ['tce-contratos', 'tce-aditivos', 'tce-licitacoes', 'tce-obras', 'tce-despesas']) {
      expect(linha(items, id)?.status).toBe('nao-consultada');
    }
  });
});

describe('catálogo documental na cobertura', () => {
  const comDocumentos = (resumo: Record<string, number>) => dossie({
    providers: [provider('tce-pe-contratos', 'SUCCESS')],
    documentIntelligence: { resumo } as never,
  });

  it('documentos com link oficial contam como achado', () => {
    const items = deriveSourceCoverage(comDocumentos({ comUrlOficial: 12, indisponiveis: 0 }));
    const documentos = linha(items, 'documentos');

    expect(documentos?.status).toBe('com-achado');
    expect(documentos?.detail).toContain('12 com link oficial');
  });

  it('documento não obtido é declarado junto do achado', () => {
    const items = deriveSourceCoverage(comDocumentos({ comUrlOficial: 12, indisponiveis: 4 }));
    expect(linha(items, 'documentos')?.detail).toContain('4 não obtido(s)');
  });

  it('nenhum documento publicado é ausência, não falha', () => {
    const items = deriveSourceCoverage(comDocumentos({ comUrlOficial: 0, indisponiveis: 0 }));
    const documentos = linha(items, 'documentos');

    expect(documentos?.status).toBe('sem-achado');
    expect(documentos?.detail).toContain('Nenhum documento publicado');
  });
});

describe('resumo da cobertura', () => {
  it('as novas fontes entram no cálculo de completude', () => {
    const comLacuna = summarizeCoverage(deriveSourceCoverage(dossie({
      providers: [provider('tce-pe-contratos', 'UNAVAILABLE', { erros: ['timeout'] })],
    })));

    // Uma decisão sobre cobertura incompleta precisa ser tomada sabendo disso.
    expect(comLacuna.completa).toBe(false);
    expect(comLacuna.falhou).toBeGreaterThan(0);
  });
});
