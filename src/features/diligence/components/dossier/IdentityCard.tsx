// ==========================================================
// DILIGÊNCIA 360 — Cartão de identificação do dossiê
// ==========================================================
// Identidade, contadores de cobertura e decisão sugerida.
//
// Duas correções de leitura. O score aparecia em monoespaçado, o que
// o fazia parecer código de sistema; e era sempre azul da marca,
// mesmo quando o nível dizia "Atenção Crítica" — número e cor
// contavam histórias diferentes. O nível já vem classificado do
// motor de risco (`risco.cor`), então agora é ele que pinta o bloco.
// ==========================================================

import React from 'react';
import type { DiligenceItem } from '../../types';
import type { StatusVariant } from '../../../../types';
import type { SourceCoverageItem } from './sourceCoverage';
import { summarizeCoverage } from './sourceCoverage';
import { Fact, FactGrid, FactTone, Stat } from '../../../../components/ui/Facts';
import { Chip } from '../../../../components/ui/Chip';

interface IdentityCardProps {
  diligence: DiligenceItem;
  coverage: SourceCoverageItem[];
}

/** Nível de atenção do motor de risco → tom visual do bloco. */
const RISK_TONE: Record<StatusVariant, FactTone> = {
  low: 'ok',
  success: 'ok',
  medium: 'warn',
  high: 'high',
  critical: 'critical',
  info: 'default',
  primary: 'default',
  neutral: 'muted',
};

function formatDateTime(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR');
}

/** Contador de duas casas: "04" alinha com "12" na mesma coluna. */
function pad(value: number) {
  return String(value).padStart(2, '0');
}

export const IdentityCard: React.FC<IdentityCardProps> = ({ diligence, coverage }) => {
  const resumo = summarizeCoverage(coverage);
  const risco = diligence.risco;
  const empresa = diligence.empresa || {};
  const semResposta = resumo.falhou + resumo['nao-consultada'];

  return (
    <section className="grid min-w-0 gap-4 rounded-card border border-line bg-surface p-4 shadow-xs lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(200px,auto)] lg:items-start lg:gap-5">
      {/* ---- Identidade ---- */}
      <div className="min-w-0">
        <Chip tone="brand" size="sm">
          CNPJ
        </Chip>
        <p className="mt-1.5 font-mono text-lg font-bold leading-tight text-ink">{diligence.cnpjFmt}</p>
        <p className="mt-1 text-sm leading-snug text-ink-2">{diligence.razaoSocial}</p>
      </div>

      {/* ---- Cobertura e cadastro ---- */}
      <FactGrid columns={3} className="min-w-0 lg:border-l lg:border-line-soft lg:pl-5">
        <Fact label="Situação cadastral" value={empresa.descricao_situacao_cadastral || '—'} />
        <Fact label="Município" value={[empresa.municipio, empresa.uf].filter(Boolean).join('/') || '—'} />
        <Fact
          label="Consultado em"
          value={formatDateTime(diligence.companyConsultedAt || diligence.dataAnalise)}
        />
        <Fact label="Fontes com resultado" value={pad(resumo['com-achado'])} tone="ok" />
        <Fact label="Fontes sem resultado" value={pad(resumo['sem-achado'])} />
        {/* Fonte sem resposta é lacuna, e precisa ser lida junto da
            decisão — não como um zero a mais na contagem. */}
        <Fact
          label="Fontes sem resposta"
          value={pad(semResposta)}
          tone={resumo.falhou > 0 ? 'high' : 'muted'}
          hint={resumo.falhou > 0 ? 'Cobertura incompleta' : undefined}
        />
      </FactGrid>

      {/* ---- Decisão ---- */}
      <Stat
        value={risco?.score ?? '—'}
        caption={`de 100 · ${risco?.nivel || 'não calculado'}`}
        decision={risco?.decisao || '—'}
        tone={risco?.cor ? RISK_TONE[risco.cor] ?? 'default' : 'muted'}
        className="lg:min-w-[200px]"
      />
    </section>
  );
};
