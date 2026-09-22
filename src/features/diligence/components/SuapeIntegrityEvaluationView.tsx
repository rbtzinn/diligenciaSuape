// ==========================================================
// DILIGÊNCIA 360 — Avaliação de Integridade e linha do Mapa
//
// A tela segue a ordem do processo, e só isso: o questionário entra, a
// classificação sai, o que ela exigir aparece, e no fim a linha para
// colar no Mapa de Risco.
//
// Tudo aqui usa os controles de `components/ui`. Eles saem dos mesmos
// tokens de altura e raio, que é o motivo de campo e botão lado a lado
// terminarem alinhados — antes esta tela desenhava os seus próprios, e
// cada bloco tinha uma altura.
// ==========================================================

import React, { useEffect, useMemo, useState } from 'react';
import type { DiligenceItem, ProcessDiscovery } from '../types';
import { Section } from '../../../components/ui/Section';
import { Button } from '../../../components/ui/Button';
import { Chip, ChipTone } from '../../../components/ui/Chip';
import { Note } from '../../../components/ui/Note';
import { TextField, Select } from '../../../components/ui/Field';
import { Icons } from '../../../components/ui/Icons';
import { cn } from '../../../lib/cn';
import { currencyToNumber } from '../../../lib/masks';
import {
  evaluateSuapeIntegrity,
  generateRiskMapRow,
  SUAPE_ALCADA_CONSELHO_VALOR,
  SUAPE_DIRETORIAS,
  SUAPE_MATURITY_ITEMS,
  SUAPE_QUESTION_TEXTS,
  SUAPE_REQUIRED_ITEMS,
  SUAPE_SENSITIVE_POINTS,
  type QuestionnaireAnswer,
  type IntegrityAnswers,
  type SuapeCalculatedRisk,
} from '../utils/suapeRiskMapRowGenerator';
import { QuestionnaireImportPanel, type QuestionnaireImportPayload } from './QuestionnaireImportPanel';
import { ChecklistExtrasPanel } from './ChecklistExtrasPanel';
import {
  buildIntegrityFormPayload,
  buildIntegritySheetPayload,
  type ChecklistExtras,
} from '../utils/integrityFormPayload';

interface SuapeIntegrityEvaluationViewProps {
  diligence: DiligenceItem;
  discoveries?: ProcessDiscovery[];
  /**
   * As respostas moram no dashboard para que o dossiê, o grafo e esta
   * tela mostrem a mesma classificação.
   */
  answers: IntegrityAnswers;
  onAnswersChange: (answers: IntegrityAnswers) => void;
  /**
   * Demais campos do questionário — perguntas fora de fórmula e texto
   * livre. Só servem para preencher a CheckList da planilha.
   */
  checklistExtras?: ChecklistExtras;
  onChecklistExtrasChange?: (extras: ChecklistExtras) => void;
  valorContratoStr: string;
  onValorContratoChange: (value: string) => void;
  onOpenEvidence?: () => void;
  /**
   * Grava a linha de 40 colunas na aba do Mapa de Risco. Recebe os
   * títulos junto com os valores porque o layout oficial é definido
   * aqui, pelo gerador da linha, e não no servidor.
   */
  onSaveRiskMapRow?: (linha: { cabecalho: string[]; valores: string[] }) => Promise<string>;
  /**
   * Baixa o Formulário de Diligência preenchido no layout oficial.
   * Recebe o conteúdo já montado; a tela é quem conhece o catálogo.
   */
  onDownloadIntegrityForm?: (dados: ReturnType<typeof buildIntegrityFormPayload>) => Promise<void>;
  /**
   * Preenche o formulário na planilha oficial de SUAPE e devolve o que
   * as fórmulas dela calcularam, para conferência.
   */
  onFillSuapeSheet?: (dados: ReturnType<typeof buildIntegritySheetPayload>) => Promise<string>;
  /** Endereço da planilha, disponível depois do primeiro preenchimento. */
  suapeSheetUrl?: string | null;
  onOpenNetwork?: () => void;
  onDeepenResearch?: () => void;
  isResearching?: boolean;
  researchNotice?: string | null;
}

const RISK_TONE: Record<SuapeCalculatedRisk, ChipTone> = {
  'Muito Alto': 'critical',
  Alto: 'high',
  'Médio': 'warn',
  Baixo: 'ok',
};

const MATURITY_TONE: Record<string, ChipTone> = {
  Baixo: 'ok',
  'Médio': 'warn',
  Alto: 'high',
  'Muito Alto': 'critical',
};

const EMPTY_ANSWERS: IntegrityAnswers = {
  '4.4': null,
  '5.2': null,
  '7.1': null,
  '7.2': null,
  '7.3': null,
  '7.4': null,
  '7.5': null,
  '7.6': null,
  '7.7': null,
  '7.8': null,
  '7.9': null,
  '8.1': null,
  '8.2': null,
  '8.3': null,
  '8.4': null,
  '8.5': null,
  '8.6': null,
  '8.7': null,
  '8.8': null,
  '8.9': null,
  '9.0': null,
  alcadaConselho: null,
};

/** Rótulo curto de cada item, para o checklist não virar parede de texto. */
const ITEM_LABELS: Record<string, string> = {
  '4.4': 'Condenação da pessoa jurídica',
  '5.2': 'Condenação criminal de sócios',
  '7.1': 'Atividade regulada',
  '7.2': 'Licenças, ART ou RRT',
  '7.3': 'Obter ou renovar licença',
  '7.4': 'Interação com órgão público',
  '7.5': 'Agenciamento ou intermediação',
  '7.6': 'Sócio ou administrador é PEP',
  '7.7': 'Familiar de sócio é PEP',
  '7.8': 'Parente de pessoa influente em Suape',
  '7.9': 'Governo com interesse na empresa',
  alcadaConselho: 'Autorizada por alçada do Conselho',
};

const DIRETORIA_OPTIONS = [
  { value: '', label: 'Selecione' },
  ...SUAPE_DIRETORIAS.map((sigla) => ({ value: sigla, label: sigla })),
];

const formatDate = (date: Date) =>
  `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;

export const SuapeIntegrityEvaluationView: React.FC<SuapeIntegrityEvaluationViewProps> = ({
  diligence,
  discoveries = [],
  answers,
  onAnswersChange,
  checklistExtras,
  onChecklistExtrasChange,
  valorContratoStr,
  onValorContratoChange,
  onOpenEvidence,
  onSaveRiskMapRow,
  onDownloadIntegrityForm,
  onFillSuapeSheet,
  suapeSheetUrl,
  onOpenNetwork,
  onDeepenResearch,
  isResearching = false,
  researchNotice,
}) => {
  const today = formatDate(new Date());

  const [diretoria, setDiretoria] = useState(() => localStorage.getItem('suape_diretoria') || '');
  const [gestor, setGestor] = useState('');
  const [registroId, setRegistroId] = useState('');
  const [anoExercicio, setAnoExercicio] = useState(() => String(new Date().getFullYear()));
  const [processoSei, setProcessoSei] = useState('');
  const [notaTecnica, setNotaTecnica] = useState('');
  const [dataInicio, setDataInicio] = useState(today);
  const [dataFim, setDataFim] = useState(today);
  const [answerSource, setAnswerSource] = useState<string | null>(null);
  const [sensitivePoints, setSensitivePoints] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);

  // A diretoria demandante se repete entre diligências do mesmo analista.
  useEffect(() => {
    if (diretoria) localStorage.setItem('suape_diretoria', diretoria);
  }, [diretoria]);

  /**
   * O que o analista digitou vale mais do que o que a extração deduziu,
   * então campo já preenchido não é sobrescrito.
   */
  const handleImportApply = (payload: QuestionnaireImportPayload) => {
    onAnswersChange({ ...EMPTY_ANSWERS, ...payload.answers });
    onChecklistExtrasChange?.({
      choices: payload.extraChoices,
      texts: payload.textFields,
    });
    setAnswerSource(payload.origem);

    if (payload.valorContrato !== null && !valorContratoStr.trim()) {
      onValorContratoChange(
        payload.valorContrato.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    }
    if (payload.processoSei && !processoSei.trim()) setProcessoSei(payload.processoSei);
    if (payload.diretoria && !diretoria && SUAPE_DIRETORIAS.includes(payload.diretoria)) {
      setDiretoria(payload.diretoria);
    }
    if (payload.gestor && !gestor.trim()) setGestor(payload.gestor);
  };

  const handleSetAnswer = (key: keyof IntegrityAnswers, value: QuestionnaireAnswer) => {
    onAnswersChange({ ...answers, [key]: value });
  };

  // Campo mascarado: o texto tem forma única e a leitura é direta.
  const valorNumerico = useMemo(() => currencyToNumber(valorContratoStr) ?? 0, [valorContratoStr]);

  const evaluation = useMemo(
    () => evaluateSuapeIntegrity(diligence, valorNumerico, answers),
    [diligence, valorNumerico, answers]
  );

  const observacoes = useMemo(() => {
    if (sensitivePoints.length === 0) return '';
    const marcados = SUAPE_SENSITIVE_POINTS.filter((point) => sensitivePoints.includes(point.key));
    return `Pontos de atenção: ${marcados.map((point) => point.label).join('; ')}.`;
  }, [sensitivePoints]);

  const riskMapRow = useMemo(
    () =>
      generateRiskMapRow(diligence, {
        id: registroId,
        ano: anoExercicio,
        dataInicio,
        dataFim,
        diretoriaDemandante: diretoria,
        gestor,
        razaoSocial: diligence.razaoSocial,
        cnpj: diligence.cnpjFmt,
        valorContrato: valorNumerico,
        notaTecnica,
        processoSei,
        observacoes,
        answers,
        customEvaluation: evaluation,
      }),
    [
      diligence,
      registroId,
      anoExercicio,
      dataInicio,
      dataFim,
      diretoria,
      gestor,
      valorNumerico,
      notaTecnica,
      processoSei,
      observacoes,
      answers,
      evaluation,
    ]
  );

  const answeredCount = SUAPE_REQUIRED_ITEMS.filter(
    (item) => answers[item] === true || answers[item] === false
  ).length;

  // Sem classificação não há linha a registrar: o Mapa guarda o resultado
  // da diligência, não o que ainda falta apurar.
  const copyBlocked = evaluation.calculatedRisk === null;

  const [savingRow, setSavingRow] = useState(false);
  const [rowNotice, setRowNotice] = useState<string | null>(null);

  const [emitindoFormulario, setEmitindoFormulario] = useState(false);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);

  // O PDF sai do que está na tela agora — nada é guardado, e por isso
  // ele reflete a avaliação do momento em que foi pedido.
  const handleDownloadForm = async () => {
    if (copyBlocked || !onDownloadIntegrityForm || emitindoFormulario) return;
    setEmitindoFormulario(true);
    setErroFormulario(null);
    try {
      await onDownloadIntegrityForm(
        buildIntegrityFormPayload(diligence, answers, evaluation, {
          registro: registroId,
          ano: anoExercicio,
          diretoria,
          gestor,
          valor: valorContratoStr,
          dataEntrada: dataInicio,
          dataSaida: dataFim,
          processoSei,
        }),
      );
    } catch (error) {
      setErroFormulario(
        error instanceof Error
          ? `Não foi possível gerar o formulário: ${error.message}`
          : 'Não foi possível gerar o formulário em PDF.'
      );
    } finally {
      setEmitindoFormulario(false);
    }
  };

  const [preenchendoPlanilha, setPreenchendoPlanilha] = useState(false);
  const [avisoPlanilha, setAvisoPlanilha] = useState<string | null>(null);
  const [erroPlanilha, setErroPlanilha] = useState<string | null>(null);

  const handleFillSheet = async () => {
    if (copyBlocked || !onFillSuapeSheet || preenchendoPlanilha) return;
    setPreenchendoPlanilha(true);
    setAvisoPlanilha(null);
    setErroPlanilha(null);
    try {
      const aviso = await onFillSuapeSheet(
        buildIntegritySheetPayload(diligence, answers, evaluation, checklistExtras),
      );
      setAvisoPlanilha(aviso);
    } catch (error) {
      setErroPlanilha(
        error instanceof Error
          ? `Não foi possível preencher a planilha: ${error.message}`
          : 'Não foi possível preencher a planilha de SUAPE.'
      );
    } finally {
      setPreenchendoPlanilha(false);
    }
  };

  const handleSaveRow = async () => {
    if (copyBlocked || !onSaveRiskMapRow || savingRow) return;
    setSavingRow(true);
    setRowNotice(null);
    try {
      const aviso = await onSaveRiskMapRow({
        cabecalho: riskMapRow.columns.map((column) => column.name),
        valores: riskMapRow.columns.map((column) => column.value),
      });
      setRowNotice(aviso);
    } catch (error) {
      setRowNotice(
        error instanceof Error ? error.message : 'Não foi possível gravar a linha na planilha.'
      );
    } finally {
      setSavingRow(false);
    }
  };

  const handleCopyRow = async () => {
    if (copyBlocked) return;
    try {
      await navigator.clipboard.writeText(riskMapRow.rawLine);
      setCopied(true);
      setCopyError(null);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopyError('Não foi possível acessar a área de transferência.');
      setTimeout(() => setCopyError(null), 5000);
    }
  };

  const renderAnswer = (key: keyof IntegrityAnswers, label: string, description: string) => {
    const value = answers[key];
    return (
      <div
        key={String(key)}
        className={cn(
          'flex min-w-0 items-center justify-between gap-3 rounded-[var(--control-radius-md)] border px-3 py-2',
          value === true ? 'border-high-line bg-high-bg' : 'border-line bg-surface',
        )}
      >
        <span className="min-w-0 truncate text-xs font-medium text-ink" title={description}>
          <span className="text-ink-3">{String(key)}</span> {label}
        </span>

        <div
          role="group"
          aria-label={label}
          className="flex shrink-0 overflow-hidden rounded-[var(--control-radius-sm)] border border-line"
        >
          {[
            { option: true as QuestionnaireAnswer, text: 'Sim' },
            { option: false as QuestionnaireAnswer, text: 'Não' },
            { option: null as QuestionnaireAnswer, text: '—' },
          ].map(({ option, text }) => (
            <button
              key={text}
              type="button"
              aria-pressed={value === option}
              onClick={() => handleSetAnswer(key, option)}
              className={cn(
                'min-h-[var(--control-height-sm)] px-2.5 text-2xs font-semibold transition-colors',
                value === option
                  ? option === true
                    ? 'bg-high text-white'
                    : 'bg-brand text-white'
                  : 'bg-surface text-ink-3 hover:bg-surface-hover',
              )}
            >
              {text}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-0 w-full flex-1 overflow-x-hidden overflow-y-auto bg-canvas pb-12">
      <div className="mx-auto flex w-full max-w-content flex-col gap-4 px-gutter pt-5">
        {/* ---- Cabeçalho ---- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xs font-bold uppercase tracking-[0.14em] text-brand">Complemento SUAPE</p>
            <h1 className="text-xl font-extrabold text-ink">Avaliação de integridade</h1>
            <p className="text-xs text-ink-3">{diligence.razaoSocial} · {diligence.cnpjFmt}</p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onOpenNetwork ? (
              <Button size="sm" variant="ghost" icon={<Icons.Network size={15} />} onClick={onOpenNetwork}>
                Grafo
              </Button>
            ) : null}
            {onOpenEvidence ? (
              <Button size="sm" variant="ghost" icon={<Icons.ShieldCheck size={15} />} onClick={onOpenEvidence}>
                Evidências
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={copied ? 'success' : 'primary'}
              icon={copied ? <Icons.Check size={15} /> : <Icons.Copy size={15} />}
              disabled={copyBlocked}
              title={copyBlocked ? 'Importe o questionário para liberar a linha.' : undefined}
              onClick={handleCopyRow}
            >
              {copied ? 'Copiado' : 'Copiar linha'}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-brand-line bg-brand-soft px-4 py-3 text-xs leading-relaxed text-ink-2">
          <strong className="block text-sm text-brand">Do questionário à decisão</strong>
          Anexe as respostas do terceiro, confira os dados extraídos e revise a classificação orientada pela Política de Contratação de Terceiros. Esta avaliação complementa a pesquisa pública e tem critérios próprios.
        </div>

        {copyError ? (
          <Note tone="high" role="alert">
            {copyError}
          </Note>
        ) : null}

        {/* ---- 1. Questionário ---- */}
        <QuestionnaireImportPanel
          razaoSocial={diligence.razaoSocial}
          cnpj={diligence.cnpjFmt || diligence.cnpj}
          answeredCount={answeredCount}
          totalItems={SUAPE_REQUIRED_ITEMS.length}
          onApply={handleImportApply}
          onClear={() => {
            onAnswersChange(EMPTY_ANSWERS);
            onChecklistExtrasChange?.({ choices: {}, texts: {} });
            setAnswerSource(null);
          }}
        />

        {/* Os demais campos do questionário, para completar o que a
            transcrição não trouxe. Só aparece quando a tela tem para
            onde mandá-los. */}
        {onChecklistExtrasChange ? (
          <ChecklistExtrasPanel
            extras={checklistExtras || { choices: {}, texts: {} }}
            onChange={onChecklistExtrasChange}
          />
        ) : null}

        {/* ---- 2. Classificação ---- */}
        <Section
          title="Classificação"
          trailing={
            answerSource ? (
              <span className="truncate text-2xs text-ink-3">Origem: {answerSource}</span>
            ) : null
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-extrabold leading-none text-ink">
                {evaluation.calculatedRisk ? evaluation.riskDisplay : 'Pendente'}
              </span>
              {evaluation.calculatedRisk ? (
                <Chip tone={RISK_TONE[evaluation.calculatedRisk]} solid size="sm">
                  {evaluation.isProvisional ? 'provisória' : 'apurada'}
                </Chip>
              ) : null}
            </div>

            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
              <Icons.ArrowRight size={14} className="shrink-0 text-ink-3" />
              {evaluation.nextStep.label}
            </p>

            {/* Gatilhos: quatro estados, sem parágrafo explicando cada um. */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { on: evaluation.n23, label: 'Fraude ou corrupção', tone: 'critical' as ChipTone },
                { on: evaluation.n40, label: 'Alçada do Conselho', tone: 'high' as ChipTone },
                { on: evaluation.n28, label: 'Interação pública ou PEP', tone: 'high' as ChipTone },
                { on: evaluation.n29, label: 'Licenças da atividade', tone: 'warn' as ChipTone },
              ].map((trigger) => (
                <Chip key={trigger.label} size="sm" tone={trigger.on ? trigger.tone : 'muted'} dot>
                  {trigger.label}
                </Chip>
              ))}
            </div>

            {evaluation.contradictions.length > 0 ? (
              <Note tone="high" role="alert" title="Declaração contraria fonte oficial">
                <ul className="flex flex-col gap-1">
                  {evaluation.contradictions.map((item) => (
                    <li key={item.item + item.evidence} className="text-xs">
                      Item {item.item}: {item.evidence}
                    </li>
                  ))}
                </ul>
              </Note>
            ) : null}

            {evaluation.recommendedAction ? (
              <details className="min-w-0 border-t border-line-soft pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-ink-2 hover:text-ink">
                  Plano de ação
                </summary>
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink-2">
                  {evaluation.recommendedAction}
                </p>
              </details>
            ) : null}
          </div>
        </Section>

        {/* ---- 3. Pesquisa exigida pela classificação ---- */}
        {evaluation.researchRequired ? (
          <Section
            title="Reputação e cadastros"
            subtitle="Exigidas por esta classificação."
            trailing={
              onDeepenResearch ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Icons.Search size={14} />}
                  isLoading={isResearching}
                  loadingLabel="Pesquisando…"
                  onClick={onDeepenResearch}
                >
                  Ampliar pesquisa
                </Button>
              ) : null
            }
          >
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Publicações', diligence.adverseMedia?.results?.length || 0],
                  ['Processos', discoveries.length],
                  ['Diários oficiais', diligence.officialGazettes?.results?.length || 0],
                  ['Contratos PNCP', diligence.pncp?.resumo?.confirmados || 0],
                ].map(([label, count]) => (
                  <div key={label as string} className="min-w-0">
                    <dt className="truncate text-2xs text-ink-3">{label}</dt>
                    <dd className="text-lg font-bold leading-tight text-ink">{count as number}</dd>
                  </div>
                ))}
              </dl>

              {researchNotice ? <Note tone="info">{researchNotice}</Note> : null}

              <div className="border-t border-line-soft pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink-2">Cadastros</span>
                  <span className="shrink-0 text-2xs text-ink-3">
                    {evaluation.registryCoverage.filter((item) => item.status !== 'nao-consultado').length}{' '}
                    de {evaluation.registryCoverage.length} consultados
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {evaluation.registryCoverage.map((registry) => (
                    <li key={registry.key} className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-xs text-ink-2" title={registry.label}>
                        {registry.url ? (
                          <a
                            href={registry.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-brand hover:underline"
                          >
                            {registry.label}
                          </a>
                        ) : (
                          registry.label
                        )}
                      </span>
                      <Chip
                        size="sm"
                        tone={
                          registry.status === 'consta'
                            ? 'high'
                            : registry.status === 'nada-consta'
                              ? 'ok'
                              : 'warn'
                        }
                      >
                        {registry.status === 'consta'
                          ? 'consta'
                          : registry.status === 'nada-consta'
                            ? 'nada consta'
                            : 'não consultado'}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        ) : null}

        {/* ---- 4. Checklist ---- */}
        <Section
          title="Respostas do terceiro"
          subtitle="Confira antes de gerar a linha."
          collapsible
          defaultOpen={evaluation.status !== 'completo'}
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-2 lg:grid-cols-2">
              {([...SUAPE_REQUIRED_ITEMS, 'alcadaConselho'] as Array<keyof IntegrityAnswers>).map((key) =>
                renderAnswer(
                  key,
                  ITEM_LABELS[String(key)],
                  SUAPE_QUESTION_TEXTS[key as keyof typeof SUAPE_QUESTION_TEXTS]
                )
              )}
            </div>

            <div className="border-t border-line-soft pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink-2">Programa de integridade</span>
                {evaluation.maturity.percent !== null ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-bold text-ink">{evaluation.maturity.percent}%</span>
                    <Chip size="sm" tone={MATURITY_TONE[evaluation.maturity.level || ''] || 'muted'}>
                      {evaluation.maturity.level}
                    </Chip>
                  </div>
                ) : (
                  <Chip size="sm" tone="muted">
                    sem respostas
                  </Chip>
                )}
              </div>

              {evaluation.maturity.percent !== null ? (
                <div
                  role="img"
                  aria-label={`Maturidade: ${evaluation.maturity.percent}%`}
                  className="mt-2 h-1 w-full bg-surface-subtle"
                >
                  <span
                    className="block h-full bg-brand"
                    style={{ width: `${evaluation.maturity.percent}%` }}
                  />
                </div>
              ) : null}

              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {SUAPE_MATURITY_ITEMS.map((item) =>
                  renderAnswer(item.key as keyof IntegrityAnswers, `peso ${item.weight}`, item.text)
                )}
              </div>
            </div>
          </div>
        </Section>

        {/* ---- 5. Pontos de atenção ---- */}
        <Section
          title="Pontos de atenção"
          subtitle="Vão para a coluna de observações do Mapa."
          collapsible
          defaultOpen={false}
          trailing={
            sensitivePoints.length > 0 ? (
              <Chip tone="warn" size="sm">
                {sensitivePoints.length}
              </Chip>
            ) : null
          }
        >
          <ul className="flex flex-col gap-1.5">
            {SUAPE_SENSITIVE_POINTS.map((point) => {
              const marked = sensitivePoints.includes(point.key);
              return (
                <li key={point.key}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 rounded-[var(--control-radius-md)] border px-3 py-2 transition-colors',
                      marked ? 'border-warn-line bg-warn-bg' : 'border-line bg-surface hover:bg-surface-hover',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={marked}
                      onChange={() =>
                        setSensitivePoints((previous) =>
                          previous.includes(point.key)
                            ? previous.filter((key) => key !== point.key)
                            : [...previous, point.key]
                        )
                      }
                      className="size-4 shrink-0 accent-[color:var(--brand-blue)]"
                    />
                    <span className="min-w-0 text-xs text-ink-2" title={point.text}>
                      {point.label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* ---- 6. Linha do Mapa de Risco ---- */}
        <Section
          title="Linha do Mapa de Risco"
          subtitle="40 colunas, para colar na primeira célula da linha."
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TextField
                label="Registro nº"
                value={registroId}
                onChange={(event) => setRegistroId(event.target.value)}
                controlSize="sm"
                inputMode="numeric"
              />
              <TextField
                label="Ano"
                value={anoExercicio}
                onChange={(event) => setAnoExercicio(event.target.value)}
                controlSize="sm"
                mask="year"
              />
              <Select
                label="Diretoria"
                value={diretoria}
                options={DIRETORIA_OPTIONS}
                onChange={setDiretoria}
                controlSize="sm"
              />
              <TextField
                label="Gestor(a)"
                value={gestor}
                onChange={(event) => setGestor(event.target.value)}
                controlSize="sm"
              />
              <TextField
                label="Data de entrada"
                value={dataInicio}
                onChange={(event) => setDataInicio(event.target.value)}
                controlSize="sm"
                placeholder="DD/MM/AAAA"
                mask="date"
                mono
              />
              <TextField
                label="Data de saída"
                value={dataFim}
                onChange={(event) => setDataFim(event.target.value)}
                controlSize="sm"
                placeholder="DD/MM/AAAA"
                mask="date"
                mono
                hint={`${riskMapRow.columns[5]?.value || '0'} dias úteis`}
              />
              <TextField
                label="Valor"
                value={valorContratoStr}
                onChange={(event) => onValorContratoChange(event.target.value)}
                controlSize="sm"
                mask="currency"
                placeholder="0,00"
                leading={<span className="text-2xs font-semibold">R$</span>}
                hint={
                  valorNumerico >= SUAPE_ALCADA_CONSELHO_VALOR
                    ? 'Atinge a alçada do Conselho: confirme o item no checklist.'
                    : undefined
                }
              />
              <TextField
                label="Processo SEI"
                value={processoSei}
                onChange={(event) => setProcessoSei(event.target.value)}
                controlSize="sm"
                mask="processoSei"
                mono
              />
              <TextField
                label="Nota orientativa"
                value={notaTecnica}
                onChange={(event) => setNotaTecnica(event.target.value)}
                controlSize="sm"
              />
            </div>

            {riskMapRow.blockers.length > 0 ? (
              <Note tone="warn" title="Revise antes de colar">
                <ul className="flex flex-col gap-0.5">
                  {riskMapRow.blockers.map((blocker) => (
                    <li key={blocker} className="text-xs">
                      {blocker}
                    </li>
                  ))}
                </ul>
              </Note>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={copied ? 'success' : 'primary'}
                size="sm"
                icon={copied ? <Icons.Check size={15} /> : <Icons.Copy size={15} />}
                disabled={copyBlocked}
                onClick={handleCopyRow}
              >
                {copied ? 'Linha copiada' : 'Copiar linha'}
              </Button>
              {onFillSuapeSheet ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Icons.Database size={15} />}
                  disabled={copyBlocked}
                  isLoading={preenchendoPlanilha}
                  loadingLabel="Preenchendo…"
                  title={copyBlocked ? 'Importe o questionário para liberar o formulário.' : undefined}
                  onClick={handleFillSheet}
                >
                  Preencher formulário de SUAPE
                </Button>
              ) : null}
              {onDownloadIntegrityForm ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Icons.Download size={15} />}
                  disabled={copyBlocked}
                  isLoading={emitindoFormulario}
                  loadingLabel="Gerando PDF…"
                  title={copyBlocked ? 'Importe o questionário para liberar o formulário.' : undefined}
                  onClick={handleDownloadForm}
                >
                  Baixar formulário preenchido
                </Button>
              ) : null}
              {onSaveRiskMapRow ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Icons.Database size={15} />}
                  disabled={copyBlocked}
                  isLoading={savingRow}
                  loadingLabel="Gravando…"
                  title={copyBlocked ? 'Importe o questionário para liberar a linha.' : undefined}
                  onClick={handleSaveRow}
                >
                  Salvar no Mapa de Risco
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowColumns((previous) => !previous)}
                rightIcon={showColumns ? <Icons.ChevronUp size={14} /> : <Icons.ChevronDown size={14} />}
              >
                {showColumns ? 'Ocultar colunas' : 'Conferir as 40 colunas'}
              </Button>
            </div>

            {rowNotice ? <Note role="status">{rowNotice}</Note> : null}
            {erroFormulario ? <Note tone="high" role="alert">{erroFormulario}</Note> : null}
            {avisoPlanilha ? (
              <Note role="status">
                {avisoPlanilha}
                {suapeSheetUrl ? (
                  <>
                    {' '}
                    <a
                      href={suapeSheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold underline"
                    >
                      Abrir a planilha ↗
                    </a>
                  </>
                ) : null}
              </Note>
            ) : null}
            {erroPlanilha ? <Note tone="high" role="alert">{erroPlanilha}</Note> : null}

            {showColumns ? (
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-line">
                <table className="w-full table-fixed text-xs">
                  <tbody>
                    {riskMapRow.columns.map((column) => (
                      <tr key={column.index} className="border-b border-line-soft last:border-0">
                        <td className="w-10 px-3 py-1.5 text-2xs text-ink-3">{column.letter}</td>
                        <td className="w-2/5 truncate px-2 py-1.5 text-ink-3" title={column.name}>
                          {column.name}
                        </td>
                        <td className="truncate px-3 py-1.5 font-medium text-ink" title={column.value}>
                          {column.value || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </Section>
      </div>
    </div>
  );
};
