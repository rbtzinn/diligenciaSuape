// ==========================================================
// DILIGÊNCIA 360 — Espiada numa empresa vinculada
// ==========================================================
// O mapa mostra com quem a empresa investigada se relaciona, mas
// para responder "e essa sócia, tem alguma coisa?" era preciso
// abandonar o dossiê e abrir outra diligência. A espiada responde
// isso sem sair: cadastro, sanções e publicações da empresa
// vinculada, no próprio painel do mapa.
//
// O que ela NÃO é: uma diligência. Não classifica risco, não entra
// na trilha de auditoria e não substitui a análise. `disclaimer`
// existe para que essa distinção esteja no dado, e não apenas na
// cabeça de quem programou a tela — ler "nada encontrado" e concluir
// "empresa verificada" é o erro que esta camada precisa impedir.
// ==========================================================

import type { AdverseMediaSummary, CompanyData, SanctionsResult } from '../types';

/** Situação de cada fonte da espiada, independente das demais. */
export type PeekSourceState = 'idle' | 'loading' | 'ok' | 'error';

export interface PeekSource<T> {
  state: PeekSourceState;
  data?: T;
  erro?: string;
}

export interface PeekSanctions {
  ceis: SanctionsResult;
  cnep: SanctionsResult;
}

/**
 * Uma espiada em curso ou concluída.
 *
 * Cada fonte tem estado próprio porque elas chegam em tempos muito
 * diferentes: cadastro e sanções respondem em cerca de um segundo, a
 * busca de publicações leva bem mais. Um estado único deixaria o
 * painel vazio até a mais lenta responder, e apagaria o que já havia
 * chegado quando uma delas falhasse.
 */
export interface CompanyPeek {
  cnpj: string;
  /** Nome vindo do nó do mapa, até o cadastro trazer a razão social. */
  name: string;
  consultadoEm: string;
  cadastro: PeekSource<CompanyData>;
  sancoes: PeekSource<PeekSanctions>;
  noticias: PeekSource<AdverseMediaSummary>;
}

/** Espiadas da sessão, indexadas pelo CNPJ consultado. */
export type CompanyPeekIndex = Record<string, CompanyPeek>;
