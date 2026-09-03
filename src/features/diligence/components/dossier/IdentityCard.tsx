// ==========================================================
// DILIGÊNCIA 360 — Cartão de identificação do dossiê
// Identidade, contadores de cobertura e decisão sugerida.
// ==========================================================

import React from 'react';
import type { DiligenceItem } from '../../types';
import type { SourceCoverageItem } from './sourceCoverage';
import { summarizeCoverage } from './sourceCoverage';

interface IdentityCardProps {
  diligence: DiligenceItem;
  coverage: SourceCoverageItem[];
}

const Fact: React.FC<{ label: string; value: string; tone?: 'ok' | 'bad' | 'muted' }> = ({
  label,
  value,
  tone,
}) => (
  <div>
    <div className="text-[11px] text-ink-3">{label}</div>
    <div
      className={[
        'mt-0.5 text-[14px] font-bold',
        tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-high' : 'text-ink',
      ].join(' ')}
    >
      {value}
    </div>
  </div>
);

function formatDateTime(value?: string) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR');
}

export const IdentityCard: React.FC<IdentityCardProps> = ({ diligence, coverage }) => {
  const resumo = summarizeCoverage(coverage);
  const risco = diligence.risco;
  const empresa = diligence.empresa || {};

  return (
    <section className="mt-4 grid gap-4 rounded-card border border-line bg-surface p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,2fr)_auto] lg:items-center">
      <div>
        <span className="mb-2 inline-block rounded border border-brand-line bg-brand-soft px-2 py-0.5 text-[11px] text-brand">
          CNPJ
        </span>
        <div className="font-mono text-[19px] font-bold text-ink">{diligence.cnpjFmt}</div>
        <div className="mt-0.5 text-[13px] text-ink-3">{diligence.razaoSocial}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
        <Fact label="Situação cadastral" value={empresa.descricao_situacao_cadastral || '—'} />
        <Fact label="Município" value={[empresa.municipio, empresa.uf].filter(Boolean).join('/') || '—'} />
        <Fact label="Consultado em" value={formatDateTime(diligence.companyConsultedAt || diligence.dataAnalise)} />
        <Fact label="Fontes com resultado" value={String(resumo['com-achado']).padStart(2, '0')} tone="ok" />
        <Fact label="Fontes sem resultado" value={String(resumo['sem-achado']).padStart(2, '0')} />
        {/* Fonte sem resposta é lacuna e precisa ser lida junto da decisão. */}
        <Fact
          label="Fontes sem resposta"
          value={String(resumo.falhou + resumo['nao-consultada']).padStart(2, '0')}
          tone={resumo.falhou > 0 ? 'bad' : 'muted'}
        />
      </div>

      <div className="border-t border-line-soft pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 lg:text-center">
        <div className="font-mono text-[30px] font-bold leading-none text-brand">{risco?.score ?? '—'}</div>
        <div className="mt-1 font-mono text-[11px] text-ink-3">de 100 · {risco?.nivel || 'não calculado'}</div>
        <div className="mt-1.5 max-w-[190px] text-[13px] font-bold text-ink lg:mx-auto">
          {risco?.decisao || '—'}
        </div>
      </div>
    </section>
  );
};
