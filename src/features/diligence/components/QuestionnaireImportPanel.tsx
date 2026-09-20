// ==========================================================
// DILIGÊNCIA 360 — Ingestão do Questionário de Diligência
//
// Dois caminhos, nessa ordem de confiabilidade:
//
// 1. TRANSCRIÇÃO POR IA (recomendado). O analista copia o prompt, leva
//    junto com o arquivo a qualquer assistente com leitura de imagem e
//    cola o JSON de volta aqui. Funciona com PDF impresso, foto do papel
//    assinado e documento escaneado.
//
// 2. LEITURA AUTOMÁTICA LOCAL. Serve para o .xlsx original, onde cada
//    resposta tem endereço de célula. No PDF a ordem de leitura embaralha
//    enunciado e marcação, então o resultado sai marcado como sujeito a
//    conferência item a item.
//
// Nos dois caminhos nada entra sem a confirmação do analista: a tela
// mostra o que será importado antes de aplicar.
// ==========================================================

import React, { useMemo, useRef, useState } from 'react';
import { Icons } from '../../../components/ui/Icons';
import { getFirebaseIdToken } from '../../../lib/firebase';
import {
  buildQuestionnaireExtractionPrompt,
  checkImportedCnpj,
  parseQuestionnaireImport,
  type QuestionnaireImportResult,
} from '../utils/suapeQuestionnaireImport';
import type { IntegrityAnswers } from '../utils/suapeRiskMapRowGenerator';

export interface QuestionnaireImportPayload {
  answers: IntegrityAnswers;
  valorContrato: number | null;
  processoSei: string | null;
  diretoria: string | null;
  gestor: string | null;
  origem: string;
}

interface QuestionnaireImportPanelProps {
  razaoSocial?: string;
  cnpj?: string;
  /** Quantos itens já estão respondidos, para o rodapé do painel. */
  answeredCount: number;
  totalItems: number;
  onApply: (payload: QuestionnaireImportPayload) => void;
  onClear: () => void;
}

type Mode = 'ia' | 'arquivo';

export const QuestionnaireImportPanel: React.FC<QuestionnaireImportPanelProps> = ({
  razaoSocial,
  cnpj,
  answeredCount,
  totalItems,
  onApply,
  onClear,
}) => {
  const [mode, setMode] = useState<Mode>('ia');
  const [promptCopied, setPromptCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [preview, setPreview] = useState<QuestionnaireImportResult | null>(null);
  const [cnpjWarning, setCnpjWarning] = useState<string | null>(null);
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const prompt = useMemo(
    () => buildQuestionnaireExtractionPrompt({ razaoSocial, cnpj }),
    [razaoSocial, cnpj]
  );

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 3000);
    } catch {
      setUploadError('Não foi possível copiar o prompt. Selecione o texto abaixo e copie manualmente.');
    }
  };

  const handleAnalyzePaste = () => {
    const result = parseQuestionnaireImport(pasted);
    setPreview(result);
    setCnpjWarning(result.ok ? checkImportedCnpj(result.cnpj, cnpj) : null);
  };

  const handleApplyPreview = () => {
    if (!preview?.ok) return;
    onApply({
      answers: preview.answers,
      valorContrato: preview.generalData.valorContrato,
      processoSei: preview.generalData.processoSei,
      diretoria: preview.generalData.diretoria,
      gestor: preview.generalData.gestor,
      origem: 'Transcrição por IA conferida pelo analista',
    });
    setAppliedFrom('Transcrição por IA');
    setPreview(null);
    setPasted('');
  };

  const handleDiscard = () => {
    setPreview(null);
    setCnpjWarning(null);
  };

  const handleClearAll = () => {
    onClear();
    setAppliedFrom(null);
    setPreview(null);
    setPasted('');
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ------------------------------------------------------
  // Caminho 2: leitura automática local do arquivo
  // ------------------------------------------------------
  const handleFileUpload = async (file: File) => {
    const name = file.name.toLowerCase();
    const isPdf = name.endsWith('.pdf');
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

    if (!isPdf && !isExcel) {
      setUploadError('Selecione um arquivo .pdf, .xlsx ou .xls. Para foto do questionário, use a transcrição por IA.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const token = await getFirebaseIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch('/api/diligences/parse-questionnaire', {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename: file.name, fileBase64 }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.erro || 'Falha ao ler o questionário.');
      }

      const detalhes = data.flagsIntegridade?.detalhes || {};
      const answers: IntegrityAnswers = {
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

      onApply({
        answers,
        valorContrato:
          typeof data.dadosGerais?.valorContrato === 'number' ? data.dadosGerais.valorContrato : null,
        processoSei: data.dadosGerais?.processoSei ?? null,
        diretoria: data.dadosGerais?.diretoria ?? null,
        gestor: data.dadosGerais?.gestor ?? null,
        origem: `Leitura automática de ${file.name}`,
      });
      setAppliedFrom(file.name);

      if (isPdf) {
        setUploadError(
          'PDF lido por extração de texto. Nesse formato a ordem de leitura embaralha enunciado e marcação: confira item a item no checklist abaixo, ou refaça pela transcrição por IA.'
        );
      }
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'Erro ao processar o arquivo anexado.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const summaryChip = (label: string, value: number, tone: string) => (
    <span className={`rounded-lg px-2 py-1 text-2xs font-bold ${tone}`}>
      {label}: {value}
    </span>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0F2D59] text-white">
            <Icons.FileText size={18} />
          </span>
          <div>
            <h2 className="text-sm font-black text-[#0F2D59]">Questionário de Diligência preenchido</h2>
            <p className="text-xs text-slate-500">
              Sem o questionário respondido não há classificação de risco: a planilha oficial de SUAPE
              classifica pelas respostas do terceiro.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-lg px-2.5 py-1 text-2xs font-black ${
              answeredCount === 0
                ? 'bg-amber-100 text-amber-900'
                : answeredCount < totalItems
                  ? 'bg-sky-100 text-sky-900'
                  : 'bg-emerald-100 text-emerald-900'
            }`}
          >
            {answeredCount} de {totalItems} itens respondidos
          </span>
          {answeredCount > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100"
            >
              <Icons.Trash size={13} />
              <span>Limpar respostas</span>
            </button>
          )}
        </div>
      </div>

      {appliedFrom && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
          <Icons.Check size={16} className="shrink-0 text-emerald-600" />
          <span>Respostas importadas de: {appliedFrom}. Confira o checklist abaixo antes de gerar a linha.</span>
        </div>
      )}

      {/* Alternância entre os dois caminhos */}
      <div className="mt-4 flex gap-1.5 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => setMode('ia')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
            mode === 'ia' ? 'bg-white text-[#0F2D59] shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Icons.Sparkles size={14} />
          <span>Transcrever com IA</span>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-3xs font-black text-emerald-800">
            PDF, foto ou digitalização
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode('arquivo')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
            mode === 'arquivo' ? 'bg-white text-[#0F2D59] shadow-2xs' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Icons.Upload size={14} />
          <span>Leitura automática</span>
          <span className="rounded bg-slate-200 px-1.5 py-0.5 text-3xs font-black text-slate-700">
            só .xlsx
          </span>
        </button>
      </div>

      {uploadError && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
          <Icons.AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <span>{uploadError}</span>
        </div>
      )}

      {mode === 'ia' ? (
        <div className="mt-4 space-y-4">
          <ol className="grid gap-2 sm:grid-cols-3">
            {[
              ['1', 'Copie o prompt', 'Ele já vem com os enunciados oficiais e o formato de resposta.'],
              ['2', 'Leve com o arquivo', 'Cole o prompt em qualquer assistente e anexe o PDF ou a foto.'],
              ['3', 'Cole o retorno', 'O sistema confere o formato e mostra o que será importado.'],
            ].map(([step, title, detail]) => (
              <li key={step} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F2D59] text-3xs font-black text-white">
                    {step}
                  </span>
                  <span className="text-xs font-black text-slate-800">{title}</span>
                </div>
                <p className="mt-1 text-2xs text-slate-600">{detail}</p>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyPrompt}
              className={`flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition-all active:scale-95 ${
                promptCopied ? 'bg-emerald-600' : 'bg-[#0F2D59] hover:bg-[#153e7a]'
              }`}
            >
              {promptCopied ? <Icons.Check size={15} /> : <Icons.Copy size={15} />}
              <span>{promptCopied ? 'Prompt copiado!' : 'Copiar prompt de transcrição'}</span>
            </button>
            <span className="text-2xs text-slate-500">
              Nenhum dado sai daqui: o prompt não leva evidência da diligência, só os enunciados do
              questionário.
            </span>
          </div>

          <details className="rounded-xl border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-bold text-slate-700">
              Ver o prompt completo
            </summary>
            <pre className="max-h-64 overflow-auto border-t border-slate-200 px-4 py-3 text-3xs leading-relaxed text-slate-600">
              {prompt}
            </pre>
          </details>

          <div>
            <label htmlFor="transcricao-ia" className="text-xs font-bold text-slate-700">
              Cole aqui o JSON devolvido pela IA
            </label>
            <textarea
              id="transcricao-ia"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={'{\n  "versao": "suape-questionario-1",\n  "respostas": { ... }\n}'}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-2xs text-slate-800 outline-none transition-colors focus:border-[#0F2D59] focus:ring-2 focus:ring-[#0F2D59]/15"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAnalyzePaste}
                disabled={!pasted.trim()}
                className="flex h-9 items-center gap-2 rounded-lg bg-slate-800 px-4 text-xs font-bold text-white transition-all hover:bg-slate-900 active:scale-95 disabled:opacity-40"
              >
                <Icons.Search size={14} />
                <span>Conferir transcrição</span>
              </button>
              {pasted.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setPasted('');
                    handleDiscard();
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {preview && (
            <div
              className={`rounded-xl border p-4 ${
                preview.ok ? 'border-emerald-300 bg-emerald-50/60' : 'border-rose-300 bg-rose-50'
              }`}
            >
              <div className="flex items-center gap-2">
                {preview.ok ? (
                  <Icons.Check size={16} className="text-emerald-600" />
                ) : (
                  <Icons.AlertTriangle size={16} className="text-rose-600" />
                )}
                <span className="text-xs font-black text-slate-900">
                  {preview.ok ? 'Transcrição válida — confira antes de aplicar' : 'Transcrição recusada'}
                </span>
              </div>

              {preview.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {preview.errors.map((error) => (
                    <li key={error} className="text-2xs font-semibold text-rose-800">
                      • {error}
                    </li>
                  ))}
                </ul>
              )}

              {preview.ok && (
                <>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {summaryChip('Sim', preview.summary.sim, 'bg-rose-100 text-rose-900')}
                    {summaryChip('Não', preview.summary.nao, 'bg-slate-200 text-slate-800')}
                    {summaryChip(
                      'Não identificado',
                      preview.summary.naoIdentificado,
                      'bg-amber-100 text-amber-900'
                    )}
                  </div>

                  {(preview.generalData.valorContrato !== null ||
                    preview.generalData.processoSei ||
                    preview.generalData.diretoria ||
                    preview.generalData.gestor) && (
                    <dl className="mt-3 grid gap-2 text-2xs sm:grid-cols-2">
                      {preview.generalData.valorContrato !== null && (
                        <div>
                          <dt className="font-bold text-slate-500">Valor do contrato</dt>
                          <dd className="font-semibold text-slate-800">
                            R${' '}
                            {preview.generalData.valorContrato.toLocaleString('pt-BR', {
                              minimumFractionDigits: 2,
                            })}
                          </dd>
                        </div>
                      )}
                      {preview.generalData.processoSei && (
                        <div>
                          <dt className="font-bold text-slate-500">Processo SEI</dt>
                          <dd className="font-semibold text-slate-800">{preview.generalData.processoSei}</dd>
                        </div>
                      )}
                      {preview.generalData.diretoria && (
                        <div>
                          <dt className="font-bold text-slate-500">Diretoria</dt>
                          <dd className="font-semibold text-slate-800">{preview.generalData.diretoria}</dd>
                        </div>
                      )}
                      {preview.generalData.gestor && (
                        <div>
                          <dt className="font-bold text-slate-500">Gestor(a)</dt>
                          <dd className="font-semibold text-slate-800">{preview.generalData.gestor}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </>
              )}

              {cnpjWarning && (
                <p className="mt-3 rounded-lg border border-rose-300 bg-white p-2.5 text-2xs font-bold text-rose-800">
                  {cnpjWarning}
                </p>
              )}

              {preview.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-slate-200 pt-2.5">
                  {preview.warnings.map((warning) => (
                    <li key={warning} className="text-2xs text-amber-900">
                      ⚠ {warning}
                    </li>
                  ))}
                </ul>
              )}

              {preview.ok && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleApplyPreview}
                    className="flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-bold text-white transition-all hover:bg-emerald-700 active:scale-95"
                  >
                    <Icons.Check size={14} />
                    <span>Aplicar ao checklist</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.pdf,application/pdf"
            className="hidden"
            onChange={(event) => {
              if (event.target.files?.[0]) handleFileUpload(event.target.files[0]);
            }}
          />
          <div
            role="button"
            tabIndex={0}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (event.dataTransfer.files?.[0]) handleFileUpload(event.dataTransfer.files[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
            }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-[#0F2D59] bg-[#0F2D59]/5'
                : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/60'
            }`}
          >
            <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-500 shadow-xs">
              {isUploading ? (
                <Icons.RefreshCw size={20} className="animate-spin text-[#0F2D59]" />
              ) : (
                <Icons.Upload size={20} className="text-[#0F2D59]" />
              )}
            </span>
            <p className="text-xs font-black text-slate-800">
              {isUploading ? 'Lendo o questionário…' : 'Selecione ou arraste o questionário preenchido'}
            </p>
            <p className="mt-1 max-w-lg text-2xs text-slate-500">
              A leitura local é confiável no <strong>.xlsx</strong> original, onde cada resposta tem
              endereço de célula. No PDF ela extrai o texto, mas a ordem de leitura separa o enunciado
              da marcação — por isso o resultado vem para conferência item a item. Para foto ou
              digitalização, use a transcrição por IA.
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
