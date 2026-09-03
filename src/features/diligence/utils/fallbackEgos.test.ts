import { describe, it, expect } from 'vitest';
import { ensureEgosSnapshot } from './fallbackEgos';
import type { DiligenceItem, EgosSnapshot } from '../types';

const CNPJ_RAIZ = '20867216000166';

function dossie(extra: Partial<DiligenceItem> = {}): DiligenceItem {
  return {
    cnpj: CNPJ_RAIZ,
    dataAnalise: '2026-01-01T00:00:00.000Z',
    companySource: 'BrasilAPI',
    socios: [],
    pepResults: [],
    empresa: { cnpj: CNPJ_RAIZ, razao_social: 'EMPRESA DE TESTE LTDA' },
    ...extra,
  } as unknown as DiligenceItem;
}

const raiz = (s: EgosSnapshot) => s.entities.find((e) => e.role.toUpperCase() === 'ROOT');
const porNome = (s: EgosSnapshot, nome: string) => s.entities.find((e) => e.name === nome);

describe('quando já existe snapshot do servidor', () => {
  it('devolve o snapshot original sem reconstruir nada', () => {
    const original = { entities: [{ key: 'x', name: 'do servidor' }] } as unknown as EgosSnapshot;
    expect(ensureEgosSnapshot(dossie({ egos: original }))).toBe(original);
  });

  it('reconstrói quando o snapshot veio vazio', () => {
    const s = ensureEgosSnapshot(dossie({ egos: { entities: [] } as unknown as EgosSnapshot }));
    expect(s.entities.length).toBeGreaterThan(0);
  });
});

describe('empresa raiz', () => {
  it('projeta a empresa consultada como nó raiz', () => {
    const s = ensureEgosSnapshot(dossie());
    const r = raiz(s);
    expect(r).toBeDefined();
    expect(r?.name).toBe('EMPRESA DE TESTE LTDA');
    expect(r?.depth).toBe(0);
  });

  it('declara que a projeção é local, não um snapshot do servidor', () => {
    const s = ensureEgosSnapshot(dossie({
      socios: [{ nome_socio: 'MARIA SOUZA', cnpj_cpf_do_socio: '***456789**' }] as never,
    }));
    // A marca impede confundir grafo derivado no navegador com o do EGOS.
    expect(porNome(s, 'MARIA SOUZA')?.properties?.projectedLocally).toBe(true);
  });
});

describe('quadro societário', () => {
  const socios = [
    { nome_socio: 'MARIA APARECIDA SOUZA', cnpj_cpf_do_socio: '***456789**', qualificacao_socio: 'Sócio-Administrador' },
    { nome_socio: 'HOLDING PARTICIPACOES LTDA', cnpj_cpf_do_socio: '11222333000181', qualificacao_socio: 'Sócio' },
  ];

  it('distingue pessoa física de pessoa jurídica pelo documento', () => {
    const s = ensureEgosSnapshot(dossie({ socios: socios as never }));
    expect(porNome(s, 'MARIA APARECIDA SOUZA')?.type).toBe('Person');
    expect(porNome(s, 'HOLDING PARTICIPACOES LTDA')?.type).toBe('Company');
  });

  it('guarda o CPF do sócio como identificador mascarado, com confiança menor', () => {
    const s = ensureEgosSnapshot(dossie({ socios: socios as never }));
    const ident = porNome(s, 'MARIA APARECIDA SOUZA')?.identifiers?.[0];
    expect(ident?.type).toBe('MASKED_CPF');
    // Mascarado não identifica ninguém sozinho: confiança abaixo da do CNPJ.
    expect(ident?.confidence).toBeLessThan(100);
    expect(porNome(s, 'HOLDING PARTICIPACOES LTDA')?.identifiers?.[0].confidence).toBe(100);
  });

  it('liga cada integrante à empresa raiz', () => {
    const s = ensureEgosSnapshot(dossie({ socios: socios as never }));
    const alvos = new Set(s.relationships.map((r) => r.targetEntityId));
    expect(s.relationships.length).toBeGreaterThanOrEqual(2);
    expect(alvos.size).toBeGreaterThan(0);
  });

  it('ignora integrante sem nome', () => {
    const s = ensureEgosSnapshot(dossie({
      socios: [{ nome_socio: '   ', cnpj_cpf_do_socio: '***456789**' }] as never,
    }));
    expect(s.entities.filter((e) => e.role === 'qsa_member')).toHaveLength(0);
  });

  // Homônimos com qualificações diferentes precisam continuar sendo dois nós:
  // fundi-los inventaria um vínculo que a fonte não afirma.
  it('não funde homônimos em qualificações distintas', () => {
    const s = ensureEgosSnapshot(dossie({
      socios: [
        { nome_socio: 'JOSE SILVA', cnpj_cpf_do_socio: '***111222**', qualificacao_socio: 'Sócio' },
        { nome_socio: 'JOSE SILVA', cnpj_cpf_do_socio: '***333444**', qualificacao_socio: 'Administrador' },
      ] as never,
    }));
    expect(s.entities.filter((e) => e.name === 'JOSE SILVA')).toHaveLength(2);
  });
});

describe('cobertura declarada', () => {
  it('declara apenas os eixos que a projeção local consegue construir', () => {
    const s = ensureEgosSnapshot(dossie({
      ceis: { ok: true, quantidade: 0, registros: [] } as never,
      cnep: { ok: true, quantidade: 0, registros: [] } as never,
    }));
    // PUBLIC_CONTRACTS aparece duas vezes de propósito: PNCP e contratos
    // federais da CGU são provedores distintos no mesmo eixo, cada um com a
    // própria situação de cobertura.
    expect([...new Set(s.coverage.map((c) => c.axis))].sort()).toEqual([
      'CADASTRO',
      'EXTERNAL_CONTROL',
      'PUBLIC_CONTRACTS',
      'QSA',
      'RELATIONSHIPS',
    ]);
    expect(s.coverage.filter((c) => c.axis === 'PUBLIC_CONTRACTS').map((c) => c.provider).sort())
      .toEqual(['CGU_FEDERAL_CONTRACTS', 'PNCP']);
  });

  // A projeção local não consulta fonte nenhuma: se inventasse um eixo de
  // sanção, o mapa passaria a afirmar cobertura que não existe.
  it('não reivindica cobertura de fontes que não consultou', () => {
    const s = ensureEgosSnapshot(dossie({
      ceis: { ok: true, quantidade: 3, registros: [] } as never,
    }));
    for (const proibido of ['CEIS', 'CNEP', 'PEP', 'MEDIA', 'PERSON_SANCTIONS']) {
      expect(s.coverage.some((c) => c.axis === proibido), proibido).toBe(false);
    }
  });

  it('toda entrada de cobertura tem eixo, provedor e status', () => {
    const s = ensureEgosSnapshot(dossie());
    for (const c of s.coverage) {
      expect(c.axis, JSON.stringify(c)).toBeTruthy();
      expect(c.provider, JSON.stringify(c)).toBeTruthy();
      expect(c.status, JSON.stringify(c)).toBeTruthy();
    }
  });
});

describe('integridade do grafo', () => {
  it('não gera entidade duplicada para a mesma chave', () => {
    const s = ensureEgosSnapshot(dossie({
      socios: [
        { nome_socio: 'HOLDING X LTDA', cnpj_cpf_do_socio: '11222333000181', qualificacao_socio: 'Sócio' },
        { nome_socio: 'HOLDING X LTDA', cnpj_cpf_do_socio: '11222333000181', qualificacao_socio: 'Sócio' },
      ] as never,
    }));
    const chaves = s.entities.map((e) => e.key);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('toda entidade tem id estável e nome normalizado sem acento', () => {
    const s = ensureEgosSnapshot(dossie({
      socios: [{ nome_socio: 'Maria Apárecida Souza', cnpj_cpf_do_socio: '***456789**' }] as never,
    }));
    for (const e of s.entities) {
      expect(e.id, e.key).toBeTruthy();
      expect(e.normalizedName, e.key).toBeTruthy();
      // A projeção local normaliza em minúsculas e sem acento; o grafo é
      // autocontido, então a convenção só precisa ser consistente consigo.
      expect(e.normalizedName, e.key).toBe(e.normalizedName.toLowerCase());
      expect(e.normalizedName, e.key).not.toMatch(/[áàâãéêíóôõúç]/i);
    }
    expect(porNome(s, 'Maria Apárecida Souza')?.normalizedName).toBe('maria aparecida souza');
  });

  it('o mesmo dossiê produz o mesmo grafo em duas execuções', () => {
    const entrada = dossie({
      socios: [{ nome_socio: 'MARIA SOUZA', cnpj_cpf_do_socio: '***456789**' }] as never,
    });
    const a = ensureEgosSnapshot(entrada);
    const b = ensureEgosSnapshot(entrada);
    expect(a.entities.map((e) => e.id)).toEqual(b.entities.map((e) => e.id));
  });

  it('dossiê mínimo não quebra a projeção', () => {
    const s = ensureEgosSnapshot({ cnpj: CNPJ_RAIZ, empresa: {} } as unknown as DiligenceItem);
    expect(Array.isArray(s.entities)).toBe(true);
    expect(Array.isArray(s.relationships)).toBe(true);
    expect(Array.isArray(s.coverage)).toBe(true);
  });
});
