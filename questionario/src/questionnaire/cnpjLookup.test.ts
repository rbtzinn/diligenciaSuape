import { describe, it, expect } from 'vitest';
import { allowManualCompany, applyCompany, clearCompany, companyToFields, type ReceitaCompany } from './cnpjLookup';
import { emptyState, validateQuestionnaire } from './questionnaireState';

const TMP: ReceitaCompany = {
  razao_social: 'TMP TERMINAIS S/A',
  natureza_juridica: 'Sociedade Anônima Fechada',
  data_inicio_atividade: '2025-05-05',
  cnae_fiscal_descricao: 'Atividades do Operador Portuário',
  descricao_tipo_de_logradouro: 'AVENIDA',
  logradouro: 'DOS TANQUES',
  numero: 'S/N',
  complemento: 'SALA 01',
  bairro: 'ILHA COCAIA',
  municipio: 'IPOJUCA',
  uf: 'PE',
  cep: 55590000,
  qsa: [{ nome_socio: 'MARCOS ANTONIO QUEIROZ DOURADO', qualificacao_socio: 'Diretor' }],
};

describe('dados da Receita', () => {
  it('traduz a resposta para os campos do questionário', () => {
    expect(companyToFields(TMP)).toEqual({
      razaoSocial: 'TMP TERMINAIS S/A',
      dataConstituicao: '05/05/2025',
      ramoAtividade: 'Atividades do Operador Portuário',
      endereco: 'AVENIDA DOS TANQUES, S/N - SALA 01 - ILHA COCAIA - IPOJUCA/PE - CEP 55590-000',
    });
  });

  it('acrescenta o tipo societário quando o nome não traz', () => {
    expect(companyToFields({ razao_social: 'JOAO SILVA', natureza_juridica: 'Empresário Individual' }).razaoSocial)
      .toBe('JOAO SILVA (Empresário Individual)');
  });

  it('sobrescreve os campos bloqueados e sugere a 4.1 só se estiver vazia', () => {
    const state = emptyState();
    state.fields.razaoSocial = 'Digitado à mão';
    const next = applyCompany(state, '56.211.027/0002-69', TMP);
    expect(next.fields.razaoSocial).toBe('TMP TERMINAIS S/A');
    expect(next.tables.administradores).toEqual([{ nome: 'Marcos Antonio Queiroz Dourado', cargo: 'Diretor', nacionalidade: '', periodo: '' }]);
    expect(next.cnpjLookup).toEqual({ cnpj: '56211027000269', source: 'receita' });

    state.tables.administradores = [{ nome: 'Já preenchido', cargo: 'X', nacionalidade: 'BR', periodo: '2024-2027' }];
    expect(applyCompany(state, '56211027000269', TMP).tables.administradores[0].nome).toBe('Já preenchido');
  });

  it('trocar de CNPJ limpa os dados da empresa anterior', () => {
    const next = clearCompany(applyCompany(emptyState(), '56211027000269', TMP));
    expect(next.fields.razaoSocial).toBe('');
    expect(next.cnpjLookup).toBeUndefined();
  });

  it('PDF fica bloqueado enquanto os dados não vierem do CNPJ informado', () => {
    const state = emptyState();
    state.fields.cnpj = '20.867.216/0001-66';
    const pendente = validateQuestionnaire(state).some((i) => i.message.includes('aguarde a busca'));
    expect(pendente).toBe(true);
    const manual = allowManualCompany(state, state.fields.cnpj);
    expect(validateQuestionnaire(manual).some((i) => i.message.includes('aguarde a busca'))).toBe(false);
  });
});
