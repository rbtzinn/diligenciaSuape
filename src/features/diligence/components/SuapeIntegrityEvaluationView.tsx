import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { DiligenceItem, ProcessDiscovery } from '../types';
import { Icons } from '../../../components/ui/Icons';
import { getFirebaseIdToken } from '../../../lib/firebase';
import {
  evaluateSuapeIntegrity,
  generateRiskMapRow,
  SUAPE_QUESTION_TEXTS,
  type SuapeCalculatedRisk,
  type QuestionnaireAnswer,
  type IntegrityAnswers,
} from '../utils/suapeRiskMapRowGenerator';

interface SuapeIntegrityEvaluationViewProps {
  diligence: DiligenceItem;
  discoveries?: ProcessDiscovery[];
  onOpenEvidence?: () => void;
  onOpenNetwork?: () => void;
}

const DIRETORIAS = ['DGP', 'DIRIN', 'DGO', 'DENG', 'PRESI', 'DAF', 'DPO'];

export const SuapeIntegrityEvaluationView: React.FC<SuapeIntegrityEvaluationViewProps> = ({
  diligence,
  discoveries = [],
  onOpenEvidence,
  onOpenNetwork,
}) => {
  // Parâmetros editáveis da linha do Mapa de Risco (sem valores hardcoded fictícios)
  const [analista, setAnalista] = useState(() => localStorage.getItem('suape_analista_nome') || '');
  const [diretoria, setDiretoria] = useState(() => localStorage.getItem('suape_diretoria') || '');
  const [registroId, setRegistroId] = useState('');
  const [anoExercicio, setAnoExercicio] = useState(() => String(new Date().getFullYear()));
  const [valorContratoStr, setValorContratoStr] = useState('');
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
  const [diasUteis, setDiasUteis] = useState('1');

  // Estado do Arquivo de Questionário Anexado (.pdf ou .xlsx)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    size: number;
    parsedAt: string;
    sheetName: string;
    detectedAnswersCount: number;
    isPdf?: boolean;
    aviso?: string | null;
  } | null>(null);

  // Respostas detalhadas dos itens da Avaliação de Integridade oficial (tri-state: true | false | null)
  const [questionAnswers, setQuestionAnswers] = useState<IntegrityAnswers>({
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
    '8.2': null,
    '8.7': null,
    '9.0': null,
    alcadaConselho: null,
  });

  // Salva analista e diretoria no localStorage
  useEffect(() => {
    if (analista) localStorage.setItem('suape_analista_nome', analista);
  }, [analista]);

  useEffect(() => {
    if (diretoria) localStorage.setItem('suape_diretoria', diretoria);
  }, [diretoria]);

  // Função para processar o upload do questionário (.pdf ou .xlsx)
  const handleFileUpload = async (file: File) => {
    const safeName = file.name.toLowerCase();
    const isPdf = safeName.endsWith('.pdf');
    const isExcel = safeName.endsWith('.xlsx') || safeName.endsWith('.xls');

    if (!isPdf && !isExcel) {
      setUploadError('Por favor, selecione um arquivo válido em PDF (.pdf) ou Excel (.xlsx, .xls).');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64);
        };
        reader.onerror = (e) => reject(e);
      });
      reader.readAsDataURL(file);
      const fileBase64 = await base64Promise;

      const token = await getFirebaseIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch('/api/diligences/parse-questionnaire', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename: file.name, fileBase64 }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.erro || 'Falha ao analisar o questionário.');
      }

      if (data.dadosGerais?.valorContrato && typeof data.dadosGerais.valorContrato === 'number') {
        setValorContratoStr(
          data.dadosGerais.valorContrato.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        );
      }
      if (data.dadosGerais?.processoSei) {
        setProcessoSei(data.dadosGerais.processoSei);
      }
      if (data.dadosGerais?.diretoria) {
        setDiretoria(data.dadosGerais.diretoria);
      }

      const detalhes = data.flagsIntegridade?.detalhes || {};
      const newAnswers: IntegrityAnswers = {
        '4.4': detalhes.q4_4_corrupcaoPJ ?? null,
        '5.2': detalhes.q5_2_crimesSocios ?? null,
        '7.1': detalhes.q7_1_atividadeRegulada ?? null,
        '7.2': detalhes.q7_2_licencasOrdinarias ?? null,
        '7.3': detalhes.q7_3_licencasContratuais ?? null,
        '7.4': detalhes.q7_4_interacaoPoderPublico ?? null,
        '7.5': detalhes.q7_5_representacaoTerceiros ?? null,
        '7.6': detalhes.q7_6_pepSocio ?? null,
        '7.7': detalhes.q7_7_pepFamiliar ?? null,
        '7.8': detalhes.q7_8_parentescoSuape ?? null,
        '7.9': detalhes.q7_9_participacaoGoverno ?? null,
        '8.2': detalhes.q8_2_codigoConduta ?? null,
        '8.7': detalhes.q8_7_treinamentoGestao ?? null,
        '9.0': detalhes.q9_0_complianceOfficer ?? null,
        alcadaConselho: detalhes.alcadaConselho ?? null,
      };

      setQuestionAnswers(newAnswers);

      const answeredCount = Object.values(newAnswers).filter((v) => v !== null).length;
      setAttachedFile({
        name: file.name,
        size: file.size,
        parsedAt: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        sheetName: data.sheetIdentificada || (isPdf ? 'Documento PDF' : 'Questionário'),
        detectedAnswersCount: answeredCount,
        isPdf,
        aviso: data.aviso || null,
      });
    } catch (err: any) {
      console.error('Erro ao processar questionário:', err);
      setUploadError(err.message || 'Erro ao processar o arquivo anexado.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setAttachedFile(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setQuestionAnswers({
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
      '8.2': null,
      '8.7': null,
      '9.0': null,
      alcadaConselho: null,
    });
  };

  const handleSetAnswer = (key: keyof IntegrityAnswers, value: QuestionnaireAnswer) => {
    setQuestionAnswers((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const valorNumerico = useMemo(() => {
    if (!valorContratoStr.trim()) return 0;
    const clean = valorContratoStr.replace(/[^\d,-]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  }, [valorContratoStr]);

  const evaluation = useMemo(() => {
    return evaluateSuapeIntegrity(diligence, valorNumerico, questionAnswers);
  }, [diligence, valorNumerico, questionAnswers]);

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
      area: 'Compliance',
      dataInicio,
      dataFim,
      dias: diasUteis,
      diretoriaDemandante: diretoria,
      analistaResponsavel: analista,
      razaoSocial: diligence.razaoSocial,
      nomeFantasia: diligence.nomeFantasia,
      cnpj: diligence.cnpjFmt,
      valorContrato: formattedValor,
      notaTecnica,
      processoSei,
      answers: questionAnswers,
      customEvaluation: evaluation,
      customFatorRisco1: evaluation.fatorRisco1,
      customFatorRisco2: evaluation.fatorRisco2,
      customFatorRisco4: evaluation.fatorRisco4,
      customPlanoAcao: evaluation.recommendedAction,
    });
  }, [
    diligence,
    registroId,
    anoExercicio,
    dataInicio,
    dataFim,
    diasUteis,
    diretoria,
    analista,
    valorNumerico,
    valorContratoStr,
    notaTecnica,
    processoSei,
    questionAnswers,
    evaluation,
  ]);

  const [copied, setCopied] = useState(false);

  const handleCopyRow = async () => {
    try {
      await navigator.clipboard.writeText(riskMapRow.rawLine);
      setCopied(true);
      setTimeout(() => setCopied(false), 3500);
    } catch (err) {
      console.error('Falha ao copiar:', err);
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

  const badgeStyle = riskBadgeColors[evaluation.calculatedRisk];

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
                className={`flex h-10 items-center gap-2.5 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition-all active:scale-95 ${
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
                  Abra a planilha do Mapa de Risco no Excel (<code className="font-semibold">2026_0015.xlsx</code>), selecione a célula da primeira coluna da linha desejada e pressione <strong>Ctrl+V</strong>.
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
        {/* SEÇÃO 1: ANEXAR QUESTIONÁRIO DE DILIGÊNCIA (.PDF OU .XLSX) */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F2D59] text-white">
                <Icons.FileText size={18} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-[#0F2D59]">
                    Questionário de Diligência Preenchido (.pdf ou .xlsx)
                  </h2>
                  <span className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-3xs font-extrabold text-indigo-700">
                    Extração Assistida · Validação Humana
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Anexe o questionário devolvido pelo terceiro (PDF assinado ou Excel) para extrair as respostas oficiais (4.4, 5.2, 7.1 a 7.9) com conferência humana obrigatória.
                </p>
              </div>
            </div>

            {attachedFile && (
              <button
                type="button"
                onClick={handleRemoveFile}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors"
              >
                <Icons.Trash size={13} />
                <span>Remover Anexo</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFileUpload(e.target.files[0]);
              }
            }}
          />

          {uploadError && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">
              <Icons.AlertTriangle size={16} className="text-rose-600 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          {attachedFile ? (
            <div className="mt-4 space-y-2">
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-300 bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-xs">
                    {attachedFile.isPdf ? <Icons.FileText size={20} /> : <Icons.FileSpreadsheet size={20} />}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-900">{attachedFile.name}</span>
                      <span className="rounded bg-emerald-200/80 px-1.5 py-0.5 text-3xs font-bold text-emerald-900">
                        {attachedFile.isPdf ? 'Formato: PDF' : `Aba: ${attachedFile.sheetName}`}
                      </span>
                    </div>
                    <p className="text-2xs text-emerald-800 mt-0.5">
                      Processado às {attachedFile.parsedAt} • {(attachedFile.size / 1024).toFixed(1)} KB • {attachedFile.detectedAnswersCount} respostas e gatilhos detectados.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition-colors self-start sm:self-auto"
                >
                  <Icons.Upload size={13} />
                  <span>Substituir Arquivo</span>
                </button>
              </div>

              {attachedFile.aviso && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
                  <Icons.AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>{attachedFile.aviso}</span>
                </div>
              )}
            </div>
          ) : (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-[#0F2D59] bg-[#0F2D59]/5'
                  : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/60'
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-xs text-slate-500 mb-2">
                {isUploading ? (
                  <Icons.RefreshCw size={20} className="animate-spin text-[#0F2D59]" />
                ) : (
                  <Icons.Upload size={20} className="text-[#0F2D59]" />
                )}
              </span>
              <p className="text-xs font-black text-slate-800">
                {isUploading ? 'Processando questionário...' : 'Clique para selecionar ou arraste o questionário (.pdf ou .xlsx) preenchido'}
              </p>
              <p className="mt-1 text-2xs text-slate-500 max-w-lg">
                Aceita tanto o PDF assinado/preenchido pelo terceiro quanto o modelo original em Excel (.xlsx). As respostas e valores detectados alimentarão diretamente o cálculo de risco oficial da SUAPE.
              </p>
            </div>
          )}
        </section>

        {/* SEÇÃO 2: RESULTADO OFICIAL — CÉLULA J16 & AS 4 CÉLULAS DA FÓRMULA */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-3xs font-black uppercase tracking-widest text-slate-400">
                  Resultado Oficial da Planilha SUAPE — Célula J16
                </span>
                <div className="mt-1 flex items-center gap-3">
                  <span className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-lg font-black shadow-xs ${badgeStyle.bg}`}>
                    <Icons.ShieldAlert size={20} className={badgeStyle.iconColor} />
                    {evaluation.riskDisplay}
                  </span>
                  <span className="hidden text-xs text-slate-500 sm:inline">
                    Terceiro: <strong className="text-slate-800">{diligence.razaoSocial}</strong> ({diligence.cnpjFmt})
                  </span>
                </div>
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
                Itens 4.4 (Corrupção PJ / CEIS / CNEP / MTE) ou 5.2 (Crimes Sócios).
              </p>
              <div className="mt-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 text-3xs">
                {evaluation.triggers.n23Reasons.length > 0 ? (
                  <ul className="space-y-1 text-rose-800 font-medium">
                    {evaluation.triggers.n23Reasons.map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-emerald-700 font-semibold">
                    ✓ Nada Consta em CEIS, CNEP, TCE-PE, MTE ou Itens 4.4/5.2.
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
                Row 40: Contratação autorizada pelo Conselho (valor a partir de R$ 10.000.000,00).
              </p>
              <div className="mt-2.5 rounded-lg border border-slate-200 bg-white/80 p-2 text-3xs">
                {evaluation.n40 ? (
                  <span className="text-rose-800 font-bold">
                    ⚠️ Valor avaliado ({valorContratoStr || 'acima de R$ 10M'}) atinge a alçada do Conselho.
                  </span>
                ) : (
                  <span className="text-slate-600 font-medium">
                    Valor contratual inferior a R$ 10.000.000,00.
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

          {/* PLANO DE AÇÃO RECOMENDADO (CÉLULA B48) */}
          <div className="border-t border-slate-200 bg-slate-50/60 p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#0F2D59] text-white">
                <Icons.CheckCircle size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-3xs font-black uppercase tracking-wider text-slate-500">
                    Plano de Ação Mitigatório Recomendado (Célula B48 da Planilha Oficial)
                  </span>
                  <span className="rounded bg-white px-2 py-0.5 text-3xs font-bold text-slate-600 border border-slate-200">
                    Mitigação Obrigatória
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-extrabold leading-relaxed text-slate-900">
                  {evaluation.recommendedAction}
                </p>
              </div>
            </div>
          </div>
        </div>

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
                  Gatilho Célula N40 → Risco Muito Alto (Fórmula Oficial J16)
                </span>
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-3xs font-bold text-rose-900">
                  N40 (Alçada Conselho)
                </span>
              </div>
              {renderTriStateQuestion('alcadaConselho', 'Row 40: Alçada do Conselho de Administração', SUAPE_QUESTION_TEXTS['conselho'])}
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
                  Governança e Integridade → Colunas 26, 27 e 28 do Mapa de Risco
                </span>
                <span className="rounded bg-[#0F2D59]/10 px-1.5 py-0.5 text-3xs font-extrabold text-[#0F2D59]">
                  Colunas 26, 27, 28
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {renderTriStateQuestion('8.2', 'Item 8.2 (Col 26): Código de Conduta / Ética', SUAPE_QUESTION_TEXTS['8.2'])}
                {renderTriStateQuestion('8.7', 'Item 8.7 (Col 27): Treinamento Alta Administração', SUAPE_QUESTION_TEXTS['8.7'])}
                {renderTriStateQuestion('9.0', 'Item 9.0 (Col 28): Profissional / Órgão Anticorrupção', SUAPE_QUESTION_TEXTS['9.0'])}
              </div>
            </div>
          </div>
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
                {DIRETORIAS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* 7. ANALISTA RESPONSÁVEL */}
            <div className="flex flex-col">
              <div className="flex h-6 items-center justify-between mb-1.5">
                <label className="text-2xs font-semibold uppercase tracking-wider text-slate-500 truncate">
                  Analista
                </label>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-3xs font-extrabold text-slate-400">
                  Col 8
                </span>
              </div>
              <input
                type="text"
                value={analista}
                onChange={(e) => setAnalista(e.target.value)}
                placeholder="Ex: Seu Nome"
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
