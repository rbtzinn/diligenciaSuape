import { describe, it, expect } from 'vitest';
import { buildSuapeQuestionnaire } from './suapeQuestionnaireEngine';
import type { DiligenceItem } from '../types';

describe('suapeQuestionnaireEngine', () => {
  const baseDiligence = {
    id: 'test-1',
    cnpj: '02345678000199',
    cnpjFmt: '02.345.678/0001-99',
    razaoSocial: 'TERMINAL PORTUARIO DE SUAPE LOGISTICA S/A',
    nomeFantasia: 'SUAPE LOG',
    dataAnalise: '2026-09-18T10:00:00Z',
    status: 'concluida',
    risco: {
      score: 15,
      nivel: 'baixo',
      classificacao: { id: 'baixo', label: 'Baixo Risco', badgeVariant: 'ok' },
      resumo: 'Sem sanções ou apontamentos graves.',
      detalhes: [],
    },
    empresa: {
      cnpj: '02345678000199',
      razao_social: 'TERMINAL PORTUARIO DE SUAPE LOGISTICA S/A',
      descricao_situacao_cadastral: 'ATIVA',
      data_inicio_atividade: '2010-05-15',
      natureza_juridica: 'Sociedade Anônima Fechada',
      cnae_fiscal: '5231102',
      cnae_fiscal_descricao: 'Atividades do Operador Portuário',
      logradouro: 'Avenida Portuária',
      numero: '1000',
      bairro: 'Zona Industrial de Suape',
      municipio: 'Ipojuca',
      uf: 'PE',
      cep: '55590-000',
      email: 'contato@suapelog.com.br',
      ddd_telefone_1: '8135275000',
      capital_social: 15000000,
      qsa: [
        {
          nome_socio: 'CARLOS SILVA ANDRADE',
          qualificacao_socio: 'Diretor-Presidente',
          cnpj_cpf_do_socio: '***.123.456-**',
          pais: 'Brasil',
        },
        {
          nome_socio: 'MARIA EDUARDA SANTOS',
          qualificacao_socio: 'Diretora de Operações',
          cnpj_cpf_do_socio: '***.987.654-**',
          pais: 'Brasil',
        },
      ],
    },
    socios: [
      {
        nome_socio: 'CARLOS SILVA ANDRADE',
        qualificacao_socio: 'Diretor-Presidente',
        cnpj_cpf_do_socio: '***.123.456-**',
        pais: 'Brasil',
      },
      {
        nome_socio: 'MARIA EDUARDA SANTOS',
        qualificacao_socio: 'Diretora de Operações',
        cnpj_cpf_do_socio: '***.987.654-**',
        pais: 'Brasil',
      },
    ],
    ceis: { ok: true, quantidade: 0, registros: [] },
    cnep: { ok: true, quantidade: 0, registros: [] },
    pepResults: [
      { nome: 'CARLOS SILVA ANDRADE', encontrado: false, ok: true, quantidade: 0, registros: [] },
      { nome: 'MARIA EDUARDA SANTOS', encontrado: false, ok: true, quantidade: 0, registros: [] },
    ],
    personSanctions: [],
    adverseMedia: {
      results: [],
      peopleSearched: 2,
    },
  } as unknown as DiligenceItem;

  it('mapeia todas as 10 seções do Questionário Oficial de Suape', () => {
    const report = buildSuapeQuestionnaire(baseDiligence);

    expect(report.sections).toHaveLength(10);
    expect(report.sections[0].sectionNumber).toBe(1);
    expect(report.sections[9].sectionNumber).toBe(10);
    expect(report.companyName).toBe('TERMINAL PORTUARIO DE SUAPE LOGISTICA S/A');
    expect(report.cnpjFormatted).toBe('02.345.678/0001-99');
  });

  it('calcula a idade da empresa com exatidão', () => {
    const report = buildSuapeQuestionnaire(baseDiligence);
    const question31 = report.allQuestions.find((q) => q.id === '3.1-tempo-exercicio');

    expect(question31).toBeDefined();
    expect(question31?.value).toMatch(/\d+ anos/);
    expect(question31?.status).toBe('automated');
  });

  it('identifica corretamente atividade regulada pela ANTAQ para operador portuário', () => {
    const report = buildSuapeQuestionnaire(baseDiligence);
    const question71 = report.allQuestions.find((q) => q.id === '7.1-atividade-regulada');

    expect(question71).toBeDefined();
    expect(question71?.status).toBe('review');
    expect(question71?.value).toContain('ANTAQ');
    expect(question71?.tableData?.length).toBeGreaterThan(0);
  });

  it('retorna Nada Consta quando CEIS e CNEP estão limpos', () => {
    const report = buildSuapeQuestionnaire(baseDiligence);
    const question44 = report.allQuestions.find((q) => q.id === '4.4-condenacoes-corrupcao-pj');
    const question92 = report.allQuestions.find((q) => q.id === '9.2-listas-restritivas-oficiais');

    expect(question44?.status).toBe('regular');
    expect(question44?.value).toContain('NADA CONSTA');
    expect(question92?.status).toBe('regular');
    expect(question92?.tableData).toHaveLength(8);
  });

  it('dispara alerta quando constam sanções no CEIS', () => {
    const diligenceWithSanction = {
      ...baseDiligence,
      ceis: { ok: true, quantidade: 2, registros: [{ id: '1', motivo: 'Fraude' }] },
    } as unknown as DiligenceItem;
    const report = buildSuapeQuestionnaire(diligenceWithSanction);
    const question44 = report.allQuestions.find((q) => q.id === '4.4-condenacoes-corrupcao-pj');
    const question92 = report.allQuestions.find((q) => q.id === '9.2-listas-restritivas-oficiais');

    expect(question44?.status).toBe('review');
    expect(question44?.value).toContain('ALERTA');
    expect(question92?.status).toBe('review');
  });

  it('dispara alerta quando sócio é identificado como PEP', () => {
    const diligenceWithPep = {
      ...baseDiligence,
      pepResults: [
        {
          nome: 'CARLOS SILVA ANDRADE',
          encontrado: true,
          ok: true,
          quantidade: 1,
          registros: [
            {
              nome: 'CARLOS SILVA ANDRADE',
              cpf: '12345678900',
              funcao: 'Secretário Municipal',
              orgao: 'Prefeitura',
              inicio: '2023-01-01',
            },
          ],
        },
      ],
    } as unknown as DiligenceItem;
    const report = buildSuapeQuestionnaire(diligenceWithPep);
    const question76 = report.allQuestions.find((q) => q.id === '7.6-pep-socios-administradores');

    expect(question76?.status).toBe('review');
    expect(question76?.value).toContain('ATENÇÃO: Consta(m) 1 integrante(s)');
    expect(question76?.tableData?.[0]?.Cargo).toBe('Secretário Municipal');
  });
});
