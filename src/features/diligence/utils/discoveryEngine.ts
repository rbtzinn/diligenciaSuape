// ==========================================================
// DILIGÊNCIA 360 — Motor de Descoberta e Deduplicação Processual
// Regras puras de consolidação, proveniência e ciclo de vida
// ==========================================================

import { ExtractedCNJ, CNJ } from '../../../lib/cnj';
import { ProcessDiscovery, DiscoverySource, DiscoveryStatus, JudicialProcessItem } from '../types';

const TRIBUNAL_NAME_MAP: Record<string, string> = {
  '8.17': 'TJPE',
  '8.02': 'TJAL',
  '8.06': 'TJCE',
  '8.15': 'TJPB',
  '8.20': 'TJRN',
  '8.26': 'TJSP',
  '8.19': 'TJRJ',
  '4.05': 'TRF5',
  '4.01': 'TRF1',
  '4.02': 'TRF2',
  '4.03': 'TRF3',
  '5.06': 'TRT6',
  '5.01': 'TRT1',
  '5.02': 'TRT2',
  '5.03': 'TRT3',
};

function resolveTribunalSigla(digits: string): string {
  if (digits.length !== 20) return 'Tribunal';
  const j = digits.substring(13, 14);
  const tr = digits.substring(14, 16);
  return TRIBUNAL_NAME_MAP[`${j}.${tr}`] || `J.${j}.TR.${tr}`;
}

export const DiscoveryEngine = {
  /**
   * Integra e deduplica números CNJ descobertos com proveniência de fontes
   */
  mergeDiscoveredProcesses(
    currentList: ProcessDiscovery[],
    extractedList: ExtractedCNJ[],
    source: DiscoverySource,
    autoValidate = false
  ): { updatedList: ProcessDiscovery[]; newCount: number; mergedCount: number } {
    const listMap = new Map<string, ProcessDiscovery>();
    currentList.forEach((item) => listMap.set(item.processNumber, { ...item }));

    let newCount = 0;
    let mergedCount = 0;
    const now = new Date().toISOString();

    for (const ext of extractedList) {
      const clean = ext.normalized;
      if (listMap.has(clean)) {
        // Já existe: fundir fonte sem duplicar entradas idênticas
        const existing = listMap.get(clean)!;
        const hasSameSource = existing.sources.some(
          (s) => s.type === source.type && s.name === source.name && s.excerpt === source.excerpt
        );

        const updatedSources = hasSameSource ? existing.sources : [...existing.sources, source];

        listMap.set(clean, {
          ...existing,
          sources: updatedSources,
          lastUpdated: now,
          status: autoValidate && existing.status === 'candidate' ? 'validated' : existing.status,
        });
        mergedCount++;
      } else {
        // Novo candidato descoberto
        const newRecord: ProcessDiscovery = {
          id: clean,
          processNumber: clean,
          formattedProcessNumber: ext.formatted || CNJ.format(clean),
          tribunal: resolveTribunalSigla(clean),
          sources: [source],
          firstDiscoveredAt: now,
          lastUpdated: now,
          status: autoValidate ? 'validated' : 'candidate',
        };
        listMap.set(clean, newRecord);
        newCount++;
      }
    }

    return {
      updatedList: Array.from(listMap.values()),
      newCount,
      mergedCount,
    };
  },

  /**
   * Atualiza status de validação ou adiciona dados enriquecidos do DataJud
   */
  updateStatus(
    list: ProcessDiscovery[],
    processNumber: string,
    newStatus: DiscoveryStatus,
    dataJud?: JudicialProcessItem
  ): ProcessDiscovery[] {
    const clean = CNJ.clean(processNumber);
    const now = new Date().toISOString();

    return list.map((item) => {
      if (item.processNumber !== clean) return item;
      return {
        ...item,
        status: newStatus,
        lastUpdated: now,
        dataJud: dataJud || item.dataJud,
      };
    });
  },

  /**
   * Remove/desvincula processo descoberto
   */
  removeProcess(list: ProcessDiscovery[], processNumber: string): ProcessDiscovery[] {
    const clean = CNJ.clean(processNumber);
    return list.filter((item) => item.processNumber !== clean);
  },

  /**
   * Calcula estatísticas consolidadas do motor de descoberta
   */
  getStats(list: ProcessDiscovery[]) {
    const total = list.length;
    const candidates = list.filter((p) => p.status === 'candidate').length;
    const validated = list.filter((p) => p.status === 'validated').length;
    const enriched = list.filter((p) => p.status === 'enriched').length;
    const discarded = list.filter((p) => p.status === 'discarded').length;

    return { total, candidates, validated, enriched, discarded };
  },
};
