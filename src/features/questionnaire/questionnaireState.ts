// ==========================================================
// DILIGÊNCIA 360 — Estado e validação do Questionário de Diligência
// ==========================================================
// Tudo aqui é puro: a tela guarda o estado, esta camada diz o que falta.
// O PDF só é liberado com a lista de pendências vazia, e é esta lista
// que impede exportar sem a evidência exigida pelo catálogo.
//
// Não há banco. O rascunho vai para o armazenamento do navegador, sem
// os arquivos anexados (que podem ter megabytes); links e indicações de
// trecho são texto e sobrevivem ao recarregar.
// ==========================================================

import { CNPJ } from '../../lib/cnpj';
import {
  ALL_CHOICES,
  DECLARATION_FIELDS,
  QUESTIONNAIRE_SECTIONS,
  REGISTRIES,
  type ChoiceDef,
  type EvidenceKind,
  type EvidenceRule,
  type TableDef,
  type TextFieldDef,
  type YesNo,
} from './questionnaireCatalog';

export interface EvidenceFile {
  name: string;
  type: 'application/pdf' | 'image/png' | 'image/jpeg';
  size: number;
  bytes: Uint8Array;
  sha256: string;
}

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  /** Nome do arquivo, endereço do link ou indicação do trecho. */
  label: string;
  /** Linha da tabela que esta evidência comprova, na regra por linha. */
  rowIndex?: number;
  file?: EvidenceFile;
}

export type TableRow = Record<string, string>;

export interface QuestionnaireState {
  fields: Record<string, string>;
  choices: Record<string, YesNo | undefined>;
  tables: Record<string, TableRow[]>;
  registries: Record<string, boolean>;
  /** Declarou não constar em nenhum cadastro do item 9.2. */
  registriesNone: boolean;
  evidences: Record<string, Evidence[]>;
  declarationAccepted: boolean;
}

export interface Issue {
  /** Âncora na tela (`q-<id>`), para levar o usuário até a pendência. */
  anchor: string;
  message: string;
}

export function emptyState(): QuestionnaireState {
  return {
    fields: {},
    choices: {},
    tables: {},
    registries: {},
    registriesNone: false,
    evidences: {},
    declarationAccepted: false,
  };
}

const RISCO_MUITO_ALTO = ['4.4', '5.2'];
const RISCO_ALTO = ['7.1', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9'];

/**
 * Itens 9.2 e 9.3 só são perguntados em avaliação Alta ou Muito Alta. A
 * regra é a do item 3.2 da Política, aplicada às respostas do próprio
 * terceiro (a alçada do Conselho é de SUAPE e não entra aqui).
 */
export function requiresRegistries(state: QuestionnaireState): boolean {
  return [...RISCO_MUITO_ALTO, ...RISCO_ALTO].some((id) => state.choices[id] === 'sim');
}

export const isRowFilled = (row: TableRow) => Object.values(row).some((value) => value.trim() !== '');

export function filledRows(rows: TableRow[] | undefined): TableRow[] {
  return (rows || []).filter(isRowFilled);
}

export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

function parsePercent(value: string): number | null {
  const clean = value.replace('%', '').replace(/\s/g, '').replace(',', '.');
  if (!clean) return null;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : null;
}

const tag = (ref: string | undefined, label: string) => (ref ? `${ref} · ${label}` : label);
const shortText = (text: string) => (text.length > 70 ? `${text.slice(0, 67).trimEnd()}…` : text);

function validateText(field: TextFieldDef, state: QuestionnaireState, issues: Issue[]) {
  const value = (state.fields[field.id] || '').trim();
  const anchor = `q-${field.id}`;
  const name = tag(field.ref, shortText(field.label));
  if (!value) {
    if (field.required) issues.push({ anchor, message: `${name}: preencha este campo.` });
    return;
  }
  if (field.mask === 'cnpj' && !CNPJ.validate(value)) issues.push({ anchor, message: `${name}: CNPJ inválido.` });
  if (field.mask === 'cpf' && !isValidCpf(value)) issues.push({ anchor, message: `${name}: CPF inválido.` });
  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    issues.push({ anchor, message: `${name}: e-mail inválido.` });
  }
}

function validateTable(table: TableDef, state: QuestionnaireState, issues: Issue[]) {
  const rows = filledRows(state.tables[table.id]);
  const anchor = `q-${table.id}`;
  const name = tag(table.ref, shortText(table.label));
  if (table.required && rows.length === 0) {
    issues.push({ anchor, message: `${name}: inclua ao menos uma linha.` });
    return;
  }
  rows.forEach((row, index) => {
    const empty = table.columns.filter((column) => !(row[column.id] || '').trim());
    if (empty.length > 0) {
      issues.push({ anchor, message: `${name}: linha ${index + 1} sem ${empty.map((c) => c.label).join(', ')}.` });
    }
  });
  if (table.percentColumn && rows.length > 0) {
    const total = rows.reduce((sum, row) => sum + (parsePercent(row[table.percentColumn!] || '') ?? 0), 0);
    if (Math.abs(total - 100) > 0.01) {
      issues.push({ anchor, message: `${name}: a participação soma ${total.toLocaleString('pt-BR')}%, e precisa somar 100%.` });
    }
  }
}

/** Evidência aceita pela regra: arquivo, link válido ou indicação de trecho. */
function evidenceCounts(evidence: Evidence, rule: EvidenceRule): boolean {
  const accepts = rule.accepts || ['file', 'link'];
  if (!accepts.includes(evidence.kind)) return false;
  if (evidence.kind === 'file') return Boolean(evidence.file);
  if (evidence.kind === 'link') return /^https?:\/\/\S+\.\S+/i.test(evidence.label.trim());
  return evidence.label.trim().length >= 5;
}

export function evidenceIsRequired(choice: ChoiceDef, state: QuestionnaireState): boolean {
  return Boolean(choice.evidence && state.choices[choice.id] === choice.evidence.when);
}

function validateEvidence(choice: ChoiceDef, state: QuestionnaireState, issues: Issue[]) {
  const rule = choice.evidence;
  if (!rule || !evidenceIsRequired(choice, state)) return;
  const anchor = `q-${choice.id}`;
  const valid = (state.evidences[choice.id] || []).filter((item) => evidenceCounts(item, rule));
  if (rule.perRowOf) {
    // Índice da linha na tabela como está na tela, com linhas vazias contando.
    (state.tables[rule.perRowOf] || []).forEach((row, index) => {
      if (!isRowFilled(row)) return;
      if (!valid.some((item) => item.rowIndex === index)) {
        const name = Object.values(row).find((value) => value.trim()) || `linha ${index + 1}`;
        issues.push({ anchor, message: `${choice.ref}: anexe a evidência da linha ${index + 1} (${shortText(name)}).` });
      }
    });
    return;
  }
  if (valid.length === 0) {
    issues.push({ anchor, message: `${choice.ref}: resposta "Sim" exige evidência. ${rule.hint}` });
  }
}

/** Tudo o que impede gerar o PDF, na ordem do questionário. */
export function validateQuestionnaire(state: QuestionnaireState): Issue[] {
  const issues: Issue[] = [];
  const registriesRequired = requiresRegistries(state);

  for (const section of QUESTIONNAIRE_SECTIONS) {
    for (const item of section.items) {
      if (item.kind === 'text') validateText(item, state, issues);
      else if (item.kind === 'table') validateTable(item, state, issues);
      else if (item.kind === 'choice') {
        const answer = state.choices[item.id];
        if (!answer) {
          issues.push({ anchor: `q-${item.id}`, message: `${item.ref}: responda Sim ou Não.` });
          continue;
        }
        if (answer === 'sim') {
          for (const child of item.whenYes || []) {
            if (child.kind === 'text') validateText(child, state, issues);
            else validateTable(child, state, issues);
          }
        }
        validateEvidence(item, state, issues);
      } else if (item.kind === 'registries' && registriesRequired) {
        const marked = REGISTRIES.filter((registry) => state.registries[registry.key]);
        if (marked.length === 0 && !state.registriesNone) {
          issues.push({ anchor: `q-${item.id}`, message: `${item.ref}: marque os cadastros em que consta ou declare que não consta em nenhum.` });
        }
        if (marked.length > 0) validateText(item.detail, state, issues);
      }
    }
  }

  if (!state.declarationAccepted) {
    issues.push({ anchor: 'q-declaracao', message: '10 · Declaração de ciência: marque a concordância.' });
  }
  for (const field of DECLARATION_FIELDS) validateText(field, state, issues);
  return issues;
}

/** Progresso: perguntas Sim/Não respondidas. */
export function answeredCount(state: QuestionnaireState): { answered: number; total: number } {
  return {
    answered: ALL_CHOICES.filter((choice) => state.choices[choice.id]).length,
    total: ALL_CHOICES.length,
  };
}

/** Rascunho para o armazenamento do navegador: sem os bytes dos arquivos. */
export function toDraft(state: QuestionnaireState): QuestionnaireState {
  const evidences: Record<string, Evidence[]> = {};
  for (const [id, list] of Object.entries(state.evidences)) {
    const kept = list.filter((item) => item.kind !== 'file');
    if (kept.length > 0) evidences[id] = kept;
  }
  return { ...state, evidences };
}

export function fromDraft(raw: unknown): QuestionnaireState | null {
  if (!raw || typeof raw !== 'object') return null;
  const draft = raw as Partial<QuestionnaireState>;
  return {
    ...emptyState(),
    ...draft,
    fields: { ...(draft.fields || {}) },
    choices: { ...(draft.choices || {}) },
    tables: { ...(draft.tables || {}) },
    registries: { ...(draft.registries || {}) },
    evidences: { ...(draft.evidences || {}) },
  };
}

/** Remove uma linha e reposiciona as evidências por linha que apontavam depois dela. */
export function removeTableRow(state: QuestionnaireState, tableId: string, index: number): QuestionnaireState {
  const rows = [...(state.tables[tableId] || [])];
  rows.splice(index, 1);
  const evidences = { ...state.evidences };
  for (const choice of ALL_CHOICES) {
    if (choice.evidence?.perRowOf !== tableId || !evidences[choice.id]) continue;
    evidences[choice.id] = evidences[choice.id]
      .filter((item) => item.rowIndex !== index)
      .map((item) => (item.rowIndex !== undefined && item.rowIndex > index ? { ...item, rowIndex: item.rowIndex - 1 } : item));
  }
  return { ...state, tables: { ...state.tables, [tableId]: rows }, evidences };
}

/** Evidências que entram no PDF, na ordem do questionário, com número de anexo. */
export function collectEvidences(state: QuestionnaireState): Array<{ choice: ChoiceDef; evidence: Evidence; annex?: number }> {
  const out: Array<{ choice: ChoiceDef; evidence: Evidence; annex?: number }> = [];
  let annex = 0;
  for (const choice of ALL_CHOICES) {
    if (!choice.evidence || state.choices[choice.id] !== choice.evidence.when) continue;
    const list = [...(state.evidences[choice.id] || [])].sort((a, b) => (a.rowIndex ?? -1) - (b.rowIndex ?? -1));
    for (const evidence of list) {
      out.push({ choice, evidence, annex: evidence.kind === 'file' && evidence.file ? (annex += 1) : undefined });
    }
  }
  return out;
}
