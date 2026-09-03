// ==========================================================
// DILIGÊNCIA 360 — Indicadores do topo do dossiê
// ==========================================================
// Quatro números que respondem, de relance, o tamanho da exposição.
// Função pura: nenhum deles é calculado dentro de componente.
// ==========================================================

import type { DiligenceItem } from '../../types';

export interface DossierKpi {
  id: string;
  label: string;
  value: string;
  note: string;
}

/** Valores altos ficam ilegíveis por extenso num cartão estreito. */
function compactCurrency(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'R$ 0';
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function deriveDossierKpis(diligence: DiligenceItem): DossierKpi[] {
  const pncp = diligence.pncp;
  const contratos = pncp?.resumo?.confirmados || 0;
  const orgaos = pncp?.resumo?.orgaosDistintos || 0;

  const sancoes = (diligence.ceis?.quantidade || 0) + (diligence.cnep?.quantidade || 0);
  const vigentes = (diligence.ceis?.vigentes || 0) + (diligence.cnep?.vigentes || 0);
  // Fonte sem credencial não é zero sanção: é sanção não verificada.
  const sancoesIndisponivel = diligence.ceis?.semChave || diligence.cnep?.semChave
    || diligence.ceis?.ok === false || diligence.cnep?.ok === false;

  const tce = diligence.tcePe;
  const processosTce = tce?.processos?.length || 0;
  const irregulares = tce?.resumo?.resultadosIrregulares || 0;

  return [
    {
      id: 'contratos',
      label: 'Contratos',
      value: pncp?.ok ? String(contratos) : '—',
      note: pncp?.ok ? `em ${orgaos} órgão${orgaos === 1 ? '' : 's'}` : 'PNCP não respondeu',
    },
    {
      id: 'valor',
      label: 'Valor vigente',
      value: pncp?.ok ? compactCurrency(pncp.resumo?.valorTotalConfirmado || 0) : '—',
      note: pncp?.ok ? 'soma confirmada' : 'não apurado',
    },
    {
      id: 'sancoes',
      label: 'Sanções',
      value: sancoesIndisponivel ? '—' : String(sancoes),
      note: sancoesIndisponivel
        ? 'CEIS/CNEP indisponível'
        : sancoes === 0
          ? 'CEIS e CNEP'
          : `${vigentes} vigente${vigentes === 1 ? '' : 's'}`,
    },
    {
      id: 'tce',
      label: 'TCE-PE',
      value: tce?.ok ? String(processosTce) : '—',
      note: tce?.ok
        ? irregulares > 0 ? `${irregulares} irregular${irregulares === 1 ? '' : 'es'}` : 'sem irregularidade'
        : 'não consultado',
    },
  ];
}
