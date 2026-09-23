// ==========================================================
// DILIGÊNCIA 360 — Formulário público do Questionário de Diligência
// ==========================================================
// Página aberta, sem login e sem banco: a empresa preenche no
// navegador, anexa as evidências e baixa um PDF com a marca de SUAPE,
// pronto para assinar e anexar ao SEI. Nada sai do navegador.
//
// A tela é gerada pelo catálogo (`questionnaireCatalog.ts`). O botão de
// gerar o PDF só libera com a lista de pendências vazia — é ela que
// barra a exportação quando falta evidência.
// ==========================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Icons } from '../ui/Icons';
import { Note } from '../ui/Note';
import { TextArea, TextField } from '../ui/Field';
import { cn } from '../lib/cn';
import {
  DECLARATION_FIELDS,
  DECLARATION_TEXT,
  EVIDENCE_ACCEPT,
  EVIDENCE_MAX_BYTES,
  QUESTIONNAIRE_SECTIONS,
  REGISTRIES,
  type ChoiceDef,
  type EvidenceKind,
  type RegistriesDef,
  type TableDef,
  type TextFieldDef,
  type YesNo,
} from './questionnaireCatalog';
import {
  answeredCount,
  cleanCnpj,
  emptyState,
  evidenceIsRequired,
  fromDraft,
  isRowFilled,
  removeTableRow,
  requiresRegistries,
  toDraft,
  validateQuestionnaire,
  type Evidence,
  type EvidenceFile,
  type QuestionnaireState,
  type TableRow,
} from './questionnaireState';
import { buildQuestionnairePdf, canEmbedPdf, sha256Hex } from './questionnairePdf';
import { allowManualCompany, applyCompany, clearCompany, fetchCompany } from './cnpjLookup';
import { CNPJ } from '../lib/cnpj';

const DRAFT_KEY = 'd360.questionario.rascunho.v1';
// Ícone azul: a "Marca" sem fundo é branca, feita para fundo escuro.
const LOGO_URL = '/assets/IconeSUAPEAZUL-semfundo.png';

function loadDraft(): QuestionnaireState {
  try {
    return fromDraft(JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null')) || emptyState();
  } catch {
    return emptyState();
  }
}

const newId = () => Math.random().toString(36).slice(2, 10);

type Update = (updater: (state: QuestionnaireState) => QuestionnaireState) => void;

// ---------------------------------------------------------- campos

const Field: React.FC<{ field: TextFieldDef; state: QuestionnaireState; update: Update; hint?: React.ReactNode }> = ({
  field,
  state,
  update,
  hint,
}) => {
  const label = `${field.ref ? `${field.ref} · ` : ''}${field.label}${field.required ? ' *' : ''}`;
  const value = state.fields[field.id] || '';
  const onChange = (next: string) => update((s) => ({ ...s, fields: { ...s.fields, [field.id]: next } }));
  // Dado da Receita: cinza e travado, a menos que a busca esteja fora do ar.
  const locked = Boolean(field.fromCnpj) && state.cnpjLookup?.source !== 'manual';
  return (
    <div id={`q-${field.id}`} className={cn('min-w-0 scroll-mt-24', field.wide && 'sm:col-span-2')}>
      {field.multiline ? (
        <TextArea label={label} rows={3} value={value} hint={hint} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <TextField
          label={label}
          value={value}
          mask={field.mask}
          hint={hint ?? (locked ? 'Preenchido automaticamente pela Receita Federal a partir do CNPJ.' : undefined)}
          disabled={locked}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
};

type LookupStatus = { tone: 'busy' | 'ok' | 'error'; text: string } | null;

const LOOKUP_TONE: Record<'busy' | 'ok' | 'error', string> = {
  busy: 'text-ink-3',
  ok: 'text-ok-text',
  error: 'text-high-text',
};

const TableField: React.FC<{ table: TableDef; state: QuestionnaireState; update: Update }> = ({ table, state, update }) => {
  const stored = state.tables[table.id];
  const rows: TableRow[] = stored && stored.length > 0 ? stored : [{}];
  const setRows = (next: TableRow[]) => update((s) => ({ ...s, tables: { ...s.tables, [table.id]: next } }));
  const setCell = (index: number, column: string, value: string) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, [column]: value } : row)));

  return (
    <div id={`q-${table.id}`} className="flex min-w-0 scroll-mt-24 flex-col gap-2 sm:col-span-2">
      <p className="text-sm leading-snug text-ink-2">
        {table.ref ? <strong className="mr-1 text-ink">{table.ref}</strong> : null}
        {table.label}
        {table.required ? ' *' : ''}
      </p>
      {rows.map((row, index) => (
        <div key={index} className="flex min-w-0 items-start gap-2 rounded-lg border border-line-soft bg-surface-subtle p-2.5">
          <span className="num mt-7 w-5 shrink-0 text-center text-2xs font-bold text-ink-3">{index + 1}</span>
          <div className={cn('grid min-w-0 flex-1 items-end gap-2', table.columns.length > 2 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2')}>
            {table.columns.map((column) => (
              <TextField
                key={column.id}
                label={column.label}
                controlSize="sm"
                mask={column.mask}
                value={row[column.id] || ''}
                onChange={(e) => setCell(index, column.id, e.target.value)}
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            className="mt-6"
            aria-label={`Remover linha ${index + 1}`}
            title="Remover linha"
            disabled={rows.length === 1 && !isRowFilled(row)}
            onClick={() => update((s) => (rows.length === 1 ? { ...s, tables: { ...s.tables, [table.id]: [] } } : removeTableRow(s, table.id, index)))}
            icon={<Icons.Trash size={15} />}
          />
        </div>
      ))}
      <div>
        <Button variant="outline" size="sm" icon={<Icons.Plus size={14} />} onClick={() => setRows([...rows, {}])}>
          Adicionar linha
        </Button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------- evidências

const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  file: 'Arquivo',
  link: 'Link',
  reference: 'Trecho',
};

const EvidenceAdder: React.FC<{
  accepts: EvidenceKind[];
  onAdd: (evidence: Omit<Evidence, 'id'>) => void;
}> = ({ accepts, onAdd }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'link' | 'reference' | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const name = file.name.toLowerCase();
    const type: EvidenceFile['type'] | null = name.endsWith('.pdf') || file.type === 'application/pdf'
      ? 'application/pdf'
      : name.endsWith('.png') || file.type === 'image/png'
        ? 'image/png'
        : /\.jpe?g$/.test(name) || file.type === 'image/jpeg' ? 'image/jpeg' : null;
    if (!type) return setError('Envie PDF, PNG ou JPG — são os formatos que entram no PDF final.');
    if (file.size > EVIDENCE_MAX_BYTES) return setError('Arquivo acima de 15 MB. Reduza o tamanho antes de anexar.');
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (type === 'application/pdf' && !(await canEmbedPdf(bytes))) {
        setError('Este PDF está protegido por senha ou corrompido. Salve uma cópia sem proteção e anexe de novo.');
        return;
      }
      onAdd({ kind: 'file', label: file.name, file: { name: file.name, type, size: file.size, bytes, sha256: await sha256Hex(bytes) } });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submitText = () => {
    const value = text.trim();
    if (mode === 'link' && !/^https?:\/\/\S+\.\S+/i.test(value)) return setError('Informe o endereço completo, começando por https://');
    if (mode === 'reference' && value.length < 5) return setError('Indique o documento e o trecho (capítulo, item ou página).');
    onAdd({ kind: mode!, label: value });
    setText('');
    setMode(null);
    setError(null);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {accepts.includes('file') ? (
          <>
            <input ref={fileRef} type="file" accept={EVIDENCE_ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => void handleFile(e.target.files?.[0])} />
            <Button size="sm" variant="secondary" isLoading={busy} loadingLabel="Lendo arquivo…" icon={<Icons.Paperclip size={14} />} onClick={() => fileRef.current?.click()}>
              Anexar arquivo
            </Button>
          </>
        ) : null}
        {accepts.includes('link') ? (
          <Button size="sm" variant="ghost" icon={<Icons.Globe size={14} />} onClick={() => { setMode('link'); setError(null); }}>
            Informar link
          </Button>
        ) : null}
        {accepts.includes('reference') ? (
          <Button size="sm" variant="ghost" icon={<Icons.FileText size={14} />} onClick={() => { setMode('reference'); setError(null); }}>
            Indicar trecho
          </Button>
        ) : null}
      </div>
      {mode ? (
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <TextField
            fieldClassName="min-w-[220px] flex-1"
            controlSize="sm"
            label={mode === 'link' ? 'Link público do documento' : 'Documento e trecho'}
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitText(); } }}
          />
          <Button size="sm" variant="primary" onClick={submitText}>Adicionar</Button>
          <Button size="sm" variant="ghost" onClick={() => { setMode(null); setText(''); setError(null); }}>Cancelar</Button>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs font-semibold text-high-text">{error}</p> : null}
    </div>
  );
};

const EvidenceList: React.FC<{ items: Evidence[]; onRemove: (id: string) => void }> = ({ items, onRemove }) =>
  items.length === 0 ? null : (
    <ul className="flex min-w-0 flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.id} className="flex min-w-0 items-center gap-2 rounded-md border border-ok-line bg-ok-bg px-2.5 py-1.5 text-xs text-ok-text">
          <Icons.CheckCircle size={14} className="shrink-0" aria-hidden="true" />
          <span className="shrink-0 font-bold">{EVIDENCE_KIND_LABEL[item.kind]}</span>
          <span className="min-w-0 flex-1 truncate" title={item.label}>{item.label}</span>
          {item.file ? <span className="num shrink-0 text-2xs opacity-80">{Math.max(1, Math.round(item.file.size / 1024))} KB</span> : null}
          <button type="button" onClick={() => onRemove(item.id)} aria-label={`Remover ${item.label}`} className="grid size-6 shrink-0 place-items-center rounded hover:bg-surface">
            <Icons.X size={13} />
          </button>
        </li>
      ))}
    </ul>
  );

const EvidencePanel: React.FC<{ choice: ChoiceDef; state: QuestionnaireState; update: Update }> = ({ choice, state, update }) => {
  const rule = choice.evidence!;
  const accepts = rule.accepts || ['file', 'link'];
  const items = state.evidences[choice.id] || [];
  const add = (evidence: Omit<Evidence, 'id'>) =>
    update((s) => ({ ...s, evidences: { ...s.evidences, [choice.id]: [...(s.evidences[choice.id] || []), { ...evidence, id: newId() }] } }));
  const remove = (id: string) =>
    update((s) => ({ ...s, evidences: { ...s.evidences, [choice.id]: (s.evidences[choice.id] || []).filter((item) => item.id !== id) } }));

  const perRow = rule.perRowOf ? (state.tables[rule.perRowOf] || []).map((row, index) => ({ row, index })).filter(({ row }) => isRowFilled(row)) : null;
  const missing = perRow ? perRow.some(({ index }) => !items.some((item) => item.rowIndex === index)) : items.length === 0;

  return (
    <div className={cn('flex min-w-0 flex-col gap-2.5 rounded-lg border p-3 sm:col-span-2', missing ? 'border-warn-line bg-warn-bg' : 'border-ok-line bg-surface')}>
      <div className="flex min-w-0 items-start gap-2">
        <Icons.Paperclip size={15} className={cn('mt-0.5 shrink-0', missing ? 'text-warn-text' : 'text-ok-text')} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-ink">
            Evidência obrigatória {missing ? <span className="font-semibold text-warn-text">· pendente</span> : <span className="font-semibold text-ok-text">· apresentada</span>}
          </p>
          <p className="text-xs leading-snug text-ink-2">{rule.hint}</p>
        </div>
      </div>

      {perRow ? (
        perRow.length === 0 ? (
          <p className="text-xs text-ink-3">Preencha a tabela acima; cada linha vai pedir a sua evidência.</p>
        ) : (
          perRow.map(({ row, index }) => {
            const rowItems = items.filter((item) => item.rowIndex === index);
            return (
              <div key={index} className="flex min-w-0 flex-col gap-2 border-t border-line-soft pt-2.5">
                <p className="truncate text-xs font-semibold text-ink-2">
                  Linha {index + 1} · {Object.values(row).find((value) => value.trim())}
                </p>
                <EvidenceList items={rowItems} onRemove={remove} />
                {rowItems.length === 0 ? <EvidenceAdder accepts={accepts} onAdd={(evidence) => add({ ...evidence, rowIndex: index })} /> : null}
              </div>
            );
          })
        )
      ) : (
        <>
          <EvidenceList items={items} onRemove={remove} />
          <EvidenceAdder accepts={accepts} onAdd={add} />
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------- perguntas

const ChoiceField: React.FC<{ choice: ChoiceDef; state: QuestionnaireState; update: Update }> = ({ choice, state, update }) => {
  const answer = state.choices[choice.id];
  const setAnswer = (value: YesNo) => update((s) => ({ ...s, choices: { ...s.choices, [choice.id]: value } }));
  return (
    <div id={`q-${choice.id}`} className="flex min-w-0 scroll-mt-24 flex-col gap-3 border-t border-line-soft pt-4 sm:col-span-2">
      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <p className="min-w-0 text-sm leading-relaxed text-ink">
          <strong className="num mr-1.5 text-brand">{choice.ref}</strong>
          {choice.text} *
        </p>
        <div role="radiogroup" aria-label={`Resposta do item ${choice.ref}`} className="inline-flex shrink-0 self-start overflow-hidden rounded-md border border-line">
          {(['sim', 'nao'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={answer === value}
              onClick={() => setAnswer(value)}
              className={cn(
                'min-h-9 min-w-16 px-3 text-sm font-semibold transition-colors',
                answer === value ? 'bg-brand text-white' : 'bg-surface text-ink-2 hover:bg-surface-hover',
              )}
            >
              {value === 'sim' ? 'Sim' : 'Não'}
            </button>
          ))}
        </div>
      </div>
      {answer === 'sim' && choice.whenYes ? (
        <div className="grid min-w-0 gap-3 border-l-2 border-brand-line pl-3 sm:grid-cols-2">
          {choice.whenYes.map((child) =>
            child.kind === 'text'
              ? <Field key={child.id} field={child} state={state} update={update} />
              : <TableField key={child.id} table={child} state={state} update={update} />,
          )}
        </div>
      ) : null}
      {evidenceIsRequired(choice, state) ? <EvidencePanel choice={choice} state={state} update={update} /> : null}
    </div>
  );
};

const RegistriesField: React.FC<{ item: RegistriesDef; state: QuestionnaireState; update: Update }> = ({ item, state, update }) => {
  if (!requiresRegistries(state)) {
    return (
      <p id={`q-${item.id}`} className="scroll-mt-24 border-t border-line-soft pt-4 text-xs text-ink-3 sm:col-span-2">
        <strong className="mr-1">{item.ref} e {item.detail.ref}</strong>
        Não se aplicam às suas respostas até aqui. Se alguma resposta dos itens 4.4, 5.2 ou 7.1, 7.3 a 7.9 mudar para "Sim", estes itens passam a ser obrigatórios.
      </p>
    );
  }
  const marked = REGISTRIES.some((registry) => state.registries[registry.key]);
  return (
    <div id={`q-${item.id}`} className="flex min-w-0 scroll-mt-24 flex-col gap-3 border-t border-line-soft pt-4 sm:col-span-2">
      <p className="text-sm leading-relaxed text-ink">
        <strong className="num mr-1.5 text-brand">{item.ref}</strong>
        {item.text} *
      </p>
      <ul className="flex flex-col gap-1.5">
        {REGISTRIES.map((registry) => (
          <li key={registry.key}>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-2">
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-[color:var(--brand-blue)]"
                checked={Boolean(state.registries[registry.key])}
                onChange={(e) => update((s) => ({ ...s, registries: { ...s.registries, [registry.key]: e.target.checked } }))}
              />
              {registry.text}
            </label>
          </li>
        ))}
      </ul>
      {marked ? <div className="grid"><Field field={item.detail} state={state} update={update} /></div> : null}
    </div>
  );
};

// ---------------------------------------------------------- página

export const QuestionnaireForm: React.FC = () => {
  const [state, setState] = useState<QuestionnaireState>(loadDraft);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'high'; text: string } | null>(null);
  const exportRef = useRef<HTMLElement>(null);

  const update: Update = (updater) => {
    setResult(null);
    setState((current) => updater(current));
  };

  // Rascunho no navegador: sem banco, e sem os arquivos (só texto).
  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(toDraft(state)));
    } catch {
      // Armazenamento cheio ou bloqueado: o formulário segue funcionando.
    }
  }, [state]);

  const issues = useMemo(() => validateQuestionnaire(state), [state]);
  const progress = answeredCount(state);
  const hasFiles = Object.values(state.evidences).some((list) => list.some((item) => item.kind === 'file'));

  // ---- Busca do CNPJ na Receita ----
  const cnpjValue = state.fields.cnpj || '';
  const cnpjKey = CNPJ.validate(cnpjValue) ? cleanCnpj(cnpjValue) : '';
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>(null);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const lookupRef = useRef(state.cnpjLookup);
  lookupRef.current = state.cnpjLookup;

  useEffect(() => {
    const current = lookupRef.current;
    if (!cnpjKey) {
      // CNPJ apagado ou incompleto: os dados da empresa anterior saem.
      setLookupStatus(null);
      if (current) setState((s) => clearCompany(s));
      return undefined;
    }
    if (current?.cnpj === cnpjKey && lookupAttempt === 0) {
      setLookupStatus(current.source === 'receita'
        ? { tone: 'ok', text: 'Dados da empresa carregados da Receita Federal.' }
        : { tone: 'error', text: 'Consulta à Receita indisponível: preencha os dados da empresa.' });
      return undefined;
    }
    const controller = new AbortController();
    setLookupStatus({ tone: 'busy', text: 'Buscando os dados da empresa na Receita Federal…' });
    fetchCompany(cnpjKey, controller.signal)
      .then((result) => {
        if (result.ok) {
          setState((s) => applyCompany(s, cnpjKey, result.company));
          setLookupStatus({ tone: 'ok', text: 'Dados da empresa carregados da Receita Federal.' });
        } else if (result.reason === 'nao-encontrado') {
          setState((s) => clearCompany(s));
          setLookupStatus({ tone: 'error', text: 'CNPJ não encontrado na Receita Federal. Confira o número.' });
        } else {
          setState((s) => allowManualCompany(s, cnpjKey));
          setLookupStatus({ tone: 'error', text: 'Consulta à Receita indisponível agora: os dados da empresa foram liberados para digitação.' });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [cnpjKey, lookupAttempt]);

  const cnpjHint = lookupStatus ? (
    <span className={cn('flex flex-wrap items-center gap-x-2', LOOKUP_TONE[lookupStatus.tone])}>
      {lookupStatus.text}
      {lookupStatus.tone === 'error' && cnpjKey ? (
        <button type="button" className="font-semibold underline" onClick={() => setLookupAttempt((n) => n + 1)}>
          Buscar de novo
        </button>
      ) : null}
    </span>
  ) : 'Os dados da empresa são preenchidos automaticamente pela Receita Federal.';

  // ---- Pendência em destaque ----
  // O item clicado na lista fica com borda vermelha até ser resolvido.
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const highlightedOpen = highlighted !== null && issues.some((issue) => issue.anchor === highlighted);
  useEffect(() => {
    if (!highlightedOpen || !highlighted) return undefined;
    const element = document.getElementById(highlighted);
    if (!element) return undefined;
    const classes = ['ring-2', 'ring-high', 'ring-offset-4', 'ring-offset-surface', 'rounded-lg'];
    element.classList.add(...classes);
    return () => element.classList.remove(...classes);
  }, [highlighted, highlightedOpen]);

  const goTo = (anchor: string) => {
    const element = document.getElementById(anchor);
    setHighlighted(anchor);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => element?.querySelector<HTMLElement>('input:not(:disabled), textarea, button')?.focus({ preventScroll: true }), 400);
  };

  const handleGenerate = async () => {
    if (issues.length > 0 || generating) return;
    setGenerating(true);
    setResult(null);
    try {
      const logoPng = await fetch(LOGO_URL).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? new Uint8Array(b) : undefined)).catch(() => undefined);
      const bytes = await buildQuestionnairePdf(state, { logoPng });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const safeName = (state.fields.razaoSocial || 'empresa').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Questionario_Diligencia_SUAPE_${safeName}_${(state.fields.cnpj || '').replace(/\D/g, '')}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const mb = (blob.size / 1024 / 1024).toFixed(1).replace('.', ',');
      setResult({ tone: 'ok', text: `PDF gerado (${mb} MB). Assine digitalmente e anexe ao processo no SEI.` });
    } catch (error) {
      console.error('[Questionário] Falha ao gerar PDF:', error);
      setResult({ tone: 'high', text: 'Não foi possível gerar o PDF. Verifique os arquivos anexados e tente de novo.' });
    } finally {
      setGenerating(false);
    }
  };

  const handleClear = () => {
    if (!window.confirm('Apagar todas as respostas e anexos deste formulário?')) return;
    setState(emptyState());
    setResult(null);
  };

  return (
    <div className="h-dvh min-h-0 w-full overflow-y-auto bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-line-soft bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-gutter py-2.5">
          <img src="/assets/IconeSUAPEAZUL-semfundo.png" alt="SUAPE" width={32} height={32} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold leading-tight">Questionário de Diligência</p>
            <p className="truncate text-2xs font-semibold uppercase tracking-wider text-ink-3">Anexo A · Política de Contratação de Terceiros de SUAPE</p>
          </div>
          <span className="num hidden shrink-0 text-xs text-ink-3 sm:inline">{progress.answered}/{progress.total} respondidas</span>
          <Button
            size="sm"
            variant={issues.length === 0 ? 'primary' : 'secondary'}
            icon={<Icons.Download size={15} />}
            onClick={() => (issues.length === 0 ? void handleGenerate() : exportRef.current?.scrollIntoView({ behavior: 'smooth' }))}
            isLoading={generating}
            loadingLabel="Gerando…"
          >
            {issues.length === 0 ? 'Gerar PDF' : `${issues.length} pendência(s)`}
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1120px] gap-6 px-gutter py-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Seções do questionário" className="hidden lg:block">
          <ol className="sticky top-20 flex flex-col gap-0.5 text-sm">
            {QUESTIONNAIRE_SECTIONS.map((section) => (
              <li key={section.id}>
                <a href={`#sec-${section.id}`} className="block rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface-hover hover:text-ink">
                  <span className="num mr-1.5 font-bold text-brand">{section.number}</span>{section.title}
                </a>
              </li>
            ))}
            <li><a href="#sec-declaracao" className="block rounded-md px-2.5 py-1.5 text-ink-2 hover:bg-surface-hover hover:text-ink"><span className="num mr-1.5 font-bold text-brand">10</span>Declaração de ciência</a></li>
            <li><a href="#sec-exportar" className="block rounded-md px-2.5 py-1.5 font-semibold text-brand hover:bg-surface-hover">Gerar PDF</a></li>
          </ol>
        </nav>

        <main className="flex min-w-0 flex-col gap-5">
          <section className="rounded-xl border border-brand-line bg-brand-soft px-4 py-3.5 text-sm leading-relaxed text-ink-2">
            <p className="font-bold text-brand">Como preencher</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>Responda todas as perguntas. Campos com * são obrigatórios.</li>
              <li>Onde a resposta pedir, apresente a <strong>evidência</strong>: arquivo (PDF, PNG ou JPG), link público ou indicação do trecho do documento. Sem ela, o PDF não é liberado.</li>
              <li>Gere o PDF: as evidências em arquivo vão anexadas dentro dele.</li>
              <li>Assine o PDF digitalmente (ICP-Brasil ou gov.br) e anexe ao processo no SEI.</li>
            </ol>
            <p className="mt-2 text-xs text-ink-3">
              Nada é enviado a servidor: tudo fica neste navegador. As respostas são guardadas automaticamente como rascunho; os arquivos anexados, não — se recarregar a página, anexe-os de novo.
            </p>
          </section>

          {QUESTIONNAIRE_SECTIONS.map((section) => (
            <section key={section.id} id={`sec-${section.id}`} className="scroll-mt-20 rounded-xl border border-line bg-surface shadow-xs">
              <h2 className="rounded-t-xl bg-brand px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white">
                {section.number}. {section.title}
              </h2>
              <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2">
                {section.items.map((item) => {
                  if (item.kind === 'text') return <Field key={item.id} field={item} state={state} update={update} hint={item.id === 'cnpj' ? cnpjHint : undefined} />;
                  if (item.kind === 'table') return <TableField key={item.id} table={item} state={state} update={update} />;
                  if (item.kind === 'choice') return <ChoiceField key={item.id} choice={item} state={state} update={update} />;
                  if (item.kind === 'registries') return <RegistriesField key={item.id} item={item} state={state} update={update} />;
                  return <p key={item.id} className="border-t border-line-soft pt-4 text-sm font-semibold text-ink sm:col-span-2">{item.text}</p>;
                })}
              </div>
            </section>
          ))}

          <section id="sec-declaracao" className="scroll-mt-20 rounded-xl border border-line bg-surface shadow-xs">
            <h2 className="rounded-t-xl bg-brand px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white">10. Declaração de ciência</h2>
            <div className="flex flex-col gap-3 p-4 text-sm leading-relaxed text-ink-2">
              {DECLARATION_TEXT.map((paragraph) => <p key={paragraph.slice(0, 20)}>{paragraph}</p>)}
              <label id="q-declaracao" className="flex scroll-mt-24 cursor-pointer items-start gap-2 rounded-md bg-surface-subtle px-3 py-2.5 font-semibold text-ink">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[color:var(--brand-blue)]"
                  checked={state.declarationAccepted}
                  onChange={(e) => update((s) => ({ ...s, declarationAccepted: e.target.checked }))}
                />
                Li e concordo com a declaração acima. *
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {DECLARATION_FIELDS.map((field) => <Field key={field.id} field={field} state={state} update={update} />)}
              </div>
            </div>
          </section>

          <section id="sec-exportar" ref={exportRef} className="scroll-mt-20 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs">
            <h2 className="text-md font-bold">Gerar o PDF para o SEI</h2>
            {issues.length > 0 ? (
              <Note tone="warn" icon={<Icons.AlertTriangle size={15} />} title={`${issues.length} pendência(s) antes de gerar o PDF`}>
                <ul className="mt-1 flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
                  {issues.map((issue, index) => (
                    <li key={`${issue.anchor}-${index}`}>
                      <button type="button" onClick={() => goTo(issue.anchor)} className="text-left underline decoration-dotted underline-offset-2 hover:decoration-solid">
                        {issue.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </Note>
            ) : (
              <Note tone="ok" icon={<Icons.CheckCircle size={15} />}>
                Tudo preenchido, com as evidências exigidas.{hasFiles ? ' Os arquivos anexados vão dentro do PDF.' : ''}
              </Note>
            )}
            {result ? <Note tone={result.tone} role="status">{result.text}</Note> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" size="sm" icon={<Icons.Trash size={14} />} onClick={handleClear}>
                Limpar formulário
              </Button>
              <Button
                variant="primary"
                icon={<Icons.Download size={16} />}
                disabled={issues.length > 0}
                isLoading={generating}
                loadingLabel="Gerando PDF…"
                onClick={() => void handleGenerate()}
              >
                Gerar PDF
              </Button>
            </div>
          </section>

          <footer className="pb-6 text-center text-2xs leading-relaxed text-ink-3">
            Complexo Industrial Portuário Governador Eraldo Gueiros · Rodovia Indonésia, s/nº, Ipojuca/PE · CEP 55598-000 · (81) 3527-5000
          </footer>
        </main>
      </div>
    </div>
  );
};

export default QuestionnaireForm;
