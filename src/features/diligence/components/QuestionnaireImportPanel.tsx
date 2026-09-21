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
import { Section } from '../../../components/ui/Section';
import { Button } from '../../../components/ui/Button';
import { Chip } from '../../../components/ui/Chip';
import { Note } from '../../../components/ui/Note';
import { TextArea } from '../../../components/ui/Field';
import { Icons } from '../../../components/ui/Icons';
import { cn } from '../../../lib/cn';
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
  answeredCount: number;
  totalItems: number;
  onApply: (payload: QuestionnaireImportPayload) => void;
  onClear: () => void;
}

type Mode = 'ia' | 'arquivo';

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: 'arquivo', label: 'Anexar planilha', hint: '.xlsx ou .xls' },
  { id: 'ia', label: 'PDF ou foto', hint: 'transcrição assistida' },
];

export const QuestionnaireImportPanel: React.FC<QuestionnaireImportPanelProps> = ({
  razaoSocial,
  cnpj,
  answeredCount,
  totalItems,
  onApply,
  onClear,
}) => {
  const [mode, setMode] = useState<Mode>('arquivo');
  const [promptCopied, setPromptCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [preview, setPreview] = useState<QuestionnaireImportResult | null>(null);
  const [cnpjWarning, setCnpjWarning] = useState<string | null>(null);
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null);
  const [pendingFileImport, setPendingFileImport] = useState<QuestionnaireImportPayload | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'warn' | 'high'; text: string } | null>(null);
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
      setNotice({ tone: 'warn', text: 'Não foi possível copiar. Abra o prompt abaixo e copie o texto.' });
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
      origem: 'Transcrição por IA',
    });
    setAppliedFrom('Transcrição por IA');
    setPreview(null);
    setPasted('');
    setNotice(null);
  };

  const handleClearAll = () => {
    onClear();
    setAppliedFrom(null);
    setPendingFileImport(null);
    setPreview(null);
    setCnpjWarning(null);
    setPasted('');
    setNotice(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileUpload = async (file: File) => {
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');

    // A leitura local vale para a planilha, onde cada resposta tem
    // endereço de célula. PDF, foto e digitalização passam pela
    // transcrição por IA.
    if (!isExcel) {
      setNotice({
        tone: 'high',
        text: 'A leitura automática aceita .xlsx e .xls. Para PDF, foto ou digitalização, use a transcrição por IA.',
      });
      return;
    }

    setIsUploading(true);
    setPendingFileImport(null);
    setCnpjWarning(null);
    setNotice(null);

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
      if (!response.ok || !data.ok) throw new Error(data.erro || 'Falha ao ler o questionário.');

      const detalhes = data.flagsIntegridade?.detalhes || {};
      setPendingFileImport({
        answers: {
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
        },
        valorContrato:
          typeof data.dadosGerais?.valorContrato === 'number' ? data.dadosGerais.valorContrato : null,
        processoSei: data.dadosGerais?.processoSei ?? null,
        diretoria: data.dadosGerais?.diretoria ?? null,
        gestor: data.dadosGerais?.gestor ?? null,
        origem: `Leitura de ${file.name}`,
      });
      setCnpjWarning(checkImportedCnpj(data.dadosGerais?.cnpj ?? null, cnpj));
    } catch (error) {
      setNotice({
        tone: 'high',
        text: error instanceof Error ? error.message : 'Erro ao processar o arquivo.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Section
      title="Anexar questionário de diligência"
      subtitle="As respostas alimentam a avaliação SUAPE após sua conferência."
      trailing={
        <div className="flex items-center gap-2">
          <Chip
            tone={answeredCount === 0 ? 'warn' : answeredCount < totalItems ? 'info' : 'ok'}
            size="sm"
            title={`${answeredCount} de ${totalItems} itens respondidos`}
          >
            {answeredCount}/{totalItems}
          </Chip>
          {answeredCount > 0 ? (
            <Button size="sm" variant="ghost" icon={<Icons.Trash size={14} />} onClick={handleClearAll}>
              Limpar
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {appliedFrom ? (
          <Note tone="ok" role="status" icon={<Icons.Check size={16} />}>
            Importado de {appliedFrom}. Confira o checklist antes de gerar a linha.
          </Note>
        ) : null}

        {/* Alternância entre os dois caminhos de ingestão. */}
        <div
          role="tablist"
          aria-label="Forma de importar o questionário"
          className="flex gap-1 rounded-[var(--control-radius-md)] bg-surface-subtle p-1"
        >
          {MODES.map((item) => (
            <button
              key={item.id}
              role="tab"
              type="button"
              aria-selected={mode === item.id}
              onClick={() => setMode(item.id)}
              className={cn(
                'flex min-h-[var(--control-height-sm)] flex-1 items-center justify-center gap-1.5 rounded-[var(--control-radius-sm)] px-3 text-xs font-semibold transition-colors',
                mode === item.id
                  ? 'bg-surface text-ink shadow-xs'
                  : 'text-ink-3 hover:text-ink',
              )}
            >
              <span className="truncate">{item.label}</span>
              <span className="hidden truncate text-2xs text-ink-3 sm:inline">· {item.hint}</span>
            </button>
          ))}
        </div>

        {notice ? (
          <Note tone={notice.tone} role={notice.tone === 'high' ? 'alert' : 'status'}>
            {notice.text}
          </Note>
        ) : null}

        {mode === 'ia' ? (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-ink-3">
              Copie o prompt, leve com o arquivo até um assistente com leitura de imagem e cole aqui a
              resposta.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={promptCopied ? 'success' : 'primary'}
                icon={promptCopied ? <Icons.Check size={15} /> : <Icons.Copy size={15} />}
                onClick={handleCopyPrompt}
              >
                {promptCopied ? 'Prompt copiado' : 'Copiar prompt'}
              </Button>
              <details className="min-w-0">
                <summary className="cursor-pointer text-xs font-semibold text-ink-3 hover:text-ink">
                  Ver o prompt
                </summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-[var(--radius-card)] border border-line bg-surface-subtle p-3 text-2xs leading-relaxed text-ink-2">
                  {prompt}
                </pre>
              </details>
            </div>

            <TextArea
              label="Resposta da IA"
              hint="Cole o bloco JSON inteiro, incluindo as chaves."
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={5}
              spellCheck={false}
              className="font-mono text-2xs"
              placeholder={'{\n  "versao": "suape-questionario-1",\n  "respostas": { … }\n}'}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Icons.Search size={14} />}
                disabled={!pasted.trim()}
                onClick={handleAnalyzePaste}
              >
                Conferir transcrição
              </Button>
              {pasted.trim() ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPasted('');
                    setPreview(null);
                    setCnpjWarning(null);
                  }}
                >
                  Limpar
                </Button>
              ) : null}
            </div>

            {preview ? (
              <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface-subtle p-4">
                {preview.ok ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="high" size="sm">
                        {preview.summary.sim} sim
                      </Chip>
                      <Chip tone="neutral" size="sm">
                        {preview.summary.nao} não
                      </Chip>
                      <Chip tone="warn" size="sm">
                        {preview.summary.naoIdentificado} sem resposta
                      </Chip>
                    </div>

                    {preview.generalData.valorContrato !== null ||
                    preview.generalData.processoSei ||
                    preview.generalData.diretoria ||
                    preview.generalData.gestor ? (
                      <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                        {[
                          [
                            'Valor',
                            preview.generalData.valorContrato !== null
                              ? `R$ ${preview.generalData.valorContrato.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                })}`
                              : null,
                          ],
                          ['Processo SEI', preview.generalData.processoSei],
                          ['Diretoria', preview.generalData.diretoria],
                          ['Gestor(a)', preview.generalData.gestor],
                        ]
                          .filter(([, value]) => value)
                          .map(([label, value]) => (
                            <div key={label as string} className="flex min-w-0 justify-between gap-2">
                              <dt className="shrink-0 text-ink-3">{label}</dt>
                              <dd className="min-w-0 truncate font-semibold text-ink" title={value as string}>
                                {value}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    ) : null}
                  </>
                ) : (
                  <Note tone="high" role="alert">
                    {preview.errors[0]}
                  </Note>
                )}

                {cnpjWarning ? (
                  <Note tone="high" role="alert">
                    {cnpjWarning}
                  </Note>
                ) : null}

                {preview.warnings.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {preview.warnings.map((warning) => (
                      <li key={warning} className="text-2xs leading-relaxed text-warn-text">
                        {warning}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {preview.ok ? (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<Icons.Check size={14} />}
                      onClick={handleApplyPreview}
                    >
                      Aplicar ao checklist
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                      Descartar
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.[0]) handleFileUpload(event.target.files[0]);
              }}
            />
            <button
              type="button"
              disabled={isUploading}
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
              className={cn(
                'flex w-full flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed p-6 text-center transition-colors',
                isDragging ? 'border-brand bg-brand-soft' : 'border-line hover:border-line-strong hover:bg-surface-hover',
                isUploading && 'pointer-events-none opacity-70',
              )}
            >
              {isUploading ? (
                <>
                  <span
                    aria-hidden="true"
                    className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent"
                  />
                  <span className="text-xs font-semibold text-ink">Lendo o questionário…</span>
                </>
              ) : (
                <>
                  <Icons.Upload size={20} className="text-ink-3" />
                  <span className="text-xs font-semibold text-ink">
                    Selecione ou arraste o questionário
                  </span>
                </>
              )}
            </button>
            {pendingFileImport ? (
              <div className="rounded-lg border border-brand-line bg-brand-soft p-4">
                <p className="text-xs font-bold text-brand">Confira antes de aplicar</p>
                <p className="mt-1 text-xs text-ink-2">{pendingFileImport.origem} · {Object.values(pendingFileImport.answers).filter((answer) => answer === true || answer === false).length} respostas identificadas.</p>
                {cnpjWarning ? <Note tone="high" role="alert">{cnpjWarning}</Note> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" icon={<Icons.Check size={14} />} onClick={() => {
                    onApply(pendingFileImport);
                    setAppliedFrom(pendingFileImport.origem);
                    setPendingFileImport(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}>Aplicar ao checklist</Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setPendingFileImport(null);
                    setCnpjWarning(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}>Descartar</Button>
                </div>
              </div>
            ) : null}
            <p className="text-2xs leading-relaxed text-ink-3">
              Lê o .xlsx original, onde cada resposta tem endereço de célula. PDF, foto e digitalização
              passam pela transcrição por IA.
            </p>
          </div>
        )}
      </div>
    </Section>
  );
};
