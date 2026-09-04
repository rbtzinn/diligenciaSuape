// ==========================================================
// DILIGÊNCIA 360 — Regressão: erro técnico nunca vira achado
// ==========================================================
// O defeito que estes testes travam: o fallback de erro das consultas
// regulatórias marcava `applicable: true`, e o motor de risco lia isso como
// "existe fundo de investimento". Uma LTDA com dois sócios pessoa física no QSA
// recebia "Estrutura de fundo de investimento" (+6) e "Beneficiário final não
// visível" (+9) toda vez que a rede caía.
// ==========================================================

import { describe, it, expect } from 'vitest';
import { calculateRisk, RiskInput } from './risk';
import type { CompanyData, FundNetworkSummary } from '../types';

const LTDA_DOIS_SOCIOS: CompanyData = {
  cnpj: '10811370000162',
  razao_social: 'GUERRA CONSTRUCOES LTDA',
  descricao_situacao_cadastral: 'ATIVA',
  data_inicio_atividade: '2009-05-11',
  municipio: 'RECIFE',
  uf: 'PE',
  qsa: [
    { nome_socio: 'JOAO CARLOS GUERRA', qualificacao_socio: 'Sócio-Administrador', cnpj_cpf_do_socio: '***456789**' },
    { nome_socio: 'MARIA LUCIA GUERRA', qualificacao_socio: 'Sócia', cnpj_cpf_do_socio: '***111222**' },
  ],
} as CompanyData;

function entrada(extra: Partial<RiskInput> = {}): RiskInput {
  return { empresa: LTDA_DOIS_SOCIOS, pepResults: [], ...extra };
}

const criterios = (r: ReturnType<typeof calculateRisk>) => r.detalhes.map((d) => d.criterio);

describe('TESTE A — falha de rede na consulta regulatória', () => {
  // Exatamente o que o backend e o cliente devolvem quando a CVM não responde.
  const fundoIndisponivel: FundNetworkSummary = {
    ok: false,
    applicable: false,
    sourceStatus: 'UNAVAILABLE',
    provider: 'CVM — Cadastro de Fundos',
    entities: [],
    relationships: [],
    evidences: [],
    erro: 'fetch failed',
  };

  it('não afirma estrutura de fundo de investimento', () => {
    const r = calculateRisk(entrada({ fundNetwork: fundoIndisponivel }));
    expect(criterios(r)).not.toContain('Estrutura de fundo de investimento');
  });

  it('não cobra beneficiário final de uma LTDA com dois sócios pessoa física', () => {
    const r = calculateRisk(entrada({ fundNetwork: fundoIndisponivel }));
    expect(criterios(r)).not.toContain('Beneficiário final não visível na rede pública');
  });

  it('registra a fonte indisponível como lacuna de cobertura', () => {
    const r = calculateRisk(entrada({ fundNetwork: fundoIndisponivel }));
    const lacuna = r.detalhes.find((d) => d.criterio.startsWith('Cadastro de fundos da CVM'));
    expect(lacuna).toBeDefined();
    expect(lacuna?.categoria).toBe('COBERTURA');
    expect(lacuna?.natureza).toBe('coverage');
  });

  it('a falha pesa menos do que os dois achados falsos que substituiu', () => {
    const comFalha = calculateRisk(entrada({ fundNetwork: fundoIndisponivel }));
    const semFonte = calculateRisk(entrada({ fundNetwork: undefined }));
    // Os achados falsos somavam 15 pontos. A lacuna vale 5.
    expect(comFalha.score - semFonte.score).toBe(5);
  });
});

describe('NOT_APPLICABLE não é ERROR', () => {
  it('CNPJ que não é fundo não gera achado nem lacuna de fundo', () => {
    const naoSeAplica: FundNetworkSummary = {
      ok: true,
      applicable: false,
      sourceStatus: 'NOT_APPLICABLE',
      provider: 'CVM — Cadastro de Fundos',
      entities: [],
      relationships: [],
      evidences: [],
      aviso: 'O CNPJ não consta como fundo ou classe no cadastro público atual da CVM.',
    };
    const r = calculateRisk(entrada({ fundNetwork: naoSeAplica }));

    expect(criterios(r)).not.toContain('Estrutura de fundo de investimento');
    expect(criterios(r).some((c) => c.startsWith('Cadastro de fundos da CVM'))).toBe(false);
  });
});

describe('TESTE B — fundo realmente identificado', () => {
  const fundoReal: FundNetworkSummary = {
    ok: true,
    applicable: true,
    sourceStatus: 'SUCCESS',
    provider: 'CVM — Cadastro de Fundos',
    directParties: 3,
    expandedCompanies: 2,
    entities: [
      { key: 'company:cnpj:1', type: 'InvestmentFund', name: 'FUNDO X', role: 'root', depth: 0, confidence: 100, properties: {} },
      { key: 'company:cnpj:2', type: 'Company', name: 'GESTORA Y', role: 'fund_manager', depth: 1, confidence: 100, properties: {} },
    ],
    relationships: [],
    evidences: [],
  };

  it('avalia os alertas normalmente quando a evidência é válida', () => {
    const r = calculateRisk(entrada({ fundNetwork: fundoReal }));

    expect(criterios(r)).toContain('Estrutura de fundo de investimento');
    // Nenhuma pessoa natural na rede: aqui o alerta é legítimo, porque a fonte
    // respondeu e mostrou a estrutura.
    expect(criterios(r)).toContain('Beneficiário final não visível na rede pública');
    expect(criterios(r)).toContain('Empresas vinculadas ao fundo');
  });

  it('pessoa natural presente na rede dispensa o alerta de beneficiário final', () => {
    const r = calculateRisk(entrada({
      fundNetwork: {
        ...fundoReal,
        entities: [...fundoReal.entities, {
          key: 'person:1', type: 'Person', name: 'ANA SOUZA', role: 'fund_director', depth: 1, confidence: 100, properties: {},
        }],
      },
    }));

    expect(criterios(r)).toContain('Estrutura de fundo de investimento');
    expect(criterios(r)).not.toContain('Beneficiário final não visível na rede pública');
  });
});
