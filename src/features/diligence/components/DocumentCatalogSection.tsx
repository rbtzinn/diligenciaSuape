// ==========================================================
// DILIGÊNCIA 360 — Catálogo documental no dossiê
// ==========================================================
// Mostra os documentos que as fontes publicaram e, com o mesmo destaque, o que
// não foi possível obter.
//
// Cinco estados que uma lista comum colapsaria em "documentos":
//
//   DISPONÍVEL      o conteúdo foi obtido
//   REFERENCIADO    existe URL oficial e ninguém a abriu
//   INDISPONÍVEL    havia URL e o conteúdo não veio
//   SEM DOCUMENTO   a fonte respondeu e não publicou nada
//   ERRO            falha técnica
//
// "Referenciado" e "sem documento" são opostos, e "indisponível" nunca é
// apresentado como ausência. Nada aqui é risco: o catálogo mostra fato com
// origem, e a leitura pertence a quem analisa.
// ==========================================================

import React from 'react';
import { Chip } from '../../../components/ui/Chip';
import { Section } from '../../../components/ui/Section';
import { Note } from '../../../components/ui/Note';
import { Icons } from '../../../components/ui/Icons';
import type {
  DocumentIntelligenceSummary,
  CatalogedDocument,
  DocumentContentStatus,
  DocumentLinkConfidence,
  DatePrecision,
} from '../types';

interface DocumentCatalogSectionProps {
  summary?: DocumentIntelligenceSummary;
}

/** O rótulo distingue os cinco estados; o tom nunca sugere risco. */
const STATUS: Record<DocumentContentStatus, { label: string; tone: 'ok' | 'warn' | 'high' | 'neutral' }> = {
  AVAILABLE: { label: 'Documento disponível', tone: 'ok' },
  REFERENCED: { label: 'Referenciado pela fonte', tone: 'neutral' },
  UNAVAILABLE: { label: 'Conteúdo não obtido', tone: 'warn' },
  EMPTY: { label: 'Sem documento publicado', tone: 'neutral' },
  ERROR: { label: 'Erro ao verificar', tone: 'high' },
};

const TYPE_LABEL: Record<string, string> = {
  CONTRACT: 'Contrato',
  ADDITIVE: 'Termo aditivo',
  TENDER: 'Licitação',
  PROCESS: 'Processo',
  DECISION: 'Decisão',
  OTHER: 'Outro',
};

const LINK_LABEL: Record<DocumentLinkConfidence, string> = {
  CONFIRMED: 'vínculo confirmado',
  PROBABLE: 'vínculo provável',
  CONTEXTUAL: 'vínculo contextual',
  UNKNOWN: 'vínculo não determinado',
};

const PRECISION_LABEL: Record<DatePrecision, string> = {
  EXACT: 'data publicada pela fonte',
  APPROXIMATE: 'data aproximada, derivada da vigência',
  YEAR_ONLY: 'somente o ano é conhecido',
  UNKNOWN: 'data não informada pela fonte',
};

const EXTRACTION_LABEL: Record<string, string> = {
  NOT_ATTEMPTED: 'conteúdo não lido nesta fase',
  SUCCESS: 'conteúdo lido',
  ERROR: 'falha ao ler o conteúdo',
  OCR_REQUIRED: 'documento digitalizado — leitura exigiria OCR',
  NOT_APPLICABLE: 'não há conteúdo a ler',
};

const DocumentCard: React.FC<{ document: CatalogedDocument }> = ({ document }) => {
  const status = STATUS[document.contentStatus] ?? STATUS.REFERENCED;

  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface-subtle p-3">
      <header className="flex min-w-0 flex-wrap items-center gap-2">
        <Chip tone="neutral" size="sm">{TYPE_LABEL[document.documentType] ?? document.documentType}</Chip>
        <Chip tone={status.tone} size="sm">{status.label}</Chip>
        <Chip tone="neutral" size="sm">{LINK_LABEL[document.linkConfidence]}</Chip>
      </header>

      <strong className="min-w-0 text-sm font-semibold text-ink">{document.title}</strong>

      <div className="text-2xs leading-relaxed text-ink-3">
        {document.documentDate ?? document.documentYear ?? 'sem data'}
        {' · '}
        {PRECISION_LABEL[document.datePrecision]}
        {document.dateSource ? ` (${document.dateSource})` : ''}
      </div>

      <div className="text-2xs leading-relaxed text-ink-3">
        {EXTRACTION_LABEL[document.extractionStatus] ?? document.extractionStatus}
        {document.contentBytes ? ` · ${Math.round(document.contentBytes / 1024)} KB` : ''}
      </div>

      {/* O vínculo incerto é dito, não escondido. */}
      {document.linkConfidence !== 'CONFIRMED' ? (
        <p className="text-2xs leading-relaxed text-ink-3">{document.linkBasis}</p>
      ) : null}

      {document.contentStatus === 'UNAVAILABLE' || document.contentStatus === 'ERROR' ? (
        <Note tone="warn">{document.extractionNote}</Note>
      ) : null}

      {document.possibleDuplicate ? (
        <Note tone="warn">{document.possibleDuplicateNote}</Note>
      ) : null}

      {document.officialUrl ? (
        <a
          href={document.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          Documento oficial
          <Icons.ExternalLink size={12} aria-hidden="true" />
        </a>
      ) : null}

      {/* Metadados publicados no registro — não lidos do documento. */}
      {document.publishedMetadata.length > 0 ? (
        <details className="overflow-hidden rounded-md border border-line bg-surface">
          <summary className="cursor-pointer px-2.5 py-1.5 text-2xs font-semibold text-ink-2">
            Metadados publicados pela fonte ({document.publishedMetadata.length})
          </summary>
          <dl className="flex flex-col gap-1 px-2.5 pb-2 text-2xs">
            {document.publishedMetadata.map((item) => (
              <div key={item.field} className="flex min-w-0 flex-wrap gap-1">
                <dt className="font-mono font-semibold text-ink-3">{item.field}:</dt>
                <dd className="min-w-0 text-ink-2">{String(item.value)}</dd>
              </div>
            ))}
          </dl>
          <p className="px-2.5 pb-2 text-2xs leading-relaxed text-ink-3">
            Estes dados vêm do registro publicado pela fonte, e não da leitura do documento.
          </p>
        </details>
      ) : null}
    </article>
  );
};

export const DocumentCatalogSection: React.FC<DocumentCatalogSectionProps> = ({ summary }) => {
  if (!summary) return null;

  const { resumo, documentos, ausencias } = summary;

  return (
    <Section
      mark="D"
      title={`Documentos publicados pelas fontes (${resumo.total})`}
      subtitle="Referência, disponibilidade e origem — o conteúdo não é lido nesta fase"
    >
      <div className="flex min-w-0 flex-col gap-3">
        {/* Contagens por estado, lado a lado. */}
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
          {[
            ['Com URL oficial', resumo.comUrlOficial],
            ['Disponíveis', resumo.disponiveis],
            ['Referenciados', resumo.referenciados],
            ['Não obtidos', resumo.indisponiveis],
            ['Sem documento', resumo.vazios],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border border-line bg-surface-subtle p-2.5">
              <div className="text-lg font-bold text-ink">{value}</div>
              <div className="text-2xs text-ink-3">{label}</div>
            </div>
          ))}
        </div>

        {resumo.exigemOcr > 0 ? (
          <Note tone="warn" title={`${resumo.exigemOcr} documento(s) digitalizado(s).`}>
            O conteúdo está acessível, mas é imagem sem camada de texto. A leitura exigiria OCR, que não
            integra esta fase. Os documentos existem e os links oficiais permanecem disponíveis.
          </Note>
        ) : null}

        {/* Fonte indisponível nunca é apresentada como ausência de documento. */}
        {ausencias.map((ausencia) => (
          <Note
            key={ausencia.provider}
            tone={ausencia.documentStatus === 'UNAVAILABLE' ? 'warn' : 'neutral'}
            title={`${TYPE_LABEL[ausencia.documentType] ?? ausencia.documentType}: ${ausencia.sourceStatus}`}
          >
            {ausencia.nota}
          </Note>
        ))}

        {resumo.disponibilidadeNaoVerificada > 0 ? (
          <p className="text-2xs leading-relaxed text-ink-3">
            {resumo.disponibilidadeNaoVerificada} documento(s) não tiveram a disponibilidade verificada nesta
            execução. Não ter verificado não é o mesmo que estar indisponível.
          </p>
        ) : null}

        {documentos.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-ink-2">
              Documentos catalogados ({documentos.length})
            </summary>
            <div className="mt-2 flex min-w-0 flex-col gap-2">
              {documentos.map((document) => (
                <DocumentCard key={document.documentId} document={document} />
              ))}
            </div>
          </details>
        ) : null}

        <p className="border-t border-line-soft pt-3 text-2xs leading-relaxed text-ink-3">{summary.limitacao}</p>
      </div>
    </Section>
  );
};
