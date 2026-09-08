// ==========================================================
// DILIGÊNCIA 360 — Regras da espiada
// ==========================================================
// Decide o que cada resposta significa para o painel. Está fora do
// hook de propósito: a orquestração das chamadas é difícil de testar
// sem DOM, mas estas regras são o que de fato importa acertar.
//
// A regra que dá nome ao arquivo: fonte que não respondeu não é
// empresa sem ocorrência. Um CEIS fora do ar e um CEIS que respondeu
// "nada consta" produzem o mesmo `registros: []`, e tratá-los igual
// transforma indisponibilidade em atestado de idoneidade.
// ==========================================================

import type { AdverseMediaSummary, CompanyData, SanctionsResult } from '../types';
import type { PeekSanctions, PeekSource } from '../types/companyPeek.types';

interface CompanyResponse {
  ok: boolean;
  erro?: string;
  data?: CompanyData;
}

export function classifyCompany(response: CompanyResponse): PeekSource<CompanyData> {
  if (response.ok && response.data) {
    return { state: 'ok', data: response.data };
  }
  return { state: 'error', erro: response.erro || 'Cadastro não localizado para este CNPJ.' };
}

/**
 * CEIS e CNEP são cadastros distintos e podem falhar em separado. Com
 * um dos dois de pé o bloco ainda diz algo verdadeiro — desde que a
 * contagem do que falhou não seja apresentada como zero, o que a tela
 * resolve mostrando cada cadastro com o seu próprio número. Só quando
 * os dois caem é que não há nada a afirmar.
 */
export function classifySanctions(
  ceis: SanctionsResult,
  cnep: SanctionsResult,
): PeekSource<PeekSanctions> {
  if (!ceis.ok && !cnep.ok) {
    return {
      state: 'error',
      erro: ceis.erro || cnep.erro || 'Os cadastros de sanção não responderam à consulta.',
    };
  }
  return { state: 'ok', data: { ceis, cnep } };
}

/**
 * A busca de publicações tem três desfechos, e eles não são o mesmo:
 *
 * - sem provedor configurado: não houve busca, e dizer "nada
 *   encontrado" seria falso;
 * - busca feita e nada achado: resultado legítimo;
 * - busca parcial: achou algo, mas a cobertura ficou incompleta — a
 *   tela sinaliza, sem descartar o que veio.
 */
export function classifyNews(summary: AdverseMediaSummary): PeekSource<AdverseMediaSummary> {
  if (summary.semChave) {
    return {
      state: 'error',
      data: summary,
      erro: summary.aviso || 'Busca de publicações não configurada no servidor.',
    };
  }
  if (summary.ok === false) {
    return {
      state: 'error',
      data: summary,
      erro: summary.aviso || 'A busca de publicações não foi concluída.',
    };
  }
  return { state: 'ok', data: summary };
}
