// ==========================================================
// DILIGÊNCIA 360 — Dados abertos do TCE-PE no dossiê
// ==========================================================
// Mostra o que foi coletado nos datasets do Tribunal e, com o mesmo destaque,
// o que NÃO foi possível consultar.
//
// A separação visual é a razão de este componente existir: DADO ENCONTRADO,
// FONTE INDISPONÍVEL e RESULTADO DESCARTADO são três coisas distintas que a
// mesma lista vazia esconderia. Nenhuma delas é risco — a tela apresenta fato
// com origem, e a leitura pertence a quem analisa.
// ==========================================================

import React from 'react';
import { Badge } from '../../../components/ui/Badge';
import type { SourceQueryStatus } from '../types';
import type { TceOpenDataSummary, TceProviderReport, ContractProfile, TimelineEntry } from '../types';

interface TcePeOpenDataSectionProps {
  summary?: TceOpenDataSummary;
}

const STATUS_LABEL: Record<SourceQueryStatus, string> = {
  SUCCESS: 'Consultada, com registros',
  EMPTY: 'Consultada, sem registros',
  PARTIAL: 'Consultada parcialmente',
  UNAVAILABLE: 'Não foi possível consultar',
  ERROR: 'Erro na consulta',
  NOT_APPLICABLE: 'Não se aplica',
};

/** Cor do selo reflete o estado da CONSULTA, nunca um juízo sobre a empresa. */
function statusVariant(status: SourceQueryStatus): 'high' | 'medium' | 'neutral' {
  if (status === 'UNAVAILABLE' || status === 'ERROR') return 'high';
  if (status === 'PARTIAL') return 'medium';
  return 'neutral';
}

function currency(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const ProviderRow: React.FC<{ report: TceProviderReport }> = ({ report }) => (
  <div
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '0.5rem', flexWrap: 'wrap', padding: '0.4rem 0',
      borderBottom: '1px solid var(--border-subtle, var(--border-default))',
    }}
  >
    <div style={{ minWidth: 0 }}>
      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>
        {report.providerLabel}
      </span>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginLeft: '0.4rem' }}>
        {report.endpoint}
      </span>
      {report.erros.length > 0 ? (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--status-critical-text)' }}>
          {report.erros[0]}
        </div>
      ) : null}
      {report.warnings.length > 0 ? (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)' }}>
          {report.warnings[0]}
        </div>
      ) : null}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)' }}>
        {report.quantidade} registro(s)
      </span>
      <Badge variant={statusVariant(report.status)} size="sm">
        {STATUS_LABEL[report.status] || report.status}
      </Badge>
    </div>
  </div>
);


/** Rótulo de cada natureza de evento. Descreve o fato, nunca um juízo. */
const EVENT_LABEL: Record<string, string> = {
  CONTRACT_CREATED: 'Contrato firmado',
  ADDITIVE: 'Termo aditivo',
  VALUE_ADDITION: 'Valor acrescido',
  VALUE_SUPPRESSION: 'Valor suprimido',
  TERM_EXTENSION: 'Vigência estendida',
  TERM_REDUCTION: 'Vigência reduzida',
  QUANTITATIVE_CHANGE: 'Alteração quantitativa',
  QUALITATIVE_CHANGE: 'Alteração qualitativa',
  TERMINATION: 'Rescisão registrada',
  PAYMENT: 'Pagamento',
  OTHER: 'Outro',
};


/**
 * Como cada data é apresentada.
 *
 * A distinção existe porque o TCE-PE não publica data de assinatura: escrever
 * "10/06/2024 — termo aditivo" sem ressalva afirmaria um fato que a fonte não
 * sustenta. O rótulo acompanha a data até os olhos de quem lê.
 */
const PRECISION_LABEL: Record<string, string> = {
  EXACT: 'data publicada pela fonte',
  APPROXIMATE: 'data aproximada, derivada da vigência',
  YEAR_ONLY: 'somente o ano é conhecido',
  UNKNOWN: 'data não informada pela fonte',
};

const TimelineRow: React.FC<{ entry: TimelineEntry }> = ({ entry }) => (
  <li style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
    <span
      className="font-mono"
      style={{ minWidth: '5.5rem', fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}
    >
      {entry.eventDate ?? (entry.eventYear ? `${entry.eventYear}` : 'sem data')}
    </span>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>
        {entry.label}
        {entry.value !== null ? (
          <span style={{ fontWeight: 'var(--font-normal)', color: 'var(--text-secondary)' }}>
            {' · '}
            {entry.value > 0 ? '+' : ''}{currency(entry.value)}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
        {entry.types.map((type) => EVENT_LABEL[type] ?? type).join(' · ')}
      </div>
      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
        {PRECISION_LABEL[entry.datePrecision] ?? entry.datePrecision}
        {entry.dateSource ? ` (${entry.dateSource})` : ''}
      </div>
      {entry.temporalConflict ? (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)' }}>
          {entry.conflitoNota}
        </div>
      ) : null}
      {entry.associationConfidence && entry.associationConfidence !== 'CONFIRMED' ? (
        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)' }}>
          Vínculo {entry.associationConfidence === 'UNCERTAIN' ? 'não confirmado' : 'provável'}:
          {' '}{entry.associationBasis}
        </div>
      ) : null}
      {entry.linkArquivo ? (
        <a href={entry.linkArquivo} target="_blank" rel="noreferrer" style={{ fontSize: 'var(--text-2xs)' }}>
          documento oficial
        </a>
      ) : null}
    </div>
  </li>
);

/**
 * Linha do tempo de um contrato. Mostra o que a fonte publica e declara
 * quando a ordenação está incompleta — data ausente não vira data provável.
 */
const ContractProfileCard: React.FC<{ profile: ContractProfile }> = ({ profile }) => {
  const { contrato, timeline, resumo } = profile;
  return (
    <article className="pncp-card">
      <header className="pncp-card-head">
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <Badge variant="neutral" size="sm">
            Contrato {contrato.numeroContrato ?? 's/n'}/{contrato.anoContrato ?? 's/a'}
          </Badge>
          {contrato.situacao ? <Badge variant="neutral" size="sm">{contrato.situacao}</Badge> : null}
          <Badge variant="neutral" size="sm">{resumo.totalAditivos} aditivo(s)</Badge>
        </div>
      </header>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
        {contrato.objeto ?? 'Objeto não informado pela fonte'}
      </p>
      <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
        {contrato.unidadeGestora ?? 'Unidade gestora não informada'}
        {contrato.municipio ? ` · ${contrato.municipio}` : ''}
        {contrato.vigenciaInicial ? ` · Vigência ${contrato.vigenciaInicial}` : ''}
        {contrato.vigenciaFinal ? ` a ${contrato.vigenciaFinal}` : ''}
        {' · Valor inicial '}
        {contrato.valorInicial === null ? 'não informado' : currency(contrato.valorInicial)}
      </div>

      {timeline.aviso ? (
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', marginTop: '0.4rem' }}>
          {timeline.aviso}
        </p>
      ) : null}

      <ul style={{ margin: '0.5rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {(profile.timelineDetalhada?.entries ?? []).map((entry) => (
          <TimelineRow key={entry.id} entry={entry} />
        ))}
      </ul>

      {profile.timelineDetalhada?.notasDeCobertura.map((nota) => (
        <p key={nota} style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', margin: '0.3rem 0 0' }}>
          {nota}
        </p>
      ))}

      {profile.timelineDetalhada ? (
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', margin: '0.3rem 0 0' }}>
          {profile.timelineDetalhada.vigencia.nota}
        </p>
      ) : null}
    </article>
  );
};

const ContractProfileList: React.FC<{ profiles: ContractProfile[] }> = ({ profiles }) => {
  if (profiles.length === 0) return null;
  return (
    <details style={{ marginTop: '0.5rem' }}>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>
        Contratos e seus eventos ({profiles.length})
      </summary>
      <div className="pncp-stack" style={{ marginTop: '0.4rem' }}>
        {profiles.map((profile) => <ContractProfileCard key={profile.contrato.id} profile={profile} />)}
      </div>
    </details>
  );
};

export const TcePeOpenDataSection: React.FC<TcePeOpenDataSectionProps> = ({ summary }) => {
  if (!summary) return null;

  const resumo = summary.resumo;
  const indisponiveis = summary.providers.filter(
    (report) => report.status === 'UNAVAILABLE' || report.status === 'ERROR',
  );

  return (
    <section className="pncp-section" aria-labelledby="tce-open-data-title">
      <h3 id="tce-open-data-title">Dados abertos do TCE-PE</h3>
      <p className="pncp-hint">
        Contratos, termos aditivos, licitações, obras e despesas publicados pelo Tribunal. Diferente da base de
        processos, estes registros trazem o CPF/CNPJ do contratado, e a identidade é confirmada pelo próprio
        documento da fonte.
      </p>

      {summary.sourceStatus === 'NOT_APPLICABLE' ? (
        <div className="pncp-notice">
          <strong>Consulta não aplicável.</strong>
          <p>{summary.erro}</p>
        </div>
      ) : null}

      {!summary.ok && summary.sourceStatus !== 'NOT_APPLICABLE' ? (
        <div className="pncp-notice pncp-notice-error">
          <strong>Dados abertos do TCE-PE indisponíveis.</strong>
          <p>
            {summary.erro || 'Nenhum dataset respondeu nesta execução.'} A ausência de registros na tela não
            significa que a empresa não possua contratos, obras ou despesas no Tribunal.
          </p>
        </div>
      ) : null}

      {/* DADO ENCONTRADO — contagens por eixo. */}
      {resumo ? (
        <div
          style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: '0.5rem', margin: '0.75rem 0',
          }}
        >
          {[
            ['Contratos', resumo.contratos],
            ['Termos aditivos', resumo.aditivos],
            ['Licitações', resumo.licitacoes],
            ['Obras', resumo.obras],
            ['Despesas', resumo.despesas],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              style={{
                padding: '0.6rem 0.7rem', background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>{value}</div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)' }}>{label}</div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Estágios da despesa separados: somá-los contaria o mesmo dinheiro três vezes. */}
      {resumo && resumo.despesas > 0 ? (
        <div className="pncp-notice">
          <strong>Execução orçamentária registrada</strong>
          <p>
            Empenhado {currency(resumo.valorEmpenhado)} · Liquidado {currency(resumo.valorLiquidado)} ·
            Pago {currency(resumo.valorPago)}. Os três estágios são apresentados separadamente porque
            representam momentos distintos da despesa, e não valores somáveis.
          </p>
        </div>
      ) : null}

      {/* RESULTADO DESCARTADO — registro de outro CNPJ, mantido auditável. */}
      {resumo && resumo.descartados > 0 ? (
        <div className="pncp-notice">
          <strong>{resumo.descartados} registro(s) descartado(s) por incompatibilidade de identidade.</strong>
          <p>
            O nome empresarial coincide, mas o CPF/CNPJ publicado pela fonte é de outra pessoa jurídica —
            tipicamente uma homônima de outra praça. Não entram nas contagens acima e permanecem registrados
            para conferência.
          </p>
        </div>
      ) : null}

      {/* FONTE INDISPONÍVEL — destacada, nunca lida como ausência de registro. */}
      {indisponiveis.length > 0 ? (
        <div className="pncp-notice pncp-notice-warning">
          <strong>{indisponiveis.length} fonte(s) não puderam ser consultadas.</strong>
          <p>
            {indisponiveis.map((report) => report.providerLabel).join('; ')}. Lacuna de cobertura: o que não foi
            consultado não pode ser interpretado como ausência de ocorrência.
          </p>
        </div>
      ) : null}

      {summary.providers.length > 0 ? (
        <details style={{ marginTop: '0.5rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)' }}>
            Estado de cada fonte consultada ({summary.providers.length})
          </summary>
          <div style={{ marginTop: '0.4rem' }}>
            {summary.providers.map((report) => (
              <ProviderRow key={report.provider} report={report} />
            ))}
          </div>
        </details>
      ) : null}

      <ContractProfileList profiles={summary.contractIntelligence?.contratos ?? []} />

      {summary.contractIntelligence && summary.contractIntelligence.resumo.aditivosOrfaos > 0 ? (
        <p className="pncp-hint">
          {summary.contractIntelligence.resumo.aditivosOrfaos} termo(s) aditivo(s) cujo contrato de origem não
          veio nesta coleta. Preservados, porque o termo existe e é registro oficial.
        </p>
      ) : null}

      {summary.limitacao ? <p className="pncp-disclaimer">{summary.limitacao}</p> : null}
    </section>
  );
};
