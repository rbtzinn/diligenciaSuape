import { describe, it, expect } from 'vitest';
import { buildComplexQuestionnaireAnswers } from './questionnaireAutomation';
import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../types';

function dossie(extra: Partial<DiligenceItem> = {}): DiligenceItem {
  return {
    socios: [], pepResults: [],
    empresa: { cnpj: '20867216000166', razao_social: 'EMPRESA DE TESTE LTDA' },
    ...extra,
  } as unknown as DiligenceItem;
}

const item = (respostas: ReturnType<typeof buildComplexQuestionnaireAnswers>, id: string) => {
  const found = respostas.find((r) => r.id === id);
  if (!found) throw new Error(`resposta ${id} não existe`);
  return found;
};

describe('estrutura das respostas', () => {
  it('devolve sempre o mesmo conjunto de itens, com referência do questionário', () => {
    const r = buildComplexQuestionnaireAnswers(dossie());
    expect(r.map((x) => x.id)).toEqual([
      'official-integrity', 'beneficial-ownership', 'shareholder-occurrences',
      'pep', 'regulation-licenses', 'kinship-conflict', 'integrity-documents',
    ]);
    for (const resposta of r) {
      expect(resposta.reference, resposta.id).toBeTruthy();
      // A limitação é o que impede a resposta automática de virar conclusão.
      expect(resposta.limitation, resposta.id).toBeTruthy();
      expect(resposta.evidenceLabels.length, resposta.id).toBeGreaterThan(0);
    }
  });

  it('tolera dossiê antigo sem os campos novos', () => {
    const r = buildComplexQuestionnaireAnswers({} as DiligenceItem);
    expect(r).toHaveLength(7);
  });
});

describe('sanções oficiais (4.4 · 9.2)', () => {
  const consultado = { ok: true, quantidade: 0 };

  it('sem registro e com as duas fontes consultadas, ainda fica parcial', () => {
    // Nunca "verificado": a pergunta 9.2 exige CEPIM, TCU, TCE e outras
    // fontes que o sistema não consulta.
    const r = item(buildComplexQuestionnaireAnswers(
      dossie({ ceis: consultado as never, cnep: consultado as never }),
    ), 'official-integrity');
    expect(r.status).toBe('partial');
    expect(r.answer).toMatch(/sem registro/i);
  });

  it('com registro, pede revisão e informa a quantidade somada', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      ceis: { ok: true, quantidade: 2 } as never,
      cnep: { ok: true, quantidade: 1 } as never,
    })), 'official-integrity');
    expect(r.status).toBe('review');
    expect(r.answer).toMatch(/^3 registro/);
  });

  it('fonte não concluída não vira "sem registro"', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      ceis: { ok: false, semChave: true, quantidade: 0 } as never,
      cnep: consultado as never,
    })), 'official-integrity');
    expect(r.status).toBe('partial');
    expect(r.answer).toMatch(/não foi concluída/i);
  });
});

describe('beneficiário final (5.1)', () => {
  it('sem quadro societário vira declaração do fornecedor', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({ socios: [] })), 'beneficial-ownership');
    expect(r.status).toBe('declaration');
  });

  it('sinaliza sócio pessoa jurídica que exige expansão', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      socios: [
        { nome_socio: 'HOLDING X LTDA', cnpj_cpf_do_socio: '20867216000166' },
        { nome_socio: 'MARIA SOUZA', cnpj_cpf_do_socio: '***456789**' },
      ] as never,
    })), 'beneficial-ownership');
    expect(r.status).toBe('partial');
    expect(r.answer).toMatch(/2 integrante/);
    expect(r.answer).toMatch(/1 pessoa\(s\) jurídica\(s\)/);
  });

  it('CPF mascarado não é confundido com CNPJ', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      socios: [{ nome_socio: 'MARIA SOUZA', cnpj_cpf_do_socio: '***456789**' }] as never,
    })), 'beneficial-ownership');
    expect(r.answer).not.toMatch(/pessoa\(s\) jurídica\(s\)/);
  });
});

describe('ocorrências dos integrantes (5.2)', () => {
  const midia = (results: unknown[], peopleSearched = 2): AdverseMediaSummary =>
    ({ ok: true, results, peopleSearched } as unknown as AdverseMediaSummary);

  it('sem busca executada, exige declaração e orienta refazer', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie(), midia([], 0)), 'shareholder-occurrences');
    expect(r.status).toBe('declaration');
    expect(r.answer).toMatch(/refaça a consulta/i);
  });

  it('busca feita sem achado é parcial, não verificado', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie(), midia([])), 'shareholder-occurrences');
    expect(r.status).toBe('partial');
    expect(r.answer).toMatch(/2 integrante/);
  });

  // O critério é conjunto: nome completo E categoria criminal E termo casado.
  // Qualquer um faltando não pode acender o alerta.
  it('só conta conteúdo com nome completo, categoria criminal e termo casado', () => {
    const base = {
      subjectType: 'person', subjectName: 'MARIA SOUZA',
      personMatch: { fullName: true }, categories: ['criminal'], matchedTerms: ['fraude'],
    };
    const completo = item(buildComplexQuestionnaireAnswers(dossie(), midia([base])), 'shareholder-occurrences');
    expect(completo.status).toBe('review');
    expect(completo.relatedNames).toEqual(['MARIA SOUZA']);

    for (const parcial of [
      { ...base, personMatch: { fullName: false } },
      { ...base, categories: ['economia'] },
      { ...base, matchedTerms: [] },
    ]) {
      const r = item(buildComplexQuestionnaireAnswers(dossie(), midia([parcial])), 'shareholder-occurrences');
      expect(r.status, JSON.stringify(parcial)).toBe('partial');
    }
  });

  it('conteúdo descartado pelo revisor deixa de contar', () => {
    const descartado = {
      subjectType: 'person', subjectName: 'MARIA SOUZA', status: 'discarded',
      personMatch: { fullName: true }, categories: ['criminal'], matchedTerms: ['fraude'],
    };
    const r = item(buildComplexQuestionnaireAnswers(dossie(), midia([descartado])), 'shareholder-occurrences');
    expect(r.status).toBe('partial');
  });
});

describe('PEP (7.6)', () => {
  it('todos consultados sem achado é o único item que chega a "verificado"', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      pepResults: [{ ok: true, nome: 'MARIA', encontrado: false }] as never,
    })), 'pep');
    expect(r.status).toBe('verified');
  });

  it('candidato encontrado pede revisão e devolve o nome', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      pepResults: [{ ok: true, nome: 'MARIA SOUZA', encontrado: true }] as never,
    })), 'pep');
    expect(r.status).toBe('review');
    expect(r.relatedNames).toEqual(['MARIA SOUZA']);
  });

  it('um integrante sem cobertura derruba o item inteiro para parcial', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      pepResults: [
        { ok: true, nome: 'MARIA', encontrado: false },
        { ok: false, semChave: true, nome: 'JOAO', encontrado: false },
      ] as never,
    })), 'pep');
    expect(r.status).toBe('partial');
  });
});

describe('parentesco e vínculo SUAPE (7.7–7.9)', () => {
  it('sem base, permanece declaração', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie()), 'kinship-conflict');
    expect(r.status).toBe('declaration');
  });

  it('relação de parentesco na rede pede revisão', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      egos: { relationships: [{ type: 'spouse_of' }], findings: [] } as never,
    })), 'kinship-conflict');
    expect(r.status).toBe('review');
    expect(r.answer).toMatch(/parentesco/i);
  });

  it('correspondência SUAPE pede revisão sem afirmar parentesco', () => {
    const r = item(buildComplexQuestionnaireAnswers(dossie({
      egos: { relationships: [], findings: [{ axis: 'INTERNAL_SUAPE', status: 'REVIEW' }] } as never,
    })), 'kinship-conflict');
    expect(r.status).toBe('review');
    expect(r.answer).toMatch(/nenhuma delas prova parentesco/i);
  });
});

describe('programa de integridade (8.1–9.6)', () => {
  it('nunca é inferido do CNPJ: continua declaração em qualquer cenário', () => {
    const rico = dossie({
      socios: [{ nome_socio: 'MARIA', cnpj_cpf_do_socio: '***456789**' }] as never,
      ceis: { ok: true, quantidade: 5 } as never,
      pepResults: [{ ok: true, nome: 'MARIA', encontrado: true }] as never,
    });
    const discoveries = [{ status: 'validated' }] as ProcessDiscovery[];
    const r = item(buildComplexQuestionnaireAnswers(rico, undefined, discoveries), 'integrity-documents');
    expect(r.status).toBe('declaration');
  });
});
