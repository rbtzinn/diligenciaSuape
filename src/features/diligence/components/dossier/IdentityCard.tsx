// ==========================================================
// DILIGÊNCIA 360 — Cabeçalho da ficha
// ==========================================================
// Era um cartão de três colunas com identidade, contadores e score.
// Virou o que um dossiê tem no alto: o nome grande, o carimbo do
// nível, e os campos do cadastro em linhas de rótulo e valor.
//
// O score saiu daqui. Ele ganhou painel próprio, escuro, logo abaixo:
// espremido numa terceira coluna, o número que decide a contratação
// tinha o mesmo peso visual do município da sede.
// ==========================================================

import React from 'react';
import type { DiligenceItem } from '../../types';
import type { StatusVariant } from '../../../../types';
import { DataList, DataRow, Stamp, StampTone } from '../../../../components/ui/Sheet';
import { Formatters } from '../../../../lib/formatters';

interface IdentityCardProps {
  diligence: DiligenceItem;
}

const STAMP_TONE: Record<StatusVariant, StampTone> = {
  low: 'ok',
  success: 'ok',
  medium: 'warn',
  high: 'high',
  critical: 'critical',
  info: 'neutral',
  primary: 'neutral',
  neutral: 'neutral',
};

/** "17/12/1991 · 34 anos" — a idade é o que se lê, a data é a prova. */
function openingLine(value?: string): string {
  const formatted = Formatters.date(value);
  if (!formatted || formatted === '—') return '—';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return formatted;
  const years = Math.floor((Date.now() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 1 ? `${formatted} · ${years} ${years === 1 ? 'ano' : 'anos'}` : formatted;
}

function addressLine(empresa: DiligenceItem['empresa']): string {
  const street = [empresa?.logradouro, empresa?.numero, empresa?.complemento]
    .filter(Boolean)
    .join(' ')
    .trim();
  const city = [empresa?.municipio, empresa?.uf].filter(Boolean).join('/');
  return [street, city].filter(Boolean).join(' — ') || '—';
}

export const IdentityCard: React.FC<IdentityCardProps> = ({ diligence }) => {
  const empresa = diligence.empresa || {};
  const risco = diligence.risco;
  const situacao = empresa.descricao_situacao_cadastral || '';
  const capital = Number(empresa.capital_social);

  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-extrabold leading-[1.1] tracking-tight text-ink sm:text-3xl">
        {diligence.razaoSocial || 'Empresa analisada'}
      </h1>

      <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {risco ? (
          <Stamp tone={risco.cor ? STAMP_TONE[risco.cor] ?? 'neutral' : 'neutral'}>{risco.nivel}</Stamp>
        ) : null}
        <span className="ficha-label text-ink-3">
          CNPJ <span className="num font-mono normal-case tracking-normal text-ink">{diligence.cnpjFmt}</span>
        </span>
        {situacao ? (
          <span
            className={`ficha-label border px-1.5 py-0.5 ${
              situacao.toUpperCase() === 'ATIVA'
                ? 'border-ok-line bg-ok-bg text-ok-text'
                : 'border-high-line bg-high-bg text-high-text'
            }`}
          >
            {situacao}
          </span>
        ) : null}
      </div>

      <DataList className="mt-4">
        {empresa.nome_fantasia ? <DataRow label="Nome fantasia" value={empresa.nome_fantasia} /> : null}
        {empresa.cnae_fiscal_descricao ? (
          <DataRow
            label="CNAE"
            value={
              <>
                {empresa.cnae_fiscal ? (
                  <span className="num mr-1.5 font-mono text-ink-3">{empresa.cnae_fiscal}</span>
                ) : null}
                {empresa.cnae_fiscal_descricao}
              </>
            }
          />
        ) : null}
        <DataRow label="Abertura" value={openingLine(empresa.data_inicio_atividade)} />
        {Number.isFinite(capital) && capital > 0 ? (
          <DataRow label="Capital social" value={Formatters.currency(capital)} mono />
        ) : null}
        {empresa.porte || empresa.natureza_juridica ? (
          <DataRow
            label="Porte e natureza"
            value={[empresa.porte, empresa.natureza_juridica].filter(Boolean).join(' · ')}
          />
        ) : null}
        <DataRow label="Endereço" value={addressLine(empresa)} />
        <DataRow label="Quadro societário" value={`${diligence.socios?.length || 0} integrante(s)`} />
      </DataList>
    </div>
  );
};
