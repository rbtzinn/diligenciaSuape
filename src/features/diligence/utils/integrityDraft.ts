// ==========================================================
// DILIGÊNCIA 360 — Rascunho da avaliação de integridade
//
// As respostas do questionário viviam em `useState` e mais nada. Bastava
// recarregar a página — um F5, um deploy novo, abrir o link de novo no
// dia seguinte — para o 11/11 virar 0/11 e a classificação voltar a
// "Pendente". O analista perdia a colagem do JSON e a conferência item
// a item, que é o trabalho caro desta tela.
//
// O rascunho fica no navegador, por diligência. É deliberadamente
// rascunho e não registro: o que sustenta decisão vai para o Mapa de
// Risco e para a planilha de SUAPE, por ação explícita do analista.
// Guardar aqui só evita refazer o que já foi feito.
//
// Por isso também some sozinho depois de um tempo: rascunho velho de
// uma diligência que já foi revista confundiria mais do que ajudaria.
// ==========================================================

import type { IntegrityAnswers } from './suapeRiskMapRowGenerator';

const PREFIXO = 'diligencia360:avaliacao:';
const VERSAO = 1;

/** Trinta dias: o prazo de avaliação do fluxograma é de 10 dias úteis. */
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;

export interface IntegrityDraft {
  answers: IntegrityAnswers;
  contractValueStr: string;
  /** Demais campos do questionário, para a CheckList da planilha. */
  extras?: { choices: Record<string, boolean | null>; texts: Record<string, string> };
}

interface RegistroArmazenado extends IntegrityDraft {
  versao: number;
  salvoEm: number;
}

const chave = (diligenceId: string) => `${PREFIXO}${diligenceId}`;

/**
 * Lê o rascunho desta diligência.
 *
 * Devolve `null` em qualquer situação duvidosa — sem armazenamento,
 * JSON corrompido, versão diferente, prazo vencido. Um rascunho
 * pela metade seria pior do que nenhum: ele apareceria como
 * conferência já feita.
 */
export function loadIntegrityDraft(diligenceId: string): IntegrityDraft | null {
  if (!diligenceId) return null;

  try {
    const cru = window.localStorage.getItem(chave(diligenceId));
    if (!cru) return null;

    const registro = JSON.parse(cru) as RegistroArmazenado;
    if (registro?.versao !== VERSAO) return null;
    if (!registro.answers || typeof registro.answers !== 'object') return null;
    if (!Number.isFinite(registro.salvoEm) || Date.now() - registro.salvoEm > VALIDADE_MS) {
      clearIntegrityDraft(diligenceId);
      return null;
    }

    return {
      answers: registro.answers,
      contractValueStr: typeof registro.contractValueStr === 'string' ? registro.contractValueStr : '',
      extras: registro.extras && typeof registro.extras === 'object'
        ? { choices: registro.extras.choices || {}, texts: registro.extras.texts || {} }
        : { choices: {}, texts: {} },
    };
  } catch {
    // Janela anônima, armazenamento bloqueado, cota estourada: a tela
    // funciona sem rascunho, só não poupa o retrabalho.
    return null;
  }
}

/** Grava o rascunho. Rascunho vazio é apagado em vez de gravado. */
export function saveIntegrityDraft(diligenceId: string, rascunho: IntegrityDraft): void {
  if (!diligenceId) return;

  const temResposta = Object.values(rascunho.answers || {}).some(
    (valor) => valor === true || valor === false,
  );
  if (!temResposta && !rascunho.contractValueStr) {
    clearIntegrityDraft(diligenceId);
    return;
  }

  try {
    const registro: RegistroArmazenado = {
      versao: VERSAO,
      salvoEm: Date.now(),
      answers: rascunho.answers,
      contractValueStr: rascunho.contractValueStr,
      extras: rascunho.extras,
    };
    window.localStorage.setItem(chave(diligenceId), JSON.stringify(registro));
  } catch {
    // Não poder gravar não pode impedir o analista de trabalhar.
  }
}

export function clearIntegrityDraft(diligenceId: string): void {
  if (!diligenceId) return;
  try {
    window.localStorage.removeItem(chave(diligenceId));
  } catch {
    // idem
  }
}
