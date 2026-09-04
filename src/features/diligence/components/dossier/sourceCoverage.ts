// ==========================================================
// DILIGÊNCIA 360 — Cobertura das fontes do dossiê
// ==========================================================
// Função pura: lê o dossiê e diz, para cada fonte, o que aconteceu.
//
// A distinção que importa é entre "consultado e nada existe" e "a fonte não
// respondeu". As duas terminam com zero resultado na tela e significam o
// oposto: a primeira sustenta uma decisão, a segunda é uma lacuna. O backend
// já registra essa diferença; até aqui ela nunca chegava à interface.
// ==========================================================

import type { DiligenceItem } from '../../types';
import type { SourceQueryStatus } from '../../types/sourceStatus.types';

export type SourceStatus = 'com-achado' | 'sem-achado' | 'falhou' | 'nao-consultada';

export interface SourceCoverageItem {
  id: string;
  label: string;
  status: SourceStatus;
  detail?: string;
}

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  'com-achado': 'Com achado',
  'sem-achado': 'Sem achado',
  falhou: 'Não respondeu',
  'nao-consultada': 'Não consultada',
};

/** Fonte que devolve `ok` e uma contagem resolve os quatro estados sozinha. */
function fromCount(
  consulted: boolean,
  ok: boolean | undefined,
  count: number,
  detail?: string,
): { status: SourceStatus; detail?: string } {
  if (!consulted) return { status: 'nao-consultada' };
  if (ok === false) return { status: 'falhou', detail };
  return { status: count > 0 ? 'com-achado' : 'sem-achado', detail };
}

export function deriveSourceCoverage(diligence: DiligenceItem): SourceCoverageItem[] {
  const items: SourceCoverageItem[] = [];
  const add = (id: string, label: string, resolved: { status: SourceStatus; detail?: string }) => {
    items.push({ id, label, ...resolved });
  };

  add('cadastro', 'Cadastro (Receita)', {
    status: diligence.empresa?.cnpj ? 'com-achado' : 'falhou',
  });

  add('societario', 'Quadro societário', {
    status: (diligence.socios?.length || 0) > 0 ? 'com-achado' : 'sem-achado',
    detail: `${diligence.socios?.length || 0} integrante(s)`,
  });

  // Sem chave da CGU a fonte fica indisponível, o que não é ausência de sanção.
  for (const [id, label, result] of [
    ['ceis', 'CEIS', diligence.ceis],
    ['cnep', 'CNEP', diligence.cnep],
  ] as const) {
    if (!result) add(id, label, { status: 'nao-consultada' });
    else if (result.semChave) add(id, label, { status: 'falhou', detail: 'Credencial da CGU ausente' });
    else add(id, label, fromCount(true, result.ok, result.quantidade || 0, result.erro));
  }

  const personSanctions = diligence.personSanctions;
  add('sancoes-pessoas', 'Sanções de sócios', personSanctions
    ? fromCount(
      personSanctions.coverageStatus !== 'NOT_APPLICABLE',
      personSanctions.ok,
      personSanctions.totalCandidates || 0,
      personSanctions.limitacao || personSanctions.erro,
    )
    : { status: 'nao-consultada' });

  const pepCount = (diligence.pepResults || []).reduce((total, item) => total + (item.quantidade || 0), 0);
  add('pep', 'Pessoas expostas politicamente', {
    status: (diligence.pepResults?.length || 0) === 0
      ? 'nao-consultada'
      : pepCount > 0 ? 'com-achado' : 'sem-achado',
  });

  const judicialCount = (diligence.processosJudiciais?.length || 0)
    + (diligence.processosDescobertos?.length || 0);
  add('judicial', 'Processos judiciais (DataJud)', {
    status: !diligence.processDiscoveryExecuted && judicialCount === 0
      ? 'nao-consultada'
      : judicialCount > 0 ? 'com-achado' : 'sem-achado',
  });

  // O `sourceStatus` do backend é a resposta direta desta pergunta. Quando
  // presente, ele vence a inferência por contagem: `EMPTY` e `UNAVAILABLE`
  // produzem a mesma lista vazia e não podem colapsar no mesmo rótulo.
  const fromSourceStatus = (
    status: SourceQueryStatus | undefined,
    detail?: string,
  ): { status: SourceStatus; detail?: string } | null => {
    switch (status) {
      case 'SUCCESS': return { status: 'com-achado', detail };
      case 'EMPTY': return { status: 'sem-achado', detail };
      case 'PARTIAL': return { status: 'com-achado', detail: detail || 'Cobertura parcial' };
      case 'UNAVAILABLE':
      case 'ERROR': return { status: 'falhou', detail };
      case 'NOT_APPLICABLE': return { status: 'nao-consultada', detail: detail || 'Não se aplica a esta entidade' };
      default: return null;
    }
  };

  add('pncp', 'Contratos públicos (PNCP)', diligence.pncp
    ? fromSourceStatus(diligence.pncp.sourceStatus, diligence.pncp.erro)
      ?? fromCount(true, diligence.pncp.ok, diligence.pncp.resumo?.confirmados || 0, diligence.pncp.erro)
    : { status: 'nao-consultada' });

  add('tce-pe', 'Controle externo (TCE-PE)', diligence.tcePe
    ? fromSourceStatus(diligence.tcePe.sourceStatus, diligence.tcePe.erro)
      ?? fromCount(true, diligence.tcePe.ok, diligence.tcePe.processos?.length || 0, diligence.tcePe.erro)
    : { status: 'nao-consultada' });

  const federal = diligence.federalExposure;
  add('recursos-federais', 'Recursos federais', federal
    ? federal.semChave
      ? { status: 'falhou', detail: 'Credencial do Portal da Transparência ausente' }
      : fromCount(
        true,
        federal.ok,
        (federal.resumo?.contratosConfirmados || 0) + (federal.resumo?.recursosRecebidos || 0),
        federal.erro,
      )
    : { status: 'nao-consultada' });

  const media = diligence.adverseMedia;
  const mediaResults = (media?.results || []).filter((item) => item.status !== 'discarded').length;
  add('midia', 'Notícias e web', media
    ? media.coverageStatus === 'UNAVAILABLE'
      ? { status: 'falhou', detail: media.aviso }
      : {
        status: mediaResults > 0 ? 'com-achado' : 'sem-achado',
        detail: media.consultaParcial || media.deadlineExceeded ? 'Cobertura parcial' : undefined,
      }
    : { status: 'nao-consultada' });

  add('diarios', 'Diários oficiais', diligence.officialGazettes
    ? fromSourceStatus(diligence.officialGazettes.sourceStatus, diligence.officialGazettes.erro)
      ?? fromCount(true, diligence.officialGazettes.ok, diligence.officialGazettes.results?.length || 0, diligence.officialGazettes.erro)
    : { status: 'nao-consultada' });

  add('rede', 'Rede societária', diligence.corporateNetwork
    ? fromCount(true, diligence.corporateNetwork.ok, Math.max(0, (diligence.corporateNetwork.companies?.length || 0) - 1), diligence.corporateNetwork.erro)
    : { status: 'nao-consultada' });

  add('offshore', 'Offshore Leaks', diligence.offshore
    ? fromCount(true, diligence.offshore.ok, diligence.offshore.candidates?.length || 0, diligence.offshore.erro)
    : { status: 'nao-consultada' });

  return items;
}

/** Contagem por estado, para o resumo da faixa de cobertura. */
export function summarizeCoverage(items: SourceCoverageItem[]) {
  const tally = { 'com-achado': 0, 'sem-achado': 0, falhou: 0, 'nao-consultada': 0 } as Record<SourceStatus, number>;
  for (const item of items) tally[item.status] += 1;
  return {
    ...tally,
    total: items.length,
    // Uma decisão tomada sobre cobertura incompleta precisa ser tomada sabendo disso.
    completa: tally.falhou === 0 && tally['nao-consultada'] === 0,
  };
}
