// ==========================================================
// DILIGÊNCIA 360 — Linhas dos cartões de evidência
// Funções puras que transformam cada fonte nas linhas do cartão.
// ==========================================================

import type { DiligenceItem } from '../../types';
import type { EvidenceRow } from './EvidenceCard';

const MAX_ROWS = 3;

function compactCurrency(value?: number | null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (numeric >= 1_000_000) return `R$ ${(numeric / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (numeric >= 1_000) return `R$ ${(numeric / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function shortDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('pt-BR');
}

export function contractRows(diligence: DiligenceItem): EvidenceRow[] {
  const contratos = diligence.pncp?.contratos || [];
  return [...contratos]
    .sort((left, right) => (Number(right.valorGlobal) || 0) - (Number(left.valorGlobal) || 0))
    .slice(0, MAX_ROWS)
    .map((contrato, index) => ({
      id: contrato.numeroControlePncp || `contrato-${index}`,
      title: contrato.numeroContrato || 'Contrato sem número',
      detail: [contrato.orgao, shortDate(contrato.vigenciaFim) ? `até ${shortDate(contrato.vigenciaFim)}` : null]
        .filter(Boolean)
        .join(' · '),
      value: compactCurrency(contrato.valorGlobal),
    }));
}

export function externalControlRows(diligence: DiligenceItem): EvidenceRow[] {
  const processos = diligence.tcePe?.processos || [];
  return processos.slice(0, MAX_ROWS).map((processo, index) => {
    const irregular = /IRREGULAR/i.test(processo.outcome || '');
    return {
      id: processo.rawProcessNumber || `tce-${index}`,
      title: [processo.processNumber, processo.type].filter(Boolean).join(' · '),
      detail: [processo.organization, processo.exercise].filter(Boolean).join(' · '),
      tag: {
        label: irregular ? 'Irregular' : processo.status || 'Em análise',
        tone: irregular ? 'red' as const : 'neutral' as const,
      },
    };
  });
}

export function shareholderRows(diligence: DiligenceItem): EvidenceRow[] {
  const socios = diligence.socios || [];
  // Um candidato em busca nominal é hipótese de homônimo, nunca sanção
  // confirmada da pessoa: a etiqueta precisa dizer isso.
  const candidatosPorNome = new Map(
    (diligence.personSanctions?.resultados || []).map((item) => [
      item.nome,
      item.candidatos?.length || 0,
    ]),
  );

  return socios.slice(0, MAX_ROWS).map((socio, index) => {
    const candidatos = candidatosPorNome.get(socio.nome_socio) || 0;
    return {
      id: `${socio.nome_socio}-${index}`,
      title: socio.nome_socio,
      detail: [
        socio.qualificacao_socio,
        shortDate(socio.data_entrada_sociedade) ? `desde ${shortDate(socio.data_entrada_sociedade)}` : null,
      ].filter(Boolean).join(' · '),
      tag: candidatos > 0
        ? { label: `${candidatos} a revisar`, tone: 'neutral' as const }
        : { label: 'Sem candidato', tone: 'green' as const },
    };
  });
}
