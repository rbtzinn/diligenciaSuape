import React, { useMemo, useState } from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import { Icons } from '../../../components/ui/Icons';
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
  return (
    <article className={`assisted-evidence-card status-${item.validationStatus.toLowerCase()}`}>
      <header>
        <div>
          <span>{TYPE_LABELS[item.type]} · {RELATION_LABELS[item.relationType]}</span>
          <strong>{item.title}</strong>
        </div>
        <span className="assisted-evidence-status">{STATUS_LABELS[item.validationStatus]}</span>
      </header>
      <p>{item.excerpt || item.analystNote || 'Sem trecho registrado.'}</p>
      <dl>
        <div><dt>Fonte</dt><dd>{item.source || 'Não informada'}</dd></div>
        <div><dt>Entidade</dt><dd>{item.relatedEntity || 'Empresa investigada'}</dd></div>
        <div><dt>Consulta</dt><dd>{new Date(item.consultedAt).toLocaleDateString('pt-BR')}</dd></div>
        {item.relevantPages.length > 0 ? <div><dt>Páginas</dt><dd>{item.relevantPages.join(', ')}</dd></div> : null}
      </dl>
      {item.validationIssues.length > 0 ? (
        <div className="assisted-evidence-issues">
          <Icons.AlertTriangle size={14} aria-hidden="true" />
          <span>{item.validationIssues.join(' ')}</span>
        </div>
      ) : null}
      <div className="assisted-evidence-actions">
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Abrir fonte <Icons.ExternalLink size={12} /></a> : null}
        <button type="button" onClick={() => onEdit(item)} disabled={busy}>Corrigir</button>
        {item.validationStatus !== 'CONFIRMADA' ? (
          <button type="button" onClick={() => onReview(item, 'CONFIRMADA')} disabled={busy || item.validationIssues.length > 0}>Aprovar</button>
        ) : null}
        {item.validationStatus !== 'DESCARTADA' ? (
          <button type="button" className="is-danger" onClick={() => onReview(item, 'DESCARTADA')} disabled={busy}>Descartar</button>
        ) : null}
      </div>
      {item.history.length > 0 ? (
        <details>
          <summary>Histórico de alterações ({item.history.length})</summary>
          <ul>{item.history.map((event, index) => (
            <li key={`${event.at}-${index}`}><strong>{event.action}</strong> · {new Date(event.at).toLocaleString('pt-BR')} · {event.by?.name || 'Sistema'}</li>
          ))}</ul>
        </details>
      ) : null}
    </article>
  );
}

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
      title="Central de Evidências Assistidas"
      subtitle="Organize documentos e interpretações com rastreabilidade e validação humana."
      panelClassName="investigation-wide-drawer evidence-center-drawer"
    >
      <div className="evidence-center-disclaimer" role="note">
        <Icons.Info size={16} aria-hidden="true" />
        <span>Vínculo, menção, processo ou classificação PEP não representam culpa. Só evidências confirmadas alimentam o EGOS e a IA.</span>
      </div>

      <div className="evidence-center-toolbar">
        <div><strong>{items.length}</strong><span>registro(s)</span></div>
        <button type="button" onClick={() => { setDraft(emptyDraft(diligence)); setEditingId(null); setShowForm((current) => !current); }}>
          <Icons.Plus size={15} aria-hidden="true" /> Nova evidência
        </button>
      </div>

      {notice ? <div className="evidence-center-notice" role="status">{notice}</div> : null}

      {showForm ? (
        <form className="evidence-center-form" onSubmit={saveDraft}>
          <header><strong>{editingId ? 'Corrigir evidência' : 'Adicionar à fila de revisão'}</strong><span>Campos sensíveis permanecem pendentes até validação.</span></header>
          <div className="evidence-form-grid">
            <label>Tipo<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as EvidenceType })}>{Object.entries(TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Título<input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <label>Fonte ou órgão<input required value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })} /></label>
            <label>URL original<input type="url" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} /></label>
            <label>Referência de origem<input value={draft.originReference} onChange={(event) => setDraft({ ...draft, originReference: event.target.value })} placeholder="Protocolo, arquivo ou localização" /></label>
            <label>Data do documento<input type="date" value={draft.documentDate} onChange={(event) => setDraft({ ...draft, documentDate: event.target.value })} /></label>
            <label>Entidade relacionada<input value={draft.relatedEntity} onChange={(event) => setDraft({ ...draft, relatedEntity: event.target.value })} /></label>
            <label>Tipo da entidade<select value={draft.relatedEntityType} onChange={(event) => setDraft({ ...draft, relatedEntityType: event.target.value as Draft['relatedEntityType'] })}><option value="company">Empresa</option><option value="person">Pessoa</option><option value="organization">Órgão/organização</option></select></label>
            <label>CNPJ relacionado<input value={draft.relatedCnpj} onChange={(event) => setDraft({ ...draft, relatedCnpj: event.target.value })} /></label>
            <label>Processo relacionado<input value={draft.relatedProcess} onChange={(event) => setDraft({ ...draft, relatedProcess: event.target.value })} /></label>
            <label>Relação no EGOS<select value={draft.relationType} onChange={(event) => setDraft({ ...draft, relationType: event.target.value as EvidenceRelationType })}>{Object.entries(RELATION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Páginas relevantes<input value={draft.relevantPages} onChange={(event) => setDraft({ ...draft, relevantPages: event.target.value })} placeholder="Ex.: 2, 4, 9" /></label>
            <label>Qualidade da fonte<select value={draft.sourceQuality} onChange={(event) => setDraft({ ...draft, sourceQuality: event.target.value as Draft['sourceQuality'] })}><option value="OFICIAL_PRIMARIA">Oficial primária</option><option value="OFICIAL_SECUNDARIA">Oficial secundária</option><option value="JORNALISTICA">Jornalística</option><option value="ANALISTA">Adicionada pelo analista</option><option value="DESCONHECIDA">Desconhecida</option></select></label>
            <label>Força da correspondência<select value={draft.matchStrength} onChange={(event) => setDraft({ ...draft, matchStrength: event.target.value as Draft['matchStrength'] })}><option value="FORTE">Forte</option><option value="MEDIA">Média</option><option value="FRACA">Fraca</option></select></label>
          </div>
          <label className="evidence-form-wide">Trecho relevante<textarea value={draft.excerpt} onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })} rows={4} /></label>
          <label className="evidence-form-wide">Observação do analista<textarea value={draft.analystNote} onChange={(event) => setDraft({ ...draft, analystNote: event.target.value })} rows={3} /></label>

          {draft.type === 'PDF' ? (
            <section className="evidence-pdf-box">
              <label>Selecionar PDF<input type="file" accept="application/pdf" onChange={(event) => selectPdf(event.target.files?.[0])} /></label>
              <label>Páginas do arquivo<input type="number" min="1" value={draft.pageCount} onChange={(event) => setDraft({ ...draft, pageCount: event.target.value })} /></label>
              <div><strong>{draft.fileName || 'Nenhum arquivo selecionado'}</strong><span>{draft.fileSize ? `${(draft.fileSize / 1024).toFixed(1)} KB` : 'O binário não será enviado.'}</span>{draft.hash ? <code>{draft.hash}</code> : null}</div>
              <p>Sem extrator textual seguro instalado, o PDF permanece como “Exige revisão manual”. Informe as páginas e o trecho conferido.</p>
            </section>
          ) : null}

          {draft.type === 'DECISAO' ? (
            <section className="evidence-decision-sheet">
              <header><strong>Ficha de interpretação da decisão</strong><span>Dispositivo e páginas são obrigatórios para confirmação.</span></header>
              <div className="evidence-form-grid">
                <label>Órgão<input value={draft.decisionAgency} onChange={(event) => setDraft({ ...draft, decisionAgency: event.target.value })} /></label>
                <label>Número da decisão/acórdão<input value={draft.decisionNumber} onChange={(event) => setDraft({ ...draft, decisionNumber: event.target.value })} /></label>
                <label>Relator<input value={draft.decisionRapporteur} onChange={(event) => setDraft({ ...draft, decisionRapporteur: event.target.value })} /></label>
                <label>Interessados<input value={draft.decisionInterestedParties} onChange={(event) => setDraft({ ...draft, decisionInterestedParties: event.target.value })} /></label>
                <label>Objeto<input value={draft.decisionObject} onChange={(event) => setDraft({ ...draft, decisionObject: event.target.value })} /></label>
                <label>Papel da empresa<select value={draft.decisionCompanyRole} onChange={(event) => setDraft({ ...draft, decisionCompanyRole: event.target.value as Draft['decisionCompanyRole'] })}><option value="MENCIONADA">Apenas mencionada</option><option value="INTERESSADA">Interessada</option><option value="RESPONSABILIZADA">Responsabilizada</option></select></label>
                <label>Pessoa responsabilizada<input value={draft.decisionResponsiblePerson} onChange={(event) => setDraft({ ...draft, decisionResponsiblePerson: event.target.value })} /></label>
                <label>Débito<input value={draft.decisionDebt} onChange={(event) => setDraft({ ...draft, decisionDebt: event.target.value })} /></label>
                <label>Valor<input inputMode="decimal" value={draft.decisionAmount} onChange={(event) => setDraft({ ...draft, decisionAmount: event.target.value })} placeholder="0,00" /></label>
                <label>Situação recursal<input value={draft.decisionAppealStatus} onChange={(event) => setDraft({ ...draft, decisionAppealStatus: event.target.value })} /></label>
              </div>
              <label>Irregularidade reconhecida<textarea value={draft.decisionIrregularity} onChange={(event) => setDraft({ ...draft, decisionIrregularity: event.target.value })} rows={2} /></label>
              <label>Multa ou penalidade<textarea value={draft.decisionPenalty} onChange={(event) => setDraft({ ...draft, decisionPenalty: event.target.value })} rows={2} /></label>
              <div className="evidence-decision-flags">
                <label><input type="checkbox" checked={draft.decisionReferredToProsecutor} onChange={(event) => setDraft({ ...draft, decisionReferredToProsecutor: event.target.checked })} /> Encaminhamento ao Ministério Público</label>
                <label><input type="checkbox" checked={draft.decisionDebarment} onChange={(event) => setDraft({ ...draft, decisionDebarment: event.target.checked })} /> Inidoneidade</label>
                <label><input type="checkbox" checked={draft.decisionContractingImpediment} onChange={(event) => setDraft({ ...draft, decisionContractingImpediment: event.target.checked })} /> Impedimento de contratar</label>
              </div>
              <label>Dispositivo<textarea value={draft.decisionDispositive} onChange={(event) => setDraft({ ...draft, decisionDispositive: event.target.value })} rows={3} /></label>
              <label>Conclusão revisada<textarea value={draft.decisionConclusion} onChange={(event) => setDraft({ ...draft, decisionConclusion: event.target.value })} rows={3} /></label>
            </section>
          ) : null}

          <div className="evidence-form-actions"><button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancelar</button><button type="submit" disabled={Boolean(busyId)}>{busyId ? 'Salvando…' : editingId ? 'Salvar correção' : 'Adicionar à fila'}</button></div>
        </form>
      ) : null}

      <details className="evidence-center-filters">
        <summary><Icons.Filter size={14} aria-hidden="true" /> Filtrar evidências</summary>
        <div>
          <label>Entidade<input value={filters.entity} onChange={(event) => setFilters({ ...filters, entity: event.target.value })} /></label>
          <label>Tipo<select value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Todos</option>{Object.entries(TYPE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Órgão/fonte<input value={filters.source} onChange={(event) => setFilters({ ...filters, source: event.target.value })} /></label>
          <label>De<input type="date" value={filters.start} onChange={(event) => setFilters({ ...filters, start: event.target.value })} /></label>
          <label>Até<input type="date" value={filters.end} onChange={(event) => setFilters({ ...filters, end: event.target.value })} /></label>
          <label>Status<select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Todos</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
      </details>

      {unavailableSources.length > 0 ? (
        <details className="evidence-unavailable-sources">
          <summary><Icons.AlertTriangle size={14} aria-hidden="true" /> Fontes indisponíveis ({unavailableSources.length})</summary>
          <ul>{unavailableSources.map((source) => <li key={`${source.axis}-${source.provider}`}><strong>{source.provider}</strong><span>{source.message}</span></li>)}</ul>
        </details>
      ) : null}

      <div className="evidence-center-groups">
        {groups.map((group) => {
          const groupItems = filtered.filter((item) => item.validationStatus === group.status);
          return (
            <section key={group.status}>
              <header><strong>{group.title}</strong><span>{groupItems.length}</span></header>
              {groupItems.length > 0 ? groupItems.map((item) => (
                <EvidenceCard
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onReview={review}
                  onEdit={(selected) => { setDraft(draftFrom(selected)); setEditingId(selected.id); setShowForm(true); }}
                />
              )) : <p className="evidence-group-empty">Nenhum registro nesta fila.</p>}
            </section>
          );
        })}
      </div>
    </Drawer>
  );
};
