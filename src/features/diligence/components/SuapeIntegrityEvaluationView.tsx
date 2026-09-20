import React, { useState, useMemo, useEffect } from 'react';
import type { DiligenceItem, ProcessDiscovery } from '../types';
import { Icons } from '../../../components/ui/Icons';
import {
  evaluateSuapeIntegrity,
  generateRiskMapRow,
  SUAPE_DIRETORIAS,
  SUAPE_MATURITY_ITEMS,
  SUAPE_QUESTION_TEXTS,
  SUAPE_QUESTIONARIO_VALOR_MINIMO,
  SUAPE_REQUIRED_ITEMS,
  SUAPE_SENSITIVE_POINTS,
  type SuapeCalculatedRisk,
  type QuestionnaireAnswer,
  type IntegrityAnswers,
} from '../utils/suapeRiskMapRowGenerator';
import {
  QuestionnaireImportPanel,
  type QuestionnaireImportPayload,
} from './QuestionnaireImportPanel';

interface SuapeIntegrityEvaluationViewProps {
  diligence: DiligenceItem;
  discoveries?: ProcessDiscovery[];
  /**
   * As respostas moram no dashboard para que o dossiê, o grafo e esta
   * tela mostrem a mesma classificação. Duas telas calculando risco por
   * conta própria foi exatamente o que esta unificação desfez.
   */
  answers: IntegrityAnswers;
  onAnswersChange: (answers: IntegrityAnswers) => void;
  valorContratoStr: string;
  onValorContratoChange: (value: string) => void;
  onOpenEvidence?: () => void;
  onOpenNetwork?: () => void;
  /**
   * Risco Alto e Muito Alto exigem aprofundamento. A varredura é a que a
   * diligência já executa — aqui ela é apenas reexecutada com foco,
   * em vez de o analista ter que lembrar de ir até a aba de notícias.
   */
  onDeepenResearch?: () => void;
  isResearching?: boolean;
  researchNotice?: string | null;
}

/** Enunciados dos itens de maturidade, para o checklist de governança. */
const MATURITY_TEXT_BY_KEY = Object.fromEntries(
  SUAPE_MATURITY_ITEMS.map((item) => [item.key, item.text])
) as Record<string, string>;

export const SuapeIntegrityEvaluationView: React.FC<SuapeIntegrityEvaluationViewProps> = ({
  diligence,
  discoveries = [],
  answers: questionAnswers,
  onAnswersChange: setQuestionAnswers,
  valorContratoStr,
  onValorContratoChange: setValorContratoStr,
  onOpenEvidence,
  onOpenNetwork,
  onDeepenResearch,
  isResearching = false,
  researchNotice,
}) => {
  // Parâmetros editáveis da linha do Mapa de Risco (sem valores hardcoded fictícios)
  const [gestor, setGestor] = useState('');
  const [diretoria, setDiretoria] = useState(() => localStorage.getItem('suape_diretoria') || '');
  const [registroId, setRegistroId] = useState('');
  const [anoExercicio, setAnoExercicio] = useState(() => String(new Date().getFullYear()));
  const [processoSei, setProcessoSei] = useState('');
  const [notaTecnica, setNotaTecnica] = useState('');

  // Datas padrão (Ontem -> Hoje)
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const formatDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  const [dataInicio, setDataInicio] = useState(formatDate(yesterday));
  const [dataFim, setDataFim] = useState(formatDate(now));
  // Vazio deixa o gerador calcular os dias úteis a partir das datas.
  const [diasUteis, setDiasUteis] = useState('');

  // Origem das respostas em vigor, para o rodapé de auditoria.
  const [answerSource, setAnswerSource] = useState<string | null>(null);

  // Item 3.5 da política: alertas que só quem conduz o processo percebe.
  // Nenhuma fonte responde por eles, então são marcação do analista e
  // viajam para a coluna OBSERVAÇÕES do Mapa.
  const [sensitivePoints, setSensitivePoints] = useState<string[]>([]);

  // A diretoria demandante costuma se repetir entre diligências do
  // mesmo analista, então vale guardar; o gestor muda a cada contrato.
  useEffect(() => {
    if (diretoria) localStorage.setItem('suape_diretoria', diretoria);
  }, [diretoria]);

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

  /**
   * Aplica o que veio da transcrição por IA ou da leitura do arquivo.
   * Campos já preenchidos à mão pelo analista não são sobrescritos: o
   * que ele digitou vale mais do que o que a extração deduziu.
   */
  const handleImportApply = (payload: QuestionnaireImportPayload) => {
    setQuestionAnswers({ ...EMPTY_ANSWERS, ...payload.answers });
    setAnswerSource(payload.origem);

    if (payload.valorContrato !== null && !valorContratoStr.trim()) {
      setValorContratoStr(
        payload.valorContrato.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    }
    if (payload.processoSei && !processoSei.trim()) setProcessoSei(payload.processoSei);
    if (payload.diretoria && !diretoria.trim() && SUAPE_DIRETORIAS.includes(payload.diretoria)) {
      setDiretoria(payload.diretoria);
    }
    if (payload.gestor && !gestor.trim()) setGestor(payload.gestor);
  };

  const handleClearAnswers = () => {
    setQuestionAnswers(EMPTY_ANSWERS);
    setAnswerSource(null);
  };

  const handleSetAnswer = (key: keyof IntegrityAnswers, value: QuestionnaireAnswer) => {
    setQuestionAnswers({ ...questionAnswers, [key]: value });
  };

  const valorNumerico = useMemo(() => {
    if (!valorContratoStr.trim()) return 0;
    const clean = valorContratoStr
      .replace(/[^\d,.-]/g, '')
      .replace(/\.(?=\d{3}\b)/g, '')
      .replace(',', '.');
    return parseFloat(clean) || 0;
  }, [valorContratoStr]);

  const evaluation = useMemo(() => {
    return evaluateSuapeIntegrity(diligence, valorNumerico, questionAnswers);
  }, [diligence, valorNumerico, questionAnswers]);

  const observacoes = useMemo(() => {
    if (sensitivePoints.length === 0) return '';
    const marcados = SUAPE_SENSITIVE_POINTS.filter((point) => sensitivePoints.includes(point.key));
    return `Pontos sensíveis (item 3.5 da política): ${marcados
      .map((point) => `(${point.letter}) ${point.text}`)
      .join(' ')}`;
  }, [sensitivePoints]);

  const riskMapRow = useMemo(() => {
    const formattedValor =
      valorNumerico > 0
        ? ` R$  ${valorNumerico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} `
        : valorContratoStr.trim()
          ? valorContratoStr
          : '';

    return generateRiskMapRow(diligence, {
      id: registroId,
      ano: anoExercicio,
      dataInicio,
      dataFim,
      dias: diasUteis,
      diretoriaDemandante: diretoria,
      gestor,
      razaoSocial: diligence.razaoSocial,
      cnpj: diligence.cnpjFmt,
      valorContrato: formattedValor,
      notaTecnica,
      processoSei,
      observacoes,
      answers: questionAnswers,
      customEvaluation: evaluation,
    });
  }, [
    diligence,
    registroId,
    anoExercicio,
    dataInicio,
    dataFim,
    diasUteis,
    diretoria,
    gestor,
    valorNumerico,
    valorContratoStr,
    notaTecnica,
    processoSei,
    observacoes,
    questionAnswers,
    evaluation,
  ]);

  const [copied, setCopied] = useState(false);

  const [copyError, setCopyError] = useState<string | null>(null);

  /**
   * Sem classificação não há linha a registrar: o Mapa de Risco é o
   * registro do resultado da diligência, não do que ainda falta apurar.
   * Os demais bloqueios são avisos, e o analista decide se prossegue.
   */
  const copyBlocked = evaluation.calculatedRisk === null;

  const handleCopyRow = async () => {
    if (copyBlocked) {
      setCopyError('Importe o Questionário de Diligência antes de gerar a linha do Mapa de Risco.');
      setTimeout(() => setCopyError(null), 5000);
      return;
    }
    try {
      await navigator.clipboard.writeText(riskMapRow.rawLine);
      setCopied(true);
      setCopyError(null);
      setTimeout(() => setCopied(false), 3500);
    } catch {
      setCopyError('Não foi possível acessar a área de transferência. Copie a linha pelo painel abaixo.');
      setTimeout(() => setCopyError(null), 5000);
    }
  };

  const riskBadgeColors: Record<
    SuapeCalculatedRisk,
    { bg: string; text: string; border: string; iconColor: string }
  > = {
    'Muito Alto': {
      bg: 'bg-rose-50 border-rose-200 text-rose-800',
      text: 'text-rose-900',
      border: 'border-rose-300',
      iconColor: 'text-rose-600',
    },
    'Alto': {
      bg: 'bg-amber-50 border-amber-300 text-amber-900',
      text: 'text-amber-950',
      border: 'border-amber-400',
      iconColor: 'text-amber-600',
    },
    'Médio': {
      bg: 'bg-yellow-50 border-yellow-200 text-yellow-800',
      text: 'text-yellow-900',
      border: 'border-yellow-300',
      iconColor: 'text-yellow-600',
    },
    'Baixo': {
      bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      text: 'text-emerald-900',
      border: 'border-emerald-300',
      iconColor: 'text-emerald-600',
    },
  };

  const PENDING_BADGE = {
    bg: 'bg-slate-100 border-slate-300 text-slate-700',
    text: 'text-slate-800',
    border: 'border-slate-300',
    iconColor: 'text-slate-500',
  };
  const badgeStyle = evaluation.calculatedRisk
    ? riskBadgeColors[evaluation.calculatedRisk]
    : PENDING_BADGE;

  const answeredCount = SUAPE_REQUIRED_ITEMS.filter(
    (item) => questionAnswers[item] === true || questionAnswers[item] === false
  ).length;

  const renderTriStateQuestion = (
    key: keyof IntegrityAnswers,
    label: string,
    description: string
  ) => {
    const val = questionAnswers[key];
    const isUnset = val === null;

    return (
      <div
        key={key}
        className={`rounded-xl border p-3.5 transition-all ${
          isUnset
            ? 'border-amber-300 bg-amber-50/50'
            : val === true
            ? 'border-rose-200 bg-white shadow-2xs'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-800">{label}</span>
              {isUnset && (
                <span className="rounded bg-amber-200 px-1.5 py-0.5 text-3xs font-black text-amber-900 animate-pulse">
                  Requer confirmação
                </span>
              )}
            </div>
            <p className="mt-1 text-2xs leading-relaxed text-slate-500 line-clamp-3" title={description}>
              {description}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => handleSetAnswer(key, true)}
              className={`rounded-md px-2.5 py-1 text-2xs font-extrabold transition-all ${
                val === true
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-rose-700 hover:bg-white/60'
              }`}
            >
              Sim
            </button>
            <button
              type="button"
              onClick={() => handleSetAnswer(key, false)}
              className={`rounded-md px-2.5 py-1 text-2xs font-extrabold transition-all ${
                val === false
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-emerald-700 hover:bg-white/60'
              }`}
            >
              Não
            </button>
            <button
              type="button"
              onClick={() => handleSetAnswer(key, null)}
              className={`rounded-md px-2 py-1 text-2xs font-extrabold transition-all ${
                isUnset
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-white/60'
              }`}
              title="Não identificado no questionário (requer confirmação humana)"
            >
              ?
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex-1 overflow-x-hidden bg-slate-50 text-slate-900 pb-16">
      {/* HEADER DA VISÃO DE INTEGRIDADE SUAPE */}
      <section className="border-b border-slate-200 bg-white shadow-xs">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#0F2D59]/10 px-2 py-0.5 text-xs font-black uppercase tracking-wider text-[#0F2D59]">
                  <Icons.ShieldCheck size={13} className="text-[#0F2D59]" />
                  Compliance SUAPE
                </span>
                <span className="text-xs text-slate-400">|</span>
                <span className="text-xs font-medium text-slate-500">
                  Planilha Oficial: <code className="font-semibold text-slate-700">Avaliação de Integridade - xx.xlsx</code>
                </span>
              </div>
              <h1 className="mt-1 text-xl font-black tracking-tight text-[#0F2D59] sm:text-2xl">
                Avaliação de Integridade & Linha do Mapa de Risco
              </h1>
              <p className="mt-0.5 text-xs text-slate-600">
                Cálculo de risco oficial por fórmulas exatas e linha formatada para colar no Excel com <kbd className="rounded bg-slate-200 px-1 py-0.5 font-mono text-3xs font-bold text-slate-700">Ctrl+V</kbd>.
              </p>
            </div>

            {/* AÇÕES DO CABEÇALHO — BARRA UNIFICADA COM DESIGN REFINADO */}
            <div className="flex items-center gap-2 shrink-0">
              {onOpenNetwork && (
                <button
                  type="button"
                  onClick={onOpenNetwork}
                  className="flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
                >
                  <Icons.Network size={15} className="text-[#0F2D59]" />
                  <span>Ver Grafo</span>
                </button>
              )}

              {onOpenEvidence && (
                <button
                  type="button"
                  onClick={onOpenEvidence}
                  className="flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
                >
                  <Icons.ShieldCheck size={15} className="text-emerald-600" />
                  <span>Evidências</span>
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-3xs font-bold text-slate-600">
                    {discoveries.length}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={handleCopyRow}
                disabled={copyBlocked}
                title={
                  copyBlocked
                    ? 'Importe o Questionário de Diligência para liberar a linha do Mapa de Risco.'
                    : undefined
                }
                className={`flex h-10 items-center gap-2.5 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition-all active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none disabled:active:scale-100 ${
                  copied
                    ? 'bg-emerald-600 shadow-emerald-600/25'
                    : 'bg-[#0F2D59] hover:bg-[#153e7a] shadow-[#0F2D59]/20 hover:shadow-md'
                }`}
              >
                {copied ? <Icons.Check size={16} /> : <Icons.Copy size={16} />}
                <span>{copied ? 'Linha copiada!' : 'Copiar linha para o mapa'}</span>
                <span className="rounded bg-white/20 px-1.5 py-0.5 text-3xs font-extrabold text-white/90">
                  40 col
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {copyError && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="flex items-center gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-900">
            <Icons.AlertTriangle size={16} className="shrink-0 text-rose-600" />
            <span>{copyError}</span>
          </div>
        </div>
      )}

      {riskMapRow.blockers.length > 0 && !copyBlocked && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2">
              <Icons.AlertTriangle size={15} className="shrink-0 text-amber-600" />
              <span className="text-xs font-black text-amber-900">
                A linha pode ser copiada, mas revise antes de colar no Mapa:
              </span>
            </div>
            <ul className="mt-1.5 space-y-0.5 pl-6">
              {riskMapRow.blockers.map((blocker) => (
                <li key={blocker} className="text-2xs text-amber-900">
                  • {blocker}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* FEEDBACK TOAST DE CÓPIA */}
      {copied && (
        <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white">
                <Icons.Check size={16} />
              </span>
              <div>
                <p className="text-xs font-black">Linha de 40 colunas copiada para a área de transferência!</p>
                <p className="text-2xs text-emerald-700">
                  Abra a planilha do Mapa de Risco no Excel (<code className="font-semibold">Mapa de Risco.xlsx</code>, aba <code className="font-semibold">Mapa de Risco</code>), selecione a célula da primeira coluna da linha desejada e pressione <strong>Ctrl+V</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCopied(false)}
              className="rounded-md p-1 text-emerald-600 hover:bg-emerald-100"
            >
              <Icons.Close size={14} />
            </button>
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main className="mx-auto mt-6 max-w-6xl px-4 sm:px-6 space-y-6">
        {/* SEÇÃO 1: INGESTÃO DO QUESTIONÁRIO DE DILIGÊNCIA */}
        <QuestionnaireImportPanel
          razaoSocial={diligence.razaoSocial}
          cnpj={diligence.cnpjFmt || diligence.cnpj}
          answeredCount={answeredCount}
          totalItems={SUAPE_REQUIRED_ITEMS.length}
          onApply={handleImportApply}
          onClear={handleClearAnswers}
        />

        {/* SEÇÃO 2: RESULTADO OFICIAL — CÉLULA J16 & AS 4 CÉLULAS DA FÓRMULA */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-3xs font-black uppercase tracking-widest text-slate-400">
                  Resultado Oficial da Planilha SUAPE — Célula J16
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-lg font-black shadow-xs ${badgeStyle.bg}`}>
                    {evaluation.calculatedRisk ? (
                      <Icons.ShieldAlert size={20} className={badgeStyle.iconColor} />
                    ) : (
                      <Icons.Clock size={20} className={badgeStyle.iconColor} />
                    )}
                    {evaluation.calculatedRisk ? evaluation.riskDisplay : 'Classificação pendente'}
                  </span>
                  {evaluation.isProvisional && (
                    <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-2xs font-black text-amber-900">
                      Provisório · {evaluation.unidentifiedItems.length} item(ns) sem resposta
                    </span>
                  )}
                  <span className="hidden text-xs text-slate-500 sm:inline">
                    Terceiro: <strong className="text-slate-800">{diligence.razaoSocial}</strong> ({diligence.cnpjFmt})
                  </span>
                </div>
                {evaluation.calculatedRisk === null && (
                  <p className="mt-2 max-w-2xl text-xs text-slate-600">
                    A planilha oficial classifica pelas respostas do terceiro. Enquanto o Questionário de
                    Diligência não for importado acima, esta tela entrega as evidências da pesquisa e não
                    arbitra um nível de risco.
                  </p>
                )}
              </div>

              {/* FÓRMULA OFICIAL DA PLANILHA */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                <span className="text-3xs font-bold uppercase tracking-wider text-slate-400">
                  Fórmula Oficial da Célula J16
                </span>
                <p className="mt-0.5 font-mono text-2xs font-bold text-[#0F2D59]">
                  {evaluation.formulaUsed}
                </p>
              </div>
            </div>
          </div>

          {/* AS 4 CÉLULAS-CHAVE DA FÓRMULA */}
          <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
            {/* CÉLULA N23 */}
            <div className={`p-5 ${evaluation.n23 ? 'bg-rose-50/70' : 'bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-slate-700">Célula N23</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-3xs font-black uppercase ${
                    evaluation.n23 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {evaluation.n23 ? 'VERDADEIRO' : 'FALSO'}
                </span>
              </div>
              <h3 className="mt-2 text-xs font-bold text-slate-900">
                Fraude, Corrupção e Sanções
              </h3>
              <p className="mt-1 text-3xs text-slate-500">
                Itens 4.4 (condenação da PJ) ou 5.2 (condenação de sócios), como respondidos pelo terceiro.
              </p>
              <div className="mt-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 text-3xs">
                {evaluation.triggers.n23Reasons.length > 0 ? (
                  <ul className="space-y-1 text-rose-800 font-medium">
                    {evaluation.triggers.n23Reasons.map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="font-semibold text-slate-600">
                    {evaluation.status === 'pendente'
                      ? 'Aguardando as respostas dos itens 4.4 e 5.2.'
                      : 'Itens 4.4 e 5.2 respondidos negativamente pelo terceiro.'}
                  </span>
                )}
              </div>
            </div>

            {/* CÉLULA N40 */}
            <div className={`p-5 ${evaluation.n40 ? 'bg-rose-50/70' : 'bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-slate-700">Célula N40</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-3xs font-black uppercase ${
                    evaluation.n40 ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {evaluation.n40 ? 'VERDADEIRO' : 'FALSO'}
                </span>
              </div>
              <h3 className="mt-2 text-xs font-bold text-slate-900">
                Alçada do Conselho de Adm.
              </h3>
              <p className="mt-1 text-3xs text-slate-500">
                Linha 40: obrigações autorizadas por alçada do Conselho — um ato, não um valor. O
                patamar de R$ 10.000.000,00 é indício, e a marcação continua sendo do questionário.
              </p>
              <div className="mt-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 text-3xs">
                {evaluation.n40 ? (
                  <span className="font-bold text-amber-900">
                    Contratação autorizada por alçada do Conselho de Administração.
                  </span>
                ) : valorNumerico >= 10000000 ? (
                  <span className="font-bold text-amber-900">
                    Valor atinge o patamar de alçada. Confirme no item correspondente se as obrigações
                    foram de fato autorizadas pelo Conselho.
                  </span>
                ) : (
                  <span className="font-medium text-slate-600">
                    Item não marcado no questionário.
                  </span>
                )}
              </div>
            </div>

            {/* CÉLULA N28 */}
            <div className={`p-5 ${evaluation.n28 ? 'bg-amber-50/70' : 'bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-slate-700">Célula N28</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-3xs font-black uppercase ${
                    evaluation.n28 ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {evaluation.n28 ? 'VERDADEIRO' : 'FALSO'}
                </span>
              </div>
              <h3 className="mt-2 text-xs font-bold text-slate-900">
                Interação Pública / Licenças / PEP
              </h3>
              <p className="mt-1 text-3xs text-slate-500">
                Itens 7.1, 7.3, 7.4, 7.5, 7.6 (PEP), 7.7, 7.8 e 7.9 (Risco Alto).
              </p>
              <div className="mt-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 text-3xs">
                {evaluation.triggers.n28Reasons.length > 0 ? (
                  <ul className="space-y-1 text-amber-900 font-medium">
                    {evaluation.triggers.n28Reasons.map((r, i) => (
                      <li key={i} className="line-clamp-2" title={r}>
                        • {r}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-600 font-medium">
                    Nenhum gatilho de interação governamental ou PEP ativo.
                  </span>
                )}
              </div>
            </div>

            {/* CÉLULA N29 */}
            <div className={`p-5 ${evaluation.n29 ? 'bg-yellow-50/70' : 'bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-slate-700">Célula N29</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-3xs font-black uppercase ${
                    evaluation.n29 ? 'bg-yellow-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {evaluation.n29 ? 'VERDADEIRO' : 'FALSO'}
                </span>
              </div>
              <h3 className="mt-2 text-xs font-bold text-slate-900">
                Licenças Ordinárias da Atividade
              </h3>
              <p className="mt-1 text-3xs text-slate-500">
                Item 7.2: Exigência de ART, RRT, Licenças de Funcionamento / CPRH.
              </p>
              <div className="mt-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 text-3xs">
                {evaluation.n29 ? (
                  <span className="text-yellow-900 font-medium line-clamp-2" title={SUAPE_QUESTION_TEXTS['7.2']}>
                    • {SUAPE_QUESTION_TEXTS['7.2']}
                  </span>
                ) : (
                  <span className="text-slate-600 font-medium">
                    Atividade não sujeita a licenciamento ordinário especial.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* DIVERGÊNCIA DA PRÓPRIA PLANILHA NA ALÇADA DO CONSELHO */}
          {evaluation.alcadaDivergence && (
            <div className="border-t border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-start gap-2.5">
                <Icons.AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                <div>
                  <span className="text-3xs font-black uppercase tracking-wider text-amber-800">
                    Divergência registrada na planilha oficial
                  </span>
                  <p className="mt-1 text-2xs leading-relaxed text-amber-900">
                    {evaluation.alcadaDivergence.note}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* CONTRADIÇÃO ENTRE A DECLARAÇÃO DO TERCEIRO E A FONTE OFICIAL */}
          {evaluation.contradictions.length > 0 && (
            <div className="border-t border-rose-200 bg-rose-50 p-4">
              <div className="flex items-start gap-2.5">
                <Icons.AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" />
                <div className="min-w-0 flex-1">
                  <span className="text-3xs font-black uppercase tracking-wider text-rose-800">
                    O terceiro declarou "Não" onde a fonte oficial registra o contrário
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {evaluation.contradictions.map((contradiction) => (
                      <li key={contradiction.item + contradiction.evidence} className="text-2xs text-rose-900">
                        <strong>Item {contradiction.item}:</strong> {contradiction.evidence}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-3xs text-rose-700">
                    Resolva no checklist abaixo antes de gerar a linha do Mapa. Manter a resposta do
                    terceiro exige justificativa no parecer.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* EVIDÊNCIAS QUE A PESQUISA TROUXE PARA OS ITENS DO QUESTIONÁRIO */}
          {evaluation.evidenceSignals.length > 0 && (
            <div className="border-t border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-3xs font-black uppercase tracking-wider text-slate-500">
                  Evidências da pesquisa para responder o questionário
                </span>
                <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-3xs font-bold text-slate-600">
                  Não classificam sozinhas
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {evaluation.evidenceSignals.map((signal) => (
                  <li
                    key={signal.item + signal.source}
                    className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5 text-2xs"
                  >
                    <span className="shrink-0 rounded bg-[#0F2D59]/10 px-1.5 py-0.5 font-black text-[#0F2D59]">
                      {signal.item}
                    </span>
                    <span className="text-slate-700">
                      <strong className="text-slate-900">{signal.source}:</strong> {signal.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* BLOCO 04: MATURIDADE DO PROGRAMA DE INTEGRIDADE (L44 / M44) */}
          <div className="border-t border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-3xs font-black uppercase tracking-wider text-slate-500">
                  Bloco 04 — Maturidade do Programa de Integridade
                </span>
                <p className="mt-0.5 font-mono text-3xs text-slate-500">{evaluation.maturity.formulaUsed}</p>
              </div>
              {evaluation.maturity.percent !== null ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black text-[#0F2D59]">{evaluation.maturity.percent}%</span>
                  <span
                    className={`rounded-lg px-2.5 py-1 text-2xs font-black ${
                      evaluation.maturity.level === 'Baixo'
                        ? 'bg-emerald-100 text-emerald-900'
                        : evaluation.maturity.level === 'Médio'
                          ? 'bg-yellow-100 text-yellow-900'
                          : evaluation.maturity.level === 'Alto'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-rose-100 text-rose-900'
                    }`}
                  >
                    Risco de maturidade: {evaluation.maturity.level}
                  </span>
                </div>
              ) : (
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-2xs font-bold text-slate-600">
                  Sem respostas do bloco 8/9
                </span>
              )}
            </div>

            {evaluation.maturity.percent !== null && (
              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#0F2D59] transition-all"
                  style={{ width: `${evaluation.maturity.percent}%` }}
                />
              </div>
            )}

            <p className="mt-2 text-3xs text-slate-500">
              {evaluation.maturity.pointsEarned.toFixed(2)} de {evaluation.maturity.totalWeight} pontos.
              {evaluation.maturity.unanswered.length > 0 &&
                ` ${evaluation.maturity.unanswered.length} item(ns) do bloco 8/9 sem resposta não pontuam: a nota está incompleta, não necessariamente baixa.`}
              {evaluation.maturity.registriesHit.length > 0 &&
                ` Cadastros atingidos: ${evaluation.maturity.registriesHit.join(', ')}.`}
            </p>
          </div>

          {/* PLANO DE AÇÃO RECOMENDADO (CÉLULA B48) */}
          {evaluation.recommendedAction && (
            <div className="border-t border-slate-200 bg-slate-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0F2D59] text-white">
                  <Icons.CheckCircle size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-3xs font-black uppercase tracking-wider text-slate-500">
                      Plano de Ação Mitigatório (Célula B48 da planilha oficial)
                    </span>
                    {answerSource && (
                      <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-3xs font-bold text-slate-600">
                        Origem: {answerSource}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-xs font-semibold leading-relaxed text-slate-900">
                    {evaluation.recommendedAction}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SEÇÃO 2B: APROFUNDAMENTO EXIGIDO POR RISCO ALTO E MUITO ALTO */}
        {(evaluation.calculatedRisk === 'Alto' || evaluation.calculatedRisk === 'Muito Alto') && (
          <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/60 p-5 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-white">
                    <Icons.Search size={15} />
                  </span>
                  <h2 className="text-sm font-black text-amber-900">
                    {evaluation.riskDisplay} — pesquisas obrigatórias (itens 3.3.2 e 3.3.3)
                  </h2>
                </div>
                <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-amber-900">
                  Item 3.3 da Política de Contratação de Terceiros: classificado o terceiro em risco
                  alto ou muito alto, as pesquisas de reputação (3.3.2) e a verificação nos cadastros
                  desabonadores (3.3.3) <strong>deverão</strong> ser realizadas. A busca abaixo é a
                  mesma que a diligência já executa, reiniciada com foco no terceiro.
                </p>

                {evaluation.triggeredRisks.length > 0 && (
                  <ul className="mt-2.5 space-y-1">
                    {evaluation.triggeredRisks.map((risk) => (
                      <li key={risk.slot} className="flex items-start gap-2 text-2xs text-amber-900">
                        <span className="mt-0.5 shrink-0 rounded bg-amber-200 px-1.5 py-0.5 font-black text-amber-900">
                          Risco {risk.slot}
                        </span>
                        <span className="line-clamp-2" title={risk.text}>
                          {risk.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {onDeepenResearch && (
                <button
                  type="button"
                  onClick={onDeepenResearch}
                  disabled={isResearching}
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white shadow-sm transition-all hover:bg-amber-700 active:scale-95 disabled:opacity-60"
                >
                  {isResearching ? (
                    <Icons.RefreshCw size={15} className="animate-spin" />
                  ) : (
                    <Icons.Search size={15} />
                  )}
                  <span>{isResearching ? 'Pesquisando…' : 'Ampliar pesquisa reputacional'}</span>
                </button>
              )}
            </div>

            {/* O que a pesquisa já trouxe, para o analista não achar que
                está começando do zero. */}
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-amber-200 bg-amber-200 sm:grid-cols-4">
              {[
                ['Publicações', diligence.adverseMedia?.results?.length || 0],
                ['Processos', discoveries.length],
                ['Diários oficiais', diligence.officialGazettes?.results?.length || 0],
                ['Contratos PNCP', diligence.pncp?.resumo?.confirmados || 0],
              ].map(([label, count]) => (
                <div key={label as string} className="bg-white px-3 py-2.5 text-center">
                  <dt className="text-3xs font-bold uppercase tracking-wider text-slate-500">{label}</dt>
                  <dd className="text-lg font-black text-[#0F2D59]">{count as number}</dd>
                </div>
              ))}
            </dl>

            {/* Item 3.3.3 — os 8 cadastros desabonadores da política. */}
            <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-3xs font-black uppercase tracking-wider text-slate-500">
                  Item 3.3.3 — Cadastros e bancos de dados
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-3xs font-bold text-slate-600">
                  {evaluation.registryCoverage.filter((r) => r.status !== 'nao-consultado').length} de{' '}
                  {evaluation.registryCoverage.length} consultados
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {evaluation.registryCoverage.map((registry) => (
                  <li key={registry.key} className="flex items-start gap-2 text-2xs">
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-black ${
                        registry.status === 'consta'
                          ? 'bg-rose-100 text-rose-900'
                          : registry.status === 'nada-consta'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {registry.status === 'consta'
                        ? 'CONSTA'
                        : registry.status === 'nada-consta'
                          ? 'NADA CONSTA'
                          : 'NÃO CONSULTADO'}
                    </span>
                    <span className="min-w-0 text-slate-700">
                      {registry.url ? (
                        <a
                          href={registry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-slate-300 underline-offset-2 hover:text-[#0F2D59]"
                        >
                          {registry.label}
                        </a>
                      ) : (
                        registry.label
                      )}
                      {registry.detail ? (
                        <span className="text-amber-800"> — {registry.detail}</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {researchNotice && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-white p-2.5 text-2xs font-semibold text-amber-900">
                {researchNotice}
              </p>
            )}
          </section>
        )}

        {/* SEÇÃO 3: CHECKLIST AUDITÁVEL DAS PERGUNTAS DO QUESTIONÁRIO (INTERATIVO) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-[#0F2D59]">
                  Checklist dos Fatores de Integridade (Perguntas Oficiais SUAPE)
                </h2>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-3xs font-extrabold text-slate-600">
                  Respostas Tri-State Oficiais
                </span>
              </div>
              <p className="text-2xs text-slate-500 mt-0.5">
                Revise ou confirme as respostas extraídas do questionário (Sim, Não ou Não identificado) para auditar o impacto imediato na fórmula J16 e nas colunas 26 a 28 do Mapa de Risco.
              </p>
            </div>
            {evaluation.unidentifiedItems.length > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-3xs font-black text-amber-900 border border-amber-300">
                {evaluation.unidentifiedItems.length} pendente(s) de confirmação
              </span>
            )}
          </div>

          <div className="mt-4 space-y-4">
            {/* GRUPO N23: FRAUDE E CORRUPÇÃO */}
            <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                <span className="text-3xs font-black uppercase tracking-wider text-rose-800">
                  Gatilho Célula N23 → Risco Muito Alto
                </span>
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-3xs font-bold text-rose-900">
                  N23 (Itens 4.4 e 5.2)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderTriStateQuestion('4.4', 'Item 4.4: Corrupção PJ / Licitações', SUAPE_QUESTION_TEXTS['4.4'])}
                {renderTriStateQuestion('5.2', 'Item 5.2: Crimes Sócios', SUAPE_QUESTION_TEXTS['5.2'])}
              </div>
            </div>

            {/* GRUPO N40: ALÇADA DO CONSELHO DE ADMINISTRAÇÃO */}
            <div className="rounded-xl border border-rose-100 bg-rose-50/20 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                <span className="text-3xs font-black uppercase tracking-wider text-rose-800">
                  Gatilho Célula N40 → Risco Alto
                </span>
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-3xs font-bold text-rose-900">
                  N40 (Alçada Conselho)
                </span>
              </div>
              {renderTriStateQuestion('alcadaConselho', 'Row 40: Alçada do Conselho de Administração', SUAPE_QUESTION_TEXTS.alcadaConselho)}
            </div>

            {/* GRUPO N28: INTERAÇÃO PÚBLICA & PEP */}
            <div className="rounded-xl border border-amber-100 bg-amber-50/20 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-amber-100 pb-2">
                <span className="text-3xs font-black uppercase tracking-wider text-amber-800">
                  Gatilho Célula N28 → Risco Alto
                </span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-3xs font-bold text-amber-900">
                  N28 (Itens 7.1, 7.3 a 7.9)
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderTriStateQuestion('7.1', 'Item 7.1: Atividade Regulada', SUAPE_QUESTION_TEXTS['7.1'])}
                {renderTriStateQuestion('7.3', 'Item 7.3: Licenças Contratuais / Órgãos Públicos / PEP', SUAPE_QUESTION_TEXTS['7.3'])}
                {renderTriStateQuestion('7.4', 'Item 7.4: Interação com Órgão Governamental / PEP', SUAPE_QUESTION_TEXTS['7.4'])}
                {renderTriStateQuestion('7.5', 'Item 7.5: Representação de Suape perante Terceiros', SUAPE_QUESTION_TEXTS['7.5'])}
                {renderTriStateQuestion('7.6', 'Item 7.6: PEP Sócio / Administrador', SUAPE_QUESTION_TEXTS['7.6'])}
                {renderTriStateQuestion('7.7', 'Item 7.7: Familiar PEP', SUAPE_QUESTION_TEXTS['7.7'])}
                {renderTriStateQuestion('7.8', 'Item 7.8: Familiar com Influência Relevante em Suape', SUAPE_QUESTION_TEXTS['7.8'])}
                {renderTriStateQuestion('7.9', 'Item 7.9: Participação Governamental nos Negócios', SUAPE_QUESTION_TEXTS['7.9'])}
              </div>
            </div>

            {/* GRUPO N29: LICENÇAS ORDINÁRIAS */}
            <div className="rounded-xl border border-yellow-100 bg-yellow-50/20 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-yellow-100 pb-2">
                <span className="text-3xs font-black uppercase tracking-wider text-yellow-800">
                  Gatilho Célula N29 → Risco Médio
                </span>
                <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-3xs font-bold text-yellow-900">
                  N29 (Item 7.2)
                </span>
              </div>
              {renderTriStateQuestion('7.2', 'Item 7.2: Licenças Ordinárias / ART / RRT / Funcionamento', SUAPE_QUESTION_TEXTS['7.2'])}
            </div>

            {/* GRUPO GOVERNANÇA: ALIMENTA AS COLUNAS 26, 27 E 28 DO MAPA DE RISCO */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-3xs font-black uppercase tracking-wider text-[#0F2D59]">
                  Bloco 8/9 — Maturidade do Programa de Integridade
                </span>
                <span className="rounded bg-[#0F2D59]/10 px-1.5 py-0.5 text-3xs font-extrabold text-[#0F2D59]">
                  Células L44 e M44 · Colunas 26, 27 e 28
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {SUAPE_MATURITY_ITEMS.map((item) => {
                  const mapColumn =
                    item.key === '8.2' ? ' (Col 26)' : item.key === '8.7' ? ' (Col 27)' : item.key === '9.0' ? ' (Col 28)' : '';
                  return renderTriStateQuestion(
                    item.key as keyof IntegrityAnswers,
                    `Item ${item.key}${mapColumn} · peso ${item.weight}`,
                    MATURITY_TEXT_BY_KEY[item.key]
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SEÇÃO 3B: RISCOS E PONTOS SENSÍVEIS (ITEM 3.5 DA POLÍTICA) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-black text-[#0F2D59]">
                Riscos e pontos sensíveis (item 3.5 da política)
              </h2>
              <p className="mt-0.5 text-2xs text-slate-500">
                Situações que a política manda observar na contratação. Nenhuma sai de fonte
                consultável — quem percebe é quem conduz o processo. O que for marcado vai para a
                coluna OBSERVAÇÕES do Mapa de Risco.
              </p>
            </div>
            {sensitivePoints.length > 0 && (
              <span className="shrink-0 rounded-lg bg-amber-100 px-2.5 py-1 text-2xs font-black text-amber-900">
                {sensitivePoints.length} marcado(s)
              </span>
            )}
          </div>

          <ul className="mt-3 space-y-2">
            {SUAPE_SENSITIVE_POINTS.map((point) => {
              const marked = sensitivePoints.includes(point.key);
              return (
                <li key={point.key}>
                  <label
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors ${
                      marked ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
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
                      className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                    />
                    <span className="min-w-0 text-2xs leading-relaxed text-slate-700">
                      <strong className="text-slate-900">({point.letter})</strong> {point.text}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        {/* SEÇÃO 4: PARÂMETROS EDITÁVEIS DA LINHA DO MAPA DE RISCO */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#D97706] text-white">
                  <Icons.FileSpreadsheet size={14} />
                </span>
                <h2 className="text-base font-black text-[#0F2D59]">
                  Dados para a Planilha do Mapa de Risco
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Preencha os campos abaixo com os dados reais ou deixe em branco para preencher diretamente no Excel.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyRow}
              className={`flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition-all active:scale-95 ${
                copied ? 'bg-emerald-600 shadow-emerald-600/25' : 'bg-[#0F2D59] hover:bg-[#153e7a] shadow-[#0F2D59]/20'
              }`}
            >
              {copied ? <Icons.Check size={16} /> : <Icons.Copy size={16} />}
              <span>{copied ? 'Linha copiada!' : 'Copiar linha (40 colunas)'}</span>
            </button>
          </div>

          {/* PARÂMETROS EDITÁVEIS DA LINHA — GRID 100% SIMÉTRICO (5 COLUNAS X 2 LINHAS) */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* LINHA 1: METADADOS TEMPORAIS E IDENTIFICAÇÃO (5 CAMPOS) */}

            {/* 1. ID / Nº REGISTRO */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  ID / Registro
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 1
                </span>
              </div>
              <input
                type="text"
                value={registroId}
                onChange={(e) => setRegistroId(e.target.value)}
                placeholder="Ex: 556"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              />
            </div>

            {/* 2. ANO DO EXERCÍCIO */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Ano Exercício
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 2
                </span>
              </div>
              <input
                type="text"
                value={anoExercicio}
                onChange={(e) => setAnoExercicio(e.target.value)}
                placeholder="2026"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              />
            </div>

            {/* 3. DATA INÍCIO */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Data Início
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 4
                </span>
              </div>
              <input
                type="text"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                placeholder="DD/MM/AAAA"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              />
            </div>

            {/* 4. DATA FIM */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Data Fim
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 5
                </span>
              </div>
              <input
                type="text"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                placeholder="DD/MM/AAAA"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              />
            </div>

            {/* 5. PRAZO EM DIAS */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Prazo Dias
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 6
                </span>
              </div>
              <input
                type="text"
                value={diasUteis}
                onChange={(e) => setDiasUteis(e.target.value)}
                placeholder="1"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              />
            </div>

            {/* LINHA 2: CONTRATAÇÃO E DOCUMENTOS OFICIAIS (5 CAMPOS) */}

            {/* 6. DIRETORIA DEMANDANTE */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Diretoria
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 7
                </span>
              </div>
              <select
                value={diretoria}
                onChange={(e) => setDiretoria(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              >
                <option value="">Selecione...</option>
                {SUAPE_DIRETORIAS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* 7. GESTOR(A) DO CONTRATO */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Gestor(a)
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 8
                </span>
              </div>
              <input
                type="text"
                value={gestor}
                onChange={(e) => setGestor(e.target.value)}
                placeholder="Gestor(a) do contrato"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              />
            </div>

            {/* 8. VALOR ESTIMADO DO CONTRATO */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Valor Estimado
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 12
                </span>
              </div>
              <div className="relative h-10 w-full">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-bold text-slate-400 pointer-events-none">
                  R$
                </span>
                <input
                  type="text"
                  value={valorContratoStr}
                  onChange={(e) => setValorContratoStr(e.target.value)}
                  placeholder="0,00"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
                />
              </div>
              {valorNumerico > 0 && valorNumerico <= SUAPE_QUESTIONARIO_VALOR_MINIMO && (
                <p className="mt-1 text-3xs leading-snug text-slate-500">
                  Item 3.3.1: em dispensa ou inexigibilidade, o questionário só é mandatório acima de
                  R$ 50.000,00. Em processo licitatório, é exigido na habilitação independente do valor.
                </p>
              )}
              {valorNumerico >= 10000000 && (
                <p className="mt-1 text-3xs font-semibold leading-snug text-amber-800">
                  Valor atinge o patamar de alçada do Conselho. Confirme no checklist se as obrigações
                  foram autorizadas por alçada — o item é marcação, não dedução pelo valor.
                </p>
              )}
            </div>

            {/* 9. PROCESSO SEI */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Processo SEI
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 32
                </span>
              </div>
              <input
                type="text"
                value={processoSei}
                onChange={(e) => setProcessoSei(e.target.value)}
                placeholder="Ex: 0050200077..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              />
            </div>

            {/* 10. NOTA TÉCNICA */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Nota Técnica
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 29
                </span>
              </div>
              <input
                type="text"
                value={notaTecnica}
                onChange={(e) => setNotaTecnica(e.target.value)}
                placeholder="Ex: GOVPE - NT 154"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 shadow-2xs transition-all focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/10 focus:outline-hidden"
              />
            </div>
          </div>

          {/* CAIXA DE VISUALIZAÇÃO DA LINHA EXATA COM CÓPIA */}
          <div className="mt-6">
            <div className="flex items-center justify-between pb-2">
              <span className="text-3xs font-black uppercase tracking-wider text-slate-500">
                Linha Tab-Separated Gerada (Exatamente 40 Colunas Pronta para Ctrl+V)
              </span>
              <button
                type="button"
                onClick={handleCopyRow}
                className="inline-flex items-center gap-1.5 text-xs font-black text-[#0F2D59] hover:underline"
              >
                <Icons.Copy size={13} />
                <span>{copied ? 'Copiado!' : 'Copiar Linha Completa'}</span>
              </button>
            </div>

            <div className="relative rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-2xs text-emerald-400 shadow-inner overflow-x-auto">
              <p className="whitespace-pre leading-relaxed select-all">
                {riskMapRow.rawLine}
              </p>
            </div>
          </div>

          {/* AUDITORIA DAS 40 COLUNAS EM GRID MODERNO (SEM ROLAGEM HORIZONTAL) */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[#0F2D59]">
                  Auditoria das 40 Colunas Oficiais da Planilha
                </h3>
                <p className="text-3xs text-slate-500">
                  Visualização estruturada por blocos para conferência sem necessidade de rolagem horizontal.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-3xs font-black text-slate-600">
                40 de 40 Colunas
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* BLOCO 1: IDENTIFICAÇÃO E PRAZOS */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <span className="text-3xs font-black uppercase text-slate-400">1. Metadados do Registro</span>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 1 — ID:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[0]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 2 — Ano:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[1]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 3 — Área:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[2]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 4 — Início:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[3]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 5 — Fim:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[4]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 6 — Dias:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[5]?.value || '—'}</dd>
                  </div>
                </dl>
              </div>

              {/* BLOCO 2: DEMANDA E TERCEIRO */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <span className="text-3xs font-black uppercase text-slate-400">2. Demanda e Terceiro</span>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 7 — Diretoria:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[6]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 8 — Analista:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[7]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 9 — Razão Social:</dt>
                    <dd className="font-bold text-slate-800 truncate max-w-[160px] text-right" title={riskMapRow.columns[8]?.value}>
                      {riskMapRow.columns[8]?.value || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 11 — CNPJ:</dt>
                    <dd className="font-mono font-bold text-slate-800">{riskMapRow.columns[10]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 12 — Valor:</dt>
                    <dd className="font-bold text-emerald-700">{riskMapRow.columns[11]?.value || '—'}</dd>
                  </div>
                </dl>
              </div>

              {/* BLOCO 3: CLASSIFICAÇÃO DE RISCO */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <span className="text-3xs font-black uppercase text-slate-400">3. Risco Oficial e Fatores</span>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <dt className="text-slate-500">Col 13 — Risco:</dt>
                    <dd>
                      <span className={`inline-block rounded px-2 py-0.5 text-3xs font-black ${badgeStyle.bg}`}>
                        {riskMapRow.columns[12]?.value}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-3xs text-slate-400 font-bold">Col 14 — Fator de Risco 1:</dt>
                    <dd className="mt-0.5 text-2xs font-semibold text-slate-700 line-clamp-2" title={riskMapRow.columns[13]?.value}>
                      {riskMapRow.columns[13]?.value || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-3xs text-slate-400 font-bold">Col 17 — Fator de Risco 2:</dt>
                    <dd className="mt-0.5 text-2xs font-semibold text-slate-700 line-clamp-2" title={riskMapRow.columns[16]?.value}>
                      {riskMapRow.columns[16]?.value || '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* BLOCO 4: CONFORMIDADE & DOCUMENTAÇÃO */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5">
                <span className="text-3xs font-black uppercase text-slate-400">4. Conformidade e Certidões</span>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 26 — Regularidade:</dt>
                    <dd className="font-bold text-emerald-700">{riskMapRow.columns[25]?.value}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 27 — Sanções CEIS/CNEP:</dt>
                    <dd className="font-bold text-emerald-700">{riskMapRow.columns[26]?.value}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 28 — Integridade:</dt>
                    <dd className="font-bold text-emerald-700">{riskMapRow.columns[27]?.value}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 31 — Validação Concluída:</dt>
                    <dd className="font-bold text-emerald-700">{riskMapRow.columns[30]?.value}</dd>
                  </div>
                </dl>
              </div>

              {/* BLOCO 5: PROCESSO SEI & PARECER */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 lg:col-span-2">
                <span className="text-3xs font-black uppercase text-slate-400">5. Rastreabilidade Oficial</span>
                <dl className="mt-2 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 29 — Nota Técnica:</dt>
                    <dd className="font-bold text-slate-800">{riskMapRow.columns[28]?.value || '—'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Col 32 — Processo SEI:</dt>
                    <dd className="font-mono font-bold text-slate-800">{riskMapRow.columns[31]?.value || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-3xs text-slate-400 font-bold">Col 30 — Ação de Mitigação Obrigatória:</dt>
                    <dd className="mt-0.5 text-2xs font-extrabold text-slate-900 leading-snug">
                      {riskMapRow.columns[29]?.value}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
