// ==========================================================
// DILIGÊNCIA 360 — Nota Técnica
// ==========================================================
// Abre a partir da Avaliação de Integridade SUAPE e escreve o que ela
// apurou: o nível é a classificação da avaliação, e as respostas do
// questionário (gatilhos, maturidade, condenações) vêm dela. Mudar a
// nota é mudar as respostas lá; aqui só entra o que o questionário não
// traz em forma de sim/não.
//
// A saída é para colar no editor do SEI: "Copiar para o SEI" leva só
// o corpo, porque o SEI já monta timbre, título numerado e rodapé.
//
// Quem monta deve passar `key={diligence.id}`: trocar de diligência
// recomeça o formulário, e o signatário volta do armazenamento local.
// ==========================================================

import React, { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Chip, type ChipTone } from '../../../components/ui/Chip';
import { Icons } from '../../../components/ui/Icons';
import { Modal } from '../../../components/ui/Modal';
import { Note } from '../../../components/ui/Note';
import { TextArea, TextField } from '../../../components/ui/Field';
import { cn } from '../../../lib/cn';
import type { DiligenceItem } from '../types';
import type {
  IntegrityAnswers,
  SuapeCalculatedRisk,
  SuapeIntegrityEvaluationResult,
} from '../utils/suapeRiskMapRowGenerator';
import {
  DEFAULT_SIGNATORY,
  buildResearchParagraph,
  buildTechnicalNote,
  defaultTechnicalNoteForm,
  missingFields,
  technicalNoteToHtml,
  technicalNoteToText,
  type TechnicalNoteForm,
  type TechnicalNoteSource,
} from '../utils/technicalNote';

interface TechnicalNoteModalProps {
  isOpen: boolean;
  diligence: DiligenceItem;
  /** Respostas do questionário, as mesmas da Avaliação de Integridade. */
  answers: IntegrityAnswers;
  /** Resultado da Avaliação de Integridade SUAPE. */
  evaluation: SuapeIntegrityEvaluationResult;
  onClose: () => void;
}

const SIGNATORY_KEY = 'd360.technicalNote.signatory';

const RISK_TONE: Record<SuapeCalculatedRisk, ChipTone> = {
  'Muito Alto': 'critical',
  Alto: 'high',
  'Médio': 'warn',
  Baixo: 'ok',
};

function loadSignatory(): Pick<TechnicalNoteForm, 'signatario' | 'cargo'> {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SIGNATORY_KEY) || 'null');
    if (saved && typeof saved.signatario === 'string' && typeof saved.cargo === 'string') return saved;
  } catch {
    // Armazenamento indisponível: segue com o padrão.
  }
  return DEFAULT_SIGNATORY;
}

function saveSignatory(signatario: string, cargo: string) {
  try {
    window.localStorage.setItem(SIGNATORY_KEY, JSON.stringify({ signatario, cargo }));
  } catch {
    // Conveniência apenas; a nota não depende disso.
  }
}

/** Devolve `true` quando a formatação (HTML) foi junto. */
async function copyNote(html: string, text: string): Promise<boolean> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    } catch {
      // Alguns navegadores recusam HTML e aceitam texto simples.
    }
  }
  await navigator.clipboard.writeText(text);
  return false;
}

const FormGroup: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border border-line-soft p-3">
    <legend className="px-1 text-2xs font-bold uppercase tracking-wider text-ink-3">{title}</legend>
    {hint ? <p className="-mt-1 text-xs leading-snug text-ink-3">{hint}</p> : null}
    {children}
  </fieldset>
);

export const TechnicalNoteModal: React.FC<TechnicalNoteModalProps> = ({
  isOpen,
  diligence,
  answers,
  evaluation,
  onClose,
}) => {
  const [form, setForm] = useState<TechnicalNoteForm>(() => ({
    ...defaultTechnicalNoteForm(diligence),
    ...loadSignatory(),
  }));
  const [editingResearch, setEditingResearch] = useState(false);
  const [copyStatus, setCopyStatus] = useState<{ tone: 'ok' | 'high'; text: string } | null>(null);

  const set = <K extends keyof TechnicalNoteForm>(key: K, value: TechnicalNoteForm[K]) => {
    setCopyStatus(null);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const source: TechnicalNoteSource = useMemo(
    () => ({ diligence, answers, evaluation }),
    [diligence, answers, evaluation],
  );
  const nivel = evaluation.calculatedRisk;
  const research = useMemo(
    () => buildResearchParagraph(diligence, evaluation.registryCoverage),
    [diligence, evaluation.registryCoverage],
  );
  const note = useMemo(() => buildTechnicalNote(form, source), [form, source]);
  const missing = missingFields(form, source);
  const comPesquisa = nivel === 'Alto' || nivel === 'Muito Alto';
  const gatilhos = evaluation.triggeredRisks.map((risk) => risk.item === 'alcadaConselho' ? 'Alçada do Conselho' : risk.item);

  const handleCopy = async (completa: boolean) => {
    if (!note) return;
    saveSignatory(form.signatario, form.cargo);
    try {
      const formatted = await copyNote(technicalNoteToHtml(note, { completa }), technicalNoteToText(note, { completa }));
      const what = completa ? 'Nota completa copiada' : 'Corpo da nota copiado. Cole no editor do documento no SEI';
      setCopyStatus({ tone: 'ok', text: formatted ? `${what}.` : `${what} (sem formatação).` });
    } catch {
      setCopyStatus({ tone: 'high', text: 'O navegador bloqueou a cópia. Selecione o texto da pré-visualização e copie manualmente.' });
    }
  };

  const startEditingResearch = () => {
    set('pesquisaAjustada', form.pesquisaAjustada || research.texto);
    setEditingResearch(true);
  };

  const restoreResearch = () => {
    set('pesquisaAjustada', '');
    setEditingResearch(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={note ? '2xl' : 'md'}
      icon={<Icons.FileText size={17} />}
      title={nivel ? `Nota Técnica · Risco ${nivel}` : 'Nota Técnica'}
      subtitle={`${diligence.razaoSocial} · baseada na Avaliação de Integridade SUAPE`}
      footer={
        note ? (
          <>
            {copyStatus ? (
              <p role="status" className={cn('mr-auto text-xs font-semibold', copyStatus.tone === 'ok' ? 'text-ok-text' : 'text-high-text')}>
                {copyStatus.text}
              </p>
            ) : missing.length > 0 ? (
              <p className="mr-auto text-xs text-ink-3">Falta preencher: {missing.join(', ')}.</p>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => handleCopy(true)}>
              Copiar nota completa
            </Button>
            <Button variant="primary" size="sm" onClick={() => handleCopy(false)} icon={<Icons.FileText size={15} aria-hidden="true" />}>
              Copiar para o SEI
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={onClose}>Fechar</Button>
        )
      }
    >
      {!note ? (
        <Note tone="warn" icon={<Icons.AlertTriangle size={15} />} title="Classificação pendente">
          A nota sai da classificação da Avaliação de Integridade, e ela ainda não tem questionário.
          Importe ou preencha as respostas do terceiro na aba Avaliação de integridade.
        </Note>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line-soft bg-surface-subtle px-3 py-2.5">
              <span className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-2">
                Classificação da avaliação
                <Chip tone={RISK_TONE[note.nivel]} size="sm" dot>Risco {note.nivel}</Chip>
              </span>
              <span className="text-xs leading-snug text-ink-3">
                {gatilhos.length > 0 ? `Respostas positivas que classificam: ${gatilhos.join(', ')}.` : 'Nenhum item que eleva o risco foi respondido com Sim.'}
                {' '}Para mudar a nota, altere as respostas na Avaliação de integridade.
              </span>
            </div>

            {evaluation.isProvisional ? (
              <Note tone="warn" icon={<Icons.AlertTriangle size={15} />} title="Classificação provisória">
                {evaluation.unidentifiedItems.length} item(ns) do questionário sem resposta ({evaluation.unidentifiedItems.join(', ')}).
                O que falta só pode agravar o risco; a Política manda devolver ao terceiro antes de concluir.
              </Note>
            ) : null}

            {evaluation.contradictions.length > 0 ? (
              <Note tone="high" icon={<Icons.AlertCircle size={15} />} title="Declaração contraria fonte oficial">
                <ul className="list-disc pl-4">
                  {evaluation.contradictions.map((item) => (
                    <li key={item.item + item.evidence}>Item {item.item}: {item.evidence}</li>
                  ))}
                </ul>
              </Note>
            ) : null}

            <FormGroup title="Identificação">
              <div className="grid grid-cols-[1fr_90px] gap-2">
                <TextField label="Nº da nota" value={form.numero} onChange={(e) => set('numero', e.target.value)} placeholder="154" inputMode="numeric" />
                <TextField label="Ano" value={form.ano} onChange={(e) => set('ano', e.target.value)} inputMode="numeric" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <TextField label="Cidade" value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />
                <TextField label="Data" type="date" value={form.data} onChange={(e) => set('data', e.target.value)} />
              </div>
              <TextField
                label="Empresa, como deve aparecer na nota"
                value={form.empresa}
                onChange={(e) => set('empresa', e.target.value)}
                hint="A Receita devolve em maiúsculas. Ajuste para a grafia usual, se preferir."
              />
              <TextArea
                label="Objeto da contratação (ementa)"
                rows={2}
                value={form.objeto}
                onChange={(e) => set('objeto', e.target.value)}
                placeholder="empresa especializada em armazenamento e movimentação de granéis líquidos no Porto Organizado de Suape"
              />
            </FormGroup>

            {answers['7.1'] === true || answers['7.2'] === true ? (
              <FormGroup title="Detalhes dos itens 7.1 e 7.2" hint="O questionário traz estes dados em linhas livres; transcreva o que deve constar na nota.">
                {answers['7.1'] === true ? (
                  <TextArea
                    label="7.1 · Exerce atividade regulada perante…"
                    rows={3}
                    value={form.atividadeRegulada}
                    onChange={(e) => set('atividadeRegulada', e.target.value)}
                    placeholder="a Agência Nacional do Petróleo, Gás Natural e Biocombustíveis (ANP), a Agência Nacional de Transportes Aquaviários (ANTAQ) … para o armazenamento e movimentação de granéis líquidos"
                  />
                ) : null}
                {answers['7.2'] === true ? (
                  <TextArea
                    label="7.2 · Destaca-se… (opcional)"
                    rows={2}
                    value={form.licencasDestacadas}
                    onChange={(e) => set('licencasDestacadas', e.target.value)}
                    placeholder="a Licença de Operação emitida pela Agência Estadual de Meio Ambiente (CPRH) e as Anotações de Responsabilidade Técnica (ART) junto ao CREA"
                  />
                ) : null}
              </FormGroup>
            ) : null}

            <FormGroup title="Análise documental (opcional)" hint="Achados sobre documentos, como validade de registro. Uma linha em branco separa parágrafos.">
              <TextArea
                aria-label="Observações da análise documental"
                rows={4}
                value={form.observacoes}
                onChange={(e) => set('observacoes', e.target.value)}
                placeholder="No curso da análise documental, verificou-se que a documentação relacionada ao registro perante o CAU/PE apresenta validade até 21/09/2026."
              />
            </FormGroup>

            {comPesquisa ? (
              <FormGroup
                title="Pesquisa reputacional e cadastros"
                hint="Exigida pelos itens 3.3.2 e 3.3.3 da Política nesta classificação. Montada com as fontes da diligência e os cadastros da avaliação."
              >
                {research.alertas.length > 0 ? (
                  <Note tone="warn" icon={<Icons.AlertTriangle size={15} />} title="Revise antes de assinar">
                    <ul className="list-disc pl-4">
                      {research.alertas.map((alerta) => <li key={alerta}>{alerta}</li>)}
                    </ul>
                  </Note>
                ) : null}
                {editingResearch ? (
                  <>
                    <TextArea
                      label="Texto ajustado"
                      rows={8}
                      value={form.pesquisaAjustada}
                      onChange={(e) => set('pesquisaAjustada', e.target.value)}
                    />
                    <Button variant="ghost" size="sm" onClick={restoreResearch} icon={<Icons.RefreshCw size={14} aria-hidden="true" />}>
                      Voltar ao texto automático
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={startEditingResearch}>
                    Ajustar texto da pesquisa
                  </Button>
                )}
              </FormGroup>
            ) : null}

            <FormGroup title="Assinatura">
              <TextField label="Nome" value={form.signatario} onChange={(e) => set('signatario', e.target.value)} />
              <TextField label="Cargo" value={form.cargo} onChange={(e) => set('cargo', e.target.value)} />
            </FormGroup>
          </div>

          <article
            aria-label="Pré-visualização da nota técnica"
            className="min-w-0 self-start rounded-lg border border-line bg-white px-5 py-6 font-[Georgia,'Times_New_Roman',serif] text-[13.5px] leading-relaxed text-[#1a1a1a] shadow-xs sm:px-8"
          >
            <p className="text-center font-bold">{note.titulo}</p>
            <p className="mt-5 text-right">{note.local}</p>
            <p className="mt-5 text-justify"><b>Ementa:</b> {note.ementa}</p>
            {note.paragrafos.map((texto, index) => (
              <p key={index} className="mt-4 indent-10 text-justify">{texto}</p>
            ))}
            {note.recomendacoes.map((texto) => (
              <p key={texto.slice(0, 2)} className="mt-3 indent-10 text-justify">{texto}</p>
            ))}
            <p className="mt-4 indent-10 text-justify">{note.fecho}</p>
            <p className="mt-6">Atenciosamente,</p>
            <p className="mt-8 text-center">
              {note.assinatura.nome}
              <br />
              {note.assinatura.cargo}
              <br />
              {note.assinatura.unidade}
            </p>
            <p className="mt-8 border-t border-[#ddd] pt-3 text-center text-[10.5px] text-[#555]">
              {note.rodape[0]}
              <br />
              {note.rodape[1]}
            </p>
          </article>
        </div>
      )}
    </Modal>
  );
};
