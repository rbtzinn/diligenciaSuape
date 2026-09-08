import { describe, expect, it } from 'vitest';
import { classifyCompany, classifyNews, classifySanctions } from './companyPeek';
import type { AdverseMediaSummary, CompanyData, SanctionsResult } from '../types';

function sanctions(overrides: Partial<SanctionsResult> = {}): SanctionsResult {
  return {
    ok: true,
    fonte: 'CGU / CEIS',
    encontrado: false,
    quantidade: 0,
    registros: [],
    ...overrides,
  };
}

function media(overrides: Partial<AdverseMediaSummary> = {}): AdverseMediaSummary {
  return {
    ok: true,
    totalFound: 0,
    candidatesCount: 0,
    strongMatches: 0,
    mediumMatches: 0,
    weakMatches: 0,
    companyResultsCount: 0,
    personResultsCount: 0,
    peopleSearched: 0,
    peopleWithCandidates: 0,
    personSearchCompleted: true,
    results: [],
    subjects: [],
    consultadoEm: '2026-09-08T12:00:00.000Z',
    ...overrides,
  };
}

describe('classifyCompany', () => {
  it('aceita a resposta com dados', () => {
    const data = { cnpj: '11222333000181', razao_social: 'EMPRESA X' } as CompanyData;
    expect(classifyCompany({ ok: true, data })).toEqual({ state: 'ok', data });
  });

  it('trata resposta ok sem dados como falha, e não como empresa vazia', () => {
    const source = classifyCompany({ ok: true });
    expect(source.state).toBe('error');
    expect(source.data).toBeUndefined();
  });

  it('preserva a mensagem do servidor', () => {
    expect(classifyCompany({ ok: false, erro: 'CNPJ não localizado na base' })).toEqual({
      state: 'error',
      erro: 'CNPJ não localizado na base',
    });
  });
});

describe('classifySanctions', () => {
  it('aceita quando os dois cadastros respondem', () => {
    const source = classifySanctions(sanctions(), sanctions({ fonte: 'CGU / CNEP' }));
    expect(source.state).toBe('ok');
    expect(source.data?.ceis.quantidade).toBe(0);
  });

  // Um cadastro fora do ar continua dando um bloco verdadeiro: a tela
  // mostra a contagem de cada fonte em separado, então o que falhou não
  // é somado como zero.
  it('aceita quando apenas um dos cadastros responde', () => {
    const source = classifySanctions(sanctions(), sanctions({ ok: false, erro: 'HTTP 503' }));
    expect(source.state).toBe('ok');
  });

  it('recusa quando nenhum dos dois responde — indisponibilidade não é ausência de sanção', () => {
    const source = classifySanctions(
      sanctions({ ok: false, erro: 'Portal da Transparência indisponível' }),
      sanctions({ ok: false }),
    );
    expect(source.state).toBe('error');
    expect(source.erro).toBe('Portal da Transparência indisponível');
    expect(source.data).toBeUndefined();
  });
});

describe('classifyNews', () => {
  it('aceita busca concluída sem achados', () => {
    const source = classifyNews(media());
    expect(source.state).toBe('ok');
    expect(source.data?.results).toEqual([]);
  });

  // Sem provedor configurado nenhuma busca aconteceu. Exibir isso como
  // "nada encontrado" afirmaria algo que ninguém verificou.
  it('recusa quando não há provedor configurado', () => {
    const source = classifyNews(media({ ok: false, semChave: true, aviso: 'Integração não configurada.' }));
    expect(source.state).toBe('error');
    expect(source.erro).toBe('Integração não configurada.');
  });

  it('recusa busca que não foi concluída', () => {
    const source = classifyNews(media({ ok: false, aviso: 'Tempo limite esgotado' }));
    expect(source.state).toBe('error');
    expect(source.erro).toBe('Tempo limite esgotado');
  });

  // Cobertura parcial ainda traz achados verdadeiros: eles são
  // mostrados, com o aviso de que a varredura ficou incompleta.
  it('aceita busca parcial e preserva o sinal de cobertura', () => {
    const source = classifyNews(media({ consultaParcial: true, totalFound: 3 }));
    expect(source.state).toBe('ok');
    expect(source.data?.consultaParcial).toBe(true);
  });
});
