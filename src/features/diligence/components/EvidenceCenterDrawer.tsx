// ==========================================================
// DILIGÊNCIA 360 — Central de evidências assistidas
// ==========================================================
// A regra que a tela existe para sustentar não muda: vínculo,
// menção, processo ou classificação PEP não representam culpa, e só
// evidência confirmada por uma pessoa alimenta o EGOS e a IA. A fila
// de revisão, a ficha de decisão e o histórico de alterações seguem
// exatamente como estavam.
//
// O que muda é a pele. A tela nasceu com o mesmo problema que o
// resto do app tinha: 83 linhas próprias em dossier-v3/evidence.css,
// com paleta em hexadecimal fora da identidade, um token que não
// existe (`--suape-ink`) e corpos de texto de 8, 8.5, 9, 9.5, 10 e
// 10.5px — abaixo do menor degrau da escala e, nos dois primeiros,
// no limite do ilegível. Agora ela usa as seções, os campos e os
// selos do projeto.
// ==========================================================

import React, { useMemo, useState } from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import { Icons } from '../../../components/ui/Icons';
import { Section } from '../../../components/ui/Section';
import { Chip, ChipTone } from '../../../components/ui/Chip';
import { Note } from '../../../components/ui/Note';
import { Button } from '../../../components/ui/Button';
import { Toolbar } from '../../../components/ui/Toolbar';
import { TextField, TextArea, Select } from '../../../components/ui/Field';
import { cn } from '../../../lib/cn';
import { EvidenceCenterApi, type EvidenceMutationInput } from '../services/evidence-center.service';
import type {
  AssistedEvidence,
  DiligenceItem,
  EvidenceCenter,
  EvidenceRelationType,
  EvidenceType,
  EvidenceValidationStatus,
  EgosSnapshot,
} from '../types';

interface EvidenceCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  diligence: DiligenceItem;
  onChange: (evidenceCenter: EvidenceCenter, egos: EgosSnapshot) => void;
}

const TYPE_LABELS: Record<EvidenceType, string> = {
  LINK_OFICIAL: 'Link oficial',
  NOTICIA: 'Notícia',
  DECISAO: 'Acórdão ou decisão',
  DIARIO_OFICIAL: 'Diário oficial',
  CERTIDAO: 'Certidão',
  CONTRATO_EDITAL: 'Contrato ou edital',
  PROCESSO: 'Número de processo',
  TEXTO_ANALISTA: 'Texto do analista',
  PDF: 'PDF',
};

const STATUS_LABELS: Record<EvidenceValidationStatus, string> = {
  PENDENTE_REVISAO: 'Pendente de revisão',
  CONFIRMADA: 'Confirmada',
  DESCARTADA: 'Descartada',
};

const RELATION_LABELS: Record<EvidenceRelationType, string> = {
  MENCIONADA_EM: 'Mencionada em',
  INTERESSADA_EM: 'Interessada em',
  CONTRATADA_POR: 'Contratada por',
  SANCIONADA_POR: 'Sancionada por',
  RESPONSABILIZADA_EM: 'Responsabilizada em',
  SOCIA_DE: 'Sócia de',
  ADMINISTRADA_POR: 'Administrada por',
  CITADA_COM: 'Citada com',
  DOCUMENTO_RELACIONADO: 'Documento relacionado',
};

/** Situação da evidência → tom visual. Pendente nunca é verde. */
const STATUS_TONE: Record<EvidenceValidationStatus, ChipTone> = {
  PENDENTE_REVISAO: 'warn',
  CONFIRMADA: 'ok',
  DESCARTADA: 'muted',
};

/** Traço à esquerda do cartão, repetindo o tom do selo. */
const STATUS_EDGE: Record<EvidenceValidationStatus, string> = {
  PENDENTE_REVISAO: 'border-l-warn',
  CONFIRMADA: 'border-l-ok',
  DESCARTADA: 'border-l-line-strong opacity-80',
};

const TYPE_OPTIONS = (Object.entries(TYPE_LABELS) as [EvidenceType, string][])
  .map(([value, label]) => ({ value, label }));
const RELATION_OPTIONS = (Object.entries(RELATION_LABELS) as [EvidenceRelationType, string][])
  .map(([value, label]) => ({ value, label }));
const STATUS_OPTIONS = (Object.entries(STATUS_LABELS) as [EvidenceValidationStatus, string][])
  .map(([value, label]) => ({ value, label }));

const MAX_PDF_BYTES = 25 * 1024 * 1024;

interface Draft {
  type: EvidenceType;
  title: string;
  source: string;
  url: string;
  originReference: string;
  documentDate: string;
  excerpt: string;
  relevantPages: string;
  hash: string;
  relatedEntity: string;
  relatedEntityType: 'company' | 'person' | 'organization';
  relatedCnpj: string;
  relatedProcess: string;
  sourceQuality: AssistedEvidence['sourceQuality'];
  matchStrength: AssistedEvidence['matchStrength'];
  relationType: EvidenceRelationType;
  analystNote: string;
  fileName: string;
  fileSize: number | null;
  pageCount: string;
  extractionStatus: AssistedEvidence['file']['extractionStatus'];
  decisionAgency: string;
  decisionNumber: string;
  decisionRapporteur: string;
  decisionInterestedParties: string;
  decisionObject: string;
  decisionCompanyRole: AssistedEvidence['decision']['companyRole'];
  decisionResponsiblePerson: string;
  decisionIrregularity: string;
  decisionPenalty: string;
  decisionDebt: string;
  decisionAmount: string;
  decisionReferredToProsecutor: boolean;
  decisionDebarment: boolean;
  decisionContractingImpediment: boolean;
  decisionAppealStatus: string;
  decisionDispositive: string;
  decisionConclusion: string;
}

function emptyDraft(diligence: DiligenceItem): Draft {
  return {
    type: 'LINK_OFICIAL',
    title: '',
    source: '',
    url: '',
    originReference: '',
    documentDate: '',
    excerpt: '',
    relevantPages: '',
    hash: '',
    relatedEntity: diligence.razaoSocial,
    relatedEntityType: 'company',
    relatedCnpj: diligence.cnpj,
    relatedProcess: '',
    sourceQuality: 'OFICIAL_PRIMARIA',
    matchStrength: 'MEDIA',
    relationType: 'MENCIONADA_EM',
    analystNote: '',
    fileName: '',
    fileSize: null,
    pageCount: '',
    extractionStatus: 'NAO_TENTADO',
    decisionAgency: '',
    decisionNumber: '',
    decisionRapporteur: '',
    decisionInterestedParties: '',
    decisionObject: '',
    decisionCompanyRole: 'MENCIONADA',
    decisionResponsiblePerson: '',
    decisionIrregularity: '',
    decisionPenalty: '',
    decisionDebt: '',
    decisionAmount: '',
    decisionReferredToProsecutor: false,
    decisionDebarment: false,
    decisionContractingImpediment: false,
    decisionAppealStatus: '',
    decisionDispositive: '',
    decisionConclusion: '',
  };
}

function draftFrom(item: AssistedEvidence): Draft {
  return {
    type: item.type,
    title: item.title,
    source: item.source,
    url: item.url,
    originReference: item.originReference,
    documentDate: item.documentDate ? item.documentDate.slice(0, 10) : '',
    excerpt: item.excerpt,
    relevantPages: item.relevantPages.join(', '),
    hash: item.hash,
    relatedEntity: item.relatedEntity,
    relatedEntityType: item.relatedEntityType,
    relatedCnpj: item.relatedCnpj,
    relatedProcess: item.relatedProcess,
    sourceQuality: item.sourceQuality,
    matchStrength: item.matchStrength,
    relationType: item.relationType,
    analystNote: item.analystNote,
    fileName: item.file.name,
    fileSize: item.file.sizeBytes,
    pageCount: item.file.pageCount ? String(item.file.pageCount) : '',
    extractionStatus: item.file.extractionStatus,
    decisionAgency: item.decision.agency,
    decisionNumber: item.decision.decisionNumber,
    decisionRapporteur: item.decision.rapporteur,
    decisionInterestedParties: item.decision.interestedParties,
    decisionObject: item.decision.object,
    decisionCompanyRole: item.decision.companyRole,
    decisionResponsiblePerson: item.decision.responsiblePerson,
    decisionIrregularity: item.decision.recognizedIrregularity,
    decisionPenalty: item.decision.penalty,
    decisionDebt: item.decision.debt,
    decisionAmount: item.decision.amount === null ? '' : String(item.decision.amount),
    decisionReferredToProsecutor: item.decision.referredToProsecutor,
    decisionDebarment: item.decision.debarment,
    decisionContractingImpediment: item.decision.contractingImpediment,
    decisionAppealStatus: item.decision.appealStatus,
    decisionDispositive: item.decision.dispositive,
    decisionConclusion: item.decision.conclusion,
  };
}

function toInput(draft: Draft): EvidenceMutationInput {
  return {
    type: draft.type,
    title: draft.title,
    source: draft.source,
    url: draft.url,
    originReference: draft.originReference,
    documentDate: draft.documentDate,
    excerpt: draft.excerpt,
    relevantPages: draft.relevantPages.split(',').map((item) => Number.parseInt(item.trim(), 10)).filter(Number.isFinite),
    hash: draft.hash,
    relatedEntity: draft.relatedEntity,
    relatedEntityType: draft.relatedEntityType,
    relatedCnpj: draft.relatedCnpj,
    relatedProcess: draft.relatedProcess,
    sourceQuality: draft.sourceQuality,
    matchStrength: draft.matchStrength,
    relationType: draft.relationType,
    analystNote: draft.analystNote,
    file: {
      name: draft.fileName,
      sizeBytes: draft.fileSize,
      pageCount: Number.parseInt(draft.pageCount, 10) || null,
      extractionStatus: draft.extractionStatus,
    },
    decision: {
      agency: draft.decisionAgency,
      processNumber: draft.relatedProcess,
      decisionNumber: draft.decisionNumber,
      date: draft.documentDate,
      rapporteur: draft.decisionRapporteur,
      interestedParties: draft.decisionInterestedParties,
      object: draft.decisionObject,
      companyRole: draft.decisionCompanyRole,
      responsiblePerson: draft.decisionResponsiblePerson,
      recognizedIrregularity: draft.decisionIrregularity,
      penalty: draft.decisionPenalty,
      debt: draft.decisionDebt,
      amount: draft.decisionAmount.trim() ? Number(draft.decisionAmount.replace(',', '.')) : null,
      referredToProsecutor: draft.decisionReferredToProsecutor,
      debarment: draft.decisionDebarment,
      contractingImpediment: draft.decisionContractingImpediment,
      appealStatus: draft.decisionAppealStatus,
      dispositive: draft.decisionDispositive,
      conclusion: draft.decisionConclusion,
    },
  };
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function EvidenceCard({
  item,
  busy,
  onReview,
  onEdit,
}: {
  item: AssistedEvidence;
  busy: boolean;
  onReview: (item: AssistedEvidence, status: EvidenceValidationStatus) => void;
  onEdit: (item: AssistedEvidence) => void;
}) {
  // Uma evidência com pendência de validação não pode ser aprovada:
  // é o ponto em que a revisão humana deixa de ser opcional.
  const blocked = item.validationIssues.length > 0;

  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-2.5 rounded-lg border border-l-4 border-line bg-surface p-3.5 shadow-xs',
        STATUS_EDGE[item.validationStatus],
      )}
    >
      <header className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="block text-2xs font-semibold uppercase tracking-wide text-ink-3">
            {TYPE_LABELS[item.type]} · {RELATION_LABELS[item.relationType]}
          </span>
          <strong className="block text-sm font-bold leading-snug text-ink">{item.title}</strong>
        </div>

        <Chip tone={STATUS_TONE[item.validationStatus]} size="sm" dot>
          {STATUS_LABELS[item.validationStatus]}
        </Chip>
      </header>

      <p className="text-sm leading-relaxed text-ink-2">
        {item.excerpt || item.analystNote || 'Sem trecho registrado.'}
      </p>

      <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-1.5">
        <Meta label="Fonte" value={item.source || 'Não informada'} />
        <Meta label="Entidade" value={item.relatedEntity || 'Empresa investigada'} />
        <Meta label="Consulta" value={new Date(item.consultedAt).toLocaleDateString('pt-BR')} />
        {item.relevantPages.length > 0 ? <Meta label="Páginas" value={item.relevantPages.join(', ')} /> : null}
      </dl>

      {blocked ? (
        <Note tone="warn" icon={<Icons.AlertTriangle size={14} aria-hidden="true" />}>
          {item.validationIssues.join(' ')}
        </Note>
      ) : null}

      <Toolbar>
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            Abrir fonte
            <Icons.ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : null}

        <Button variant="secondary" size="sm" onClick={() => onEdit(item)} disabled={busy}>
          Corrigir
        </Button>

        {item.validationStatus !== 'CONFIRMADA' ? (
          <Button
            variant="success"
            size="sm"
            onClick={() => onReview(item, 'CONFIRMADA')}
            disabled={busy || blocked}
            title={blocked ? 'Resolva as pendências de validação antes de aprovar.' : undefined}
            icon={<Icons.Check size={14} aria-hidden="true" />}
          >
            Aprovar
          </Button>
        ) : null}

        {item.validationStatus !== 'DESCARTADA' ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onReview(item, 'DESCARTADA')}
            disabled={busy}
            className="text-high-text hover:bg-high-bg"
          >
            Descartar
          </Button>
        ) : null}
      </Toolbar>

      {item.history.length > 0 ? (
        <details className="overflow-hidden rounded-md border border-line-soft bg-surface-subtle">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-surface-hover">
            Histórico de alterações ({item.history.length})
          </summary>
          <ul className="flex flex-col gap-1 border-t border-line-soft px-3 py-2.5">
            {item.history.map((event, index) => (
              <li key={`${event.at}-${index}`} className="text-2xs text-ink-2">
                <strong className="font-bold text-ink">{event.action}</strong> ·{' '}
                {new Date(event.at).toLocaleString('pt-BR')} · {event.by?.name || 'Sistema'}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}

/** Par rótulo/valor curto do rodapé do cartão. */
const Meta: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex min-w-0 items-baseline gap-1.5 text-2xs">
    <dt className="shrink-0 text-ink-3">{label}</dt>
    <dd className="min-w-0 font-semibold text-ink-2">{value}</dd>
  </div>
);

export const EvidenceCenterDrawer: React.FC<EvidenceCenterDrawerProps> = ({
  isOpen,
  onClose,
  diligence,
  onChange,
}) => {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(diligence));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({ entity: '', type: '', source: '', start: '', end: '', status: '' });
  const items = useMemo(
    () => diligence.evidenceCenter?.items || [],
    [diligence.evidenceCenter?.items],
  );
  const unavailableSources = (diligence.egos?.coverage || []).filter((item) => item.status === 'UNAVAILABLE');

  const filtered = useMemo(() => items.filter((item) => {
    if (filters.entity && !item.relatedEntity.toLowerCase().includes(filters.entity.toLowerCase())) return false;
    if (filters.type && item.type !== filters.type) return false;
    if (filters.source && !`${item.source} ${item.domain}`.toLowerCase().includes(filters.source.toLowerCase())) return false;
    if (filters.status && item.validationStatus !== filters.status) return false;
    const date = item.documentDate || item.consultedAt;
    if (filters.start && date < filters.start) return false;
    if (filters.end && date > `${filters.end}T23:59:59`) return false;
    return true;
  }), [filters, items]);

  const mutate = async (operation: () => ReturnType<typeof EvidenceCenterApi.create>) => {
    setNotice('');
    try {
      const result = await operation();
      onChange(result.evidenceCenter, result.egos);
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível salvar a evidência.');
      return null;
    }
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusyId(editingId || 'new');
    const input = toInput(draft);
    const result = editingId
      ? await mutate(() => EvidenceCenterApi.update(diligence.id, editingId, { ...input, changeNote: 'Ficha corrigida pelo analista.' }))
      : await mutate(() => EvidenceCenterApi.create(diligence.id, input));
    setBusyId(null);
    if (result) {
      setDraft(emptyDraft(diligence));
      setEditingId(null);
      setShowForm(false);
      setNotice('Evidência salva na fila de revisão.');
    }
  };

  const review = async (item: AssistedEvidence, status: EvidenceValidationStatus) => {
    setBusyId(item.id);
    const result = await mutate(() => EvidenceCenterApi.update(diligence.id, item.id, {
      validationStatus: status,
      changeNote: status === 'CONFIRMADA'
        ? 'Fonte, vínculo e classificação conferidos pelo analista.'
        : 'Registro descartado após revisão humana.',
    }));
    setBusyId(null);
    if (result) setNotice(status === 'CONFIRMADA' ? 'Evidência confirmada e projetada no EGOS.' : 'Evidência descartada e removida da projeção EGOS.');
  };

  const selectPdf = async (file?: File) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setNotice('Selecione um arquivo PDF válido.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setNotice('O PDF excede o limite local de 25 MB. Registre a URL ou a referência de origem sem selecionar o arquivo.');
      return;
    }
    setBusyId('hash');
    try {
      const hash = await sha256(file);
      setDraft((current) => ({
        ...current,
        type: 'PDF',
        title: current.title || file.name,
        fileName: file.name,
        fileSize: file.size,
        hash,
        extractionStatus: 'NAO_TENTADO',
      }));
      setNotice('Hash e metadados calculados no navegador. O arquivo não será enviado nem salvo.');
    } finally {
      setBusyId(null);
    }
  };

  const groups: Array<{ status: EvidenceValidationStatus; title: string }> = [
    { status: 'PENDENTE_REVISAO', title: 'Pendente de revisão' },
    { status: 'CONFIRMADA', title: 'Evidências confirmadas' },
    { status: 'DESCARTADA', title: 'Evidências descartadas' },
  ];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Central de evidências assistidas"
      subtitle="Organize documentos e interpretações com rastreabilidade e validação humana."
      width="xl"
    >
      {/* A ressalva vem antes de tudo: é ela que separa evidência de
          acusação, e some se virar rodapé. */}
      <Note tone="info" role="status" icon={<Icons.Info size={16} aria-hidden="true" />}>
        Vínculo, menção, processo ou classificação PEP não representam culpa. Só evidências confirmadas alimentam o
        EGOS e a IA.
      </Note>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <span className="flex items-baseline gap-1.5">
          <strong className="num text-xl font-extrabold text-ink">{items.length}</strong>
          <span className="text-xs text-ink-3">registro(s)</span>
        </span>

        <Button
          variant="primary"
          size="sm"
          icon={<Icons.Plus size={15} aria-hidden="true" />}
          onClick={() => {
            setDraft(emptyDraft(diligence));
            setEditingId(null);
            setShowForm((current) => !current);
          }}
        >
          Nova evidência
        </Button>
      </div>

      {notice ? (
        <Note tone="neutral" role="status">
          {notice}
        </Note>
      ) : null}

      {/* ---- Formulário ---- */}
      {showForm ? (
        <Section
          mark={<Icons.FileText size={12} />}
          title={editingId ? 'Corrigir evidência' : 'Adicionar à fila de revisão'}
          subtitle="Campos sensíveis permanecem pendentes até validação."
        >
          <form onSubmit={saveDraft} className="flex min-w-0 flex-col gap-3">
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Select
                label="Tipo"
                controlSize="sm"
                value={draft.type}
                options={TYPE_OPTIONS}
                onChange={(value) => setDraft({ ...draft, type: value })}
              />
              <TextField
                label="Título"
                controlSize="sm"
                required
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
              <TextField
                label="Fonte ou órgão"
                controlSize="sm"
                required
                value={draft.source}
                onChange={(event) => setDraft({ ...draft, source: event.target.value })}
              />
              <TextField
                label="URL original"
                controlSize="sm"
                type="url"
                value={draft.url}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              />
              <TextField
                label="Referência de origem"
                controlSize="sm"
                placeholder="Protocolo, arquivo ou localização"
                value={draft.originReference}
                onChange={(event) => setDraft({ ...draft, originReference: event.target.value })}
              />
              <TextField
                label="Data do documento"
                controlSize="sm"
                type="date"
                value={draft.documentDate}
                onChange={(event) => setDraft({ ...draft, documentDate: event.target.value })}
              />
              <TextField
                label="Entidade relacionada"
                controlSize="sm"
                value={draft.relatedEntity}
                onChange={(event) => setDraft({ ...draft, relatedEntity: event.target.value })}
              />
              <Select
                label="Tipo da entidade"
                controlSize="sm"
                value={draft.relatedEntityType}
                options={[
                  { value: 'company', label: 'Empresa' },
                  { value: 'person', label: 'Pessoa' },
                  { value: 'organization', label: 'Órgão/organização' },
                ]}
                onChange={(value) => setDraft({ ...draft, relatedEntityType: value })}
              />
              <TextField
                label="CNPJ relacionado"
                controlSize="sm"
                mono
                value={draft.relatedCnpj}
                onChange={(event) => setDraft({ ...draft, relatedCnpj: event.target.value })}
              />
              <TextField
                label="Processo relacionado"
                controlSize="sm"
                mono
                value={draft.relatedProcess}
                onChange={(event) => setDraft({ ...draft, relatedProcess: event.target.value })}
              />
              <Select
                label="Relação no EGOS"
                controlSize="sm"
                value={draft.relationType}
                options={RELATION_OPTIONS}
                onChange={(value) => setDraft({ ...draft, relationType: value })}
              />
              <TextField
                label="Páginas relevantes"
                controlSize="sm"
                placeholder="Ex.: 2, 4, 9"
                value={draft.relevantPages}
                onChange={(event) => setDraft({ ...draft, relevantPages: event.target.value })}
              />
              <Select
                label="Qualidade da fonte"
                controlSize="sm"
                value={draft.sourceQuality}
                options={[
                  { value: 'OFICIAL_PRIMARIA', label: 'Oficial primária' },
                  { value: 'OFICIAL_SECUNDARIA', label: 'Oficial secundária' },
                  { value: 'JORNALISTICA', label: 'Jornalística' },
                  { value: 'ANALISTA', label: 'Adicionada pelo analista' },
                  { value: 'DESCONHECIDA', label: 'Desconhecida' },
                ]}
                onChange={(value) => setDraft({ ...draft, sourceQuality: value })}
              />
              <Select
                label="Força da correspondência"
                controlSize="sm"
                value={draft.matchStrength}
                options={[
                  { value: 'FORTE', label: 'Forte' },
                  { value: 'MEDIA', label: 'Média' },
                  { value: 'FRACA', label: 'Fraca' },
                ]}
                onChange={(value) => setDraft({ ...draft, matchStrength: value })}
              />
            </div>

            <TextArea
              label="Trecho relevante"
              rows={4}
              value={draft.excerpt}
              onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })}
            />
            <TextArea
              label="Observação do analista"
              rows={3}
              value={draft.analystNote}
              onChange={(event) => setDraft({ ...draft, analystNote: event.target.value })}
            />

            {/* ---- PDF ---- */}
            {draft.type === 'PDF' ? (
              <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-subtle p-3">
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <TextField
                    label="Selecionar PDF"
                    controlSize="sm"
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => selectPdf(event.target.files?.[0])}
                  />
                  <TextField
                    label="Páginas do arquivo"
                    controlSize="sm"
                    type="number"
                    min="1"
                    value={draft.pageCount}
                    onChange={(event) => setDraft({ ...draft, pageCount: event.target.value })}
                  />
                </div>

                <div className="min-w-0">
                  <strong className="block text-sm font-bold text-ink">
                    {draft.fileName || 'Nenhum arquivo selecionado'}
                  </strong>
                  <span className="block text-xs text-ink-3">
                    {draft.fileSize ? `${(draft.fileSize / 1024).toFixed(1)} KB` : 'O binário não será enviado.'}
                  </span>
                  {draft.hash ? (
                    <code className="mt-1 block truncate font-mono text-2xs text-ink-3">{draft.hash}</code>
                  ) : null}
                </div>

                <Note tone="warn" icon={<Icons.AlertTriangle size={14} aria-hidden="true" />}>
                  Sem extrator textual seguro instalado, o PDF permanece como “Exige revisão manual”. Informe as
                  páginas e o trecho conferido.
                </Note>
              </section>
            ) : null}

            {/* ---- Ficha de decisão ---- */}
            {draft.type === 'DECISAO' ? (
              <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-subtle p-3">
                <header className="min-w-0">
                  <strong className="block text-sm font-bold text-ink">Ficha de interpretação da decisão</strong>
                  <span className="block text-xs text-ink-3">
                    Dispositivo e páginas são obrigatórios para confirmação.
                  </span>
                </header>

                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <TextField
                    label="Órgão"
                    controlSize="sm"
                    value={draft.decisionAgency}
                    onChange={(event) => setDraft({ ...draft, decisionAgency: event.target.value })}
                  />
                  <TextField
                    label="Número da decisão/acórdão"
                    controlSize="sm"
                    mono
                    value={draft.decisionNumber}
                    onChange={(event) => setDraft({ ...draft, decisionNumber: event.target.value })}
                  />
                  <TextField
                    label="Relator"
                    controlSize="sm"
                    value={draft.decisionRapporteur}
                    onChange={(event) => setDraft({ ...draft, decisionRapporteur: event.target.value })}
                  />
                  <TextField
                    label="Interessados"
                    controlSize="sm"
                    value={draft.decisionInterestedParties}
                    onChange={(event) => setDraft({ ...draft, decisionInterestedParties: event.target.value })}
                  />
                  <TextField
                    label="Objeto"
                    controlSize="sm"
                    value={draft.decisionObject}
                    onChange={(event) => setDraft({ ...draft, decisionObject: event.target.value })}
                  />
                  <Select
                    label="Papel da empresa"
                    controlSize="sm"
                    value={draft.decisionCompanyRole}
                    options={[
                      { value: 'MENCIONADA', label: 'Apenas mencionada' },
                      { value: 'INTERESSADA', label: 'Interessada' },
                      { value: 'RESPONSABILIZADA', label: 'Responsabilizada' },
                    ]}
                    onChange={(value) => setDraft({ ...draft, decisionCompanyRole: value })}
                  />
                  <TextField
                    label="Pessoa responsabilizada"
                    controlSize="sm"
                    value={draft.decisionResponsiblePerson}
                    onChange={(event) => setDraft({ ...draft, decisionResponsiblePerson: event.target.value })}
                  />
                  <TextField
                    label="Débito"
                    controlSize="sm"
                    value={draft.decisionDebt}
                    onChange={(event) => setDraft({ ...draft, decisionDebt: event.target.value })}
                  />
                  <TextField
                    label="Valor"
                    controlSize="sm"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={draft.decisionAmount}
                    onChange={(event) => setDraft({ ...draft, decisionAmount: event.target.value })}
                  />
                  <TextField
                    label="Situação recursal"
                    controlSize="sm"
                    value={draft.decisionAppealStatus}
                    onChange={(event) => setDraft({ ...draft, decisionAppealStatus: event.target.value })}
                  />
                </div>

                <TextArea
                  label="Irregularidade reconhecida"
                  rows={2}
                  value={draft.decisionIrregularity}
                  onChange={(event) => setDraft({ ...draft, decisionIrregularity: event.target.value })}
                />
                <TextArea
                  label="Multa ou penalidade"
                  rows={2}
                  value={draft.decisionPenalty}
                  onChange={(event) => setDraft({ ...draft, decisionPenalty: event.target.value })}
                />

                <fieldset className="flex min-w-0 flex-wrap gap-x-5 gap-y-2">
                  <legend className="mb-1 text-xs font-semibold text-ink-2">Consequências registradas</legend>
                  <Flag
                    label="Encaminhamento ao Ministério Público"
                    checked={draft.decisionReferredToProsecutor}
                    onChange={(checked) => setDraft({ ...draft, decisionReferredToProsecutor: checked })}
                  />
                  <Flag
                    label="Inidoneidade"
                    checked={draft.decisionDebarment}
                    onChange={(checked) => setDraft({ ...draft, decisionDebarment: checked })}
                  />
                  <Flag
                    label="Impedimento de contratar"
                    checked={draft.decisionContractingImpediment}
                    onChange={(checked) => setDraft({ ...draft, decisionContractingImpediment: checked })}
                  />
                </fieldset>

                <TextArea
                  label="Dispositivo"
                  rows={3}
                  value={draft.decisionDispositive}
                  onChange={(event) => setDraft({ ...draft, decisionDispositive: event.target.value })}
                />
                <TextArea
                  label="Conclusão revisada"
                  rows={3}
                  value={draft.decisionConclusion}
                  onChange={(event) => setDraft({ ...draft, decisionConclusion: event.target.value })}
                />
              </section>
            ) : null}

            <div className="flex min-w-0 flex-wrap justify-end gap-2 border-t border-line-soft pt-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={Boolean(busyId)} loadingLabel="Salvando…">
                {editingId ? 'Salvar correção' : 'Adicionar à fila'}
              </Button>
            </div>
          </form>
        </Section>
      ) : null}

      {/* ---- Filtros ---- */}
      <Section
        collapsible
        defaultOpen={false}
        mark={<Icons.Filter size={12} />}
        title="Filtrar evidências"
      >
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Entidade"
            controlSize="sm"
            value={filters.entity}
            onChange={(event) => setFilters({ ...filters, entity: event.target.value })}
          />
          <Select
            label="Tipo"
            controlSize="sm"
            value={filters.type}
            options={[{ value: '', label: 'Todos' }, ...TYPE_OPTIONS]}
            onChange={(value) => setFilters({ ...filters, type: value })}
          />
          <TextField
            label="Órgão ou fonte"
            controlSize="sm"
            value={filters.source}
            onChange={(event) => setFilters({ ...filters, source: event.target.value })}
          />
          <TextField
            label="De"
            controlSize="sm"
            type="date"
            value={filters.start}
            onChange={(event) => setFilters({ ...filters, start: event.target.value })}
          />
          <TextField
            label="Até"
            controlSize="sm"
            type="date"
            value={filters.end}
            onChange={(event) => setFilters({ ...filters, end: event.target.value })}
          />
          <Select
            label="Situação"
            controlSize="sm"
            value={filters.status}
            options={[{ value: '', label: 'Todas' }, ...STATUS_OPTIONS]}
            onChange={(value) => setFilters({ ...filters, status: value })}
          />
        </div>
      </Section>

      {/* ---- Fontes indisponíveis ----
          Fonte que não respondeu é lacuna de cobertura, e precisa ser
          lida junto da fila: ausência de evidência aqui não é
          ausência de ocorrência. */}
      {unavailableSources.length > 0 ? (
        <Section
          collapsible
          defaultOpen={false}
          mark={<Icons.AlertTriangle size={12} />}
          title="Fontes indisponíveis"
          trailing={
            <Chip tone="warn" size="sm">
              {unavailableSources.length}
            </Chip>
          }
          flush
        >
          <ul className="divide-y divide-line-soft">
            {unavailableSources.map((source) => (
              <li key={`${source.axis}-${source.provider}`} className="min-w-0 px-4 py-2.5">
                <strong className="block text-sm font-bold text-ink">{source.provider}</strong>
                <span className="block text-xs leading-relaxed text-ink-2">{source.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ---- Filas ---- */}
      {groups.map((group) => {
        const groupItems = filtered.filter((item) => item.validationStatus === group.status);
        return (
          <Section
            key={group.status}
            title={group.title}
            trailing={
              <Chip tone={STATUS_TONE[group.status]} size="sm">
                {groupItems.length}
              </Chip>
            }
          >
            {groupItems.length > 0 ? (
              <div className="flex min-w-0 flex-col gap-2.5">
                {groupItems.map((item) => (
                  <EvidenceCard
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onReview={review}
                    onEdit={(selected) => {
                      setDraft(draftFrom(selected));
                      setEditingId(selected.id);
                      setShowForm(true);
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="py-2 text-center text-sm text-ink-3">Nenhum registro nesta fila.</p>
            )}
          </Section>
        );
      })}
    </Drawer>
  );
};

/** Caixa de marcação com rótulo, na escala de controle do projeto. */
const Flag: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <label className="inline-flex min-w-0 cursor-pointer items-center gap-2 text-sm text-ink-2">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="size-4 shrink-0 cursor-pointer rounded-sm accent-[color:var(--brand-blue)]"
    />
    {label}
  </label>
);
