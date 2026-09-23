// ==========================================================
// Questionário de Diligência — busca do CNPJ na Receita
// ==========================================================
// Consulta a BrasilAPI (pública, gratuita e aberta a chamada do
// navegador) e traduz a resposta para os campos do questionário.
// Razão social, constituição, ramo e endereço ficam bloqueados: só a
// busca os preenche, para o dado ser o da Receita e não o digitado.
// Se a busca estiver fora do ar, eles liberam para digitação.
// ==========================================================

import { QUESTIONNAIRE_SECTIONS, type TextFieldDef } from './questionnaireCatalog';
import { cleanCnpj, type QuestionnaireState, type TableRow } from './questionnaireState';

const ENDPOINT = 'https://brasilapi.com.br/api/cnpj/v1/';

/** Recorte da resposta da BrasilAPI que o questionário usa. */
export interface ReceitaCompany {
  razao_social?: string;
  natureza_juridica?: string;
  data_inicio_atividade?: string;
  cnae_fiscal_descricao?: string;
  descricao_tipo_de_logradouro?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string | number;
  qsa?: Array<{ nome_socio?: string; qualificacao_socio?: string }>;
}

export type LookupResult =
  | { ok: true; company: ReceitaCompany }
  | { ok: false; reason: 'nao-encontrado' | 'indisponivel' };

export async function fetchCompany(cnpj: string, signal?: AbortSignal): Promise<LookupResult> {
  const digits = cnpj.replace(/[^0-9A-Za-z]/g, '');
  try {
    const response = await fetch(`${ENDPOINT}${digits}`, { signal });
    if (response.status === 404 || response.status === 400) return { ok: false, reason: 'nao-encontrado' };
    if (!response.ok) return { ok: false, reason: 'indisponivel' };
    return { ok: true, company: (await response.json()) as ReceitaCompany };
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return { ok: false, reason: 'indisponivel' };
  }
}

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();

function formatCep(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '').padStart(8, '0');
  return digits === '00000000' ? '' : `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatDate(iso: unknown): string {
  const match = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/** Primeira letra de cada palavra em maiúscula; a Receita devolve tudo em caixa alta. */
function titleCase(value: string): string {
  const lower = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return value
    .toLowerCase()
    .split(' ')
    .map((word, i) => (i > 0 && lower.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** Campos do questionário que a Receita sabe responder. */
export function companyToFields(company: ReceitaCompany): Record<string, string> {
  const street = clean([company.descricao_tipo_de_logradouro, company.logradouro].filter(Boolean).join(' '));
  const address = [
    [street, clean(company.numero) || 's/n'].filter(Boolean).join(', '),
    clean(company.complemento),
    clean(company.bairro),
    [clean(company.municipio), clean(company.uf)].filter(Boolean).join('/'),
    formatCep(company.cep) ? `CEP ${formatCep(company.cep)}` : '',
  ].filter(Boolean).join(' - ');

  const razao = clean(company.razao_social);
  const natureza = clean(company.natureza_juridica);
  return {
    // "Razão Social e Tipo Societário": o tipo só entra se não estiver no nome.
    razaoSocial: razao && natureza && !/\b(S\/?A|S\.A\.|LTDA|EIRELI|ME|EPP)\b/i.test(razao) ? `${razao} (${natureza})` : razao,
    dataConstituicao: formatDate(company.data_inicio_atividade),
    ramoAtividade: clean(company.cnae_fiscal_descricao),
    endereco: street ? address : '',
  };
}

/** Quadro de sócios e administradores da Receita, para a tabela 4.1. */
export function companyToAdministrators(company: ReceitaCompany): TableRow[] {
  return (company.qsa || [])
    .filter((item) => clean(item.nome_socio))
    .map((item) => ({
      nome: titleCase(clean(item.nome_socio)),
      cargo: clean(item.qualificacao_socio),
      nacionalidade: '',
      periodo: '',
    }));
}

/** Campos bloqueados, preenchidos só pela busca do CNPJ. */
export const CNPJ_FIELDS = QUESTIONNAIRE_SECTIONS.flatMap((section) => section.items)
  .filter((item): item is TextFieldDef => item.kind === 'text' && Boolean(item.fromCnpj))
  .map((item) => item.id);

/**
 * Aplica o que veio da Receita. Os campos bloqueados são sempre
 * sobrescritos — só a busca os preenche. A tabela 4.1 só é sugerida
 * quando a empresa ainda não preencheu nenhuma linha.
 */
export function applyCompany(state: QuestionnaireState, cnpj: string, company: ReceitaCompany): QuestionnaireState {
  const fields = { ...state.fields };
  const values = companyToFields(company);
  for (const id of CNPJ_FIELDS) fields[id] = values[id] || '';
  const tables = { ...state.tables };
  const currentAdmins = (tables.administradores || []).filter((row) => Object.values(row).some((v) => v.trim()));
  const admins = companyToAdministrators(company);
  if (currentAdmins.length === 0 && admins.length > 0) tables.administradores = admins;
  return { ...state, fields, tables, cnpjLookup: { cnpj: cleanCnpj(cnpj), source: 'receita' } };
}

/** CNPJ mudou ou não foi encontrado: os dados da empresa anterior saem. */
export function clearCompany(state: QuestionnaireState): QuestionnaireState {
  const fields = { ...state.fields };
  for (const id of CNPJ_FIELDS) fields[id] = '';
  return { ...state, fields, cnpjLookup: undefined };
}

/** Busca fora do ar: libera os campos para a empresa digitar. */
export function allowManualCompany(state: QuestionnaireState, cnpj: string): QuestionnaireState {
  return { ...state, cnpjLookup: { cnpj: cleanCnpj(cnpj), source: 'manual' } };
}
