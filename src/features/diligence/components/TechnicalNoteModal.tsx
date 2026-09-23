// ==========================================================
// DILIGÊNCIA 360 — Nota Técnica
// ==========================================================
// Formulário à esquerda, nota pronta à direita. O analista marca as
// respostas do questionário do fornecedor (4.4, 5.2, 7.1, 7.2, 7.4) e
// as declarações de integridade; o nível de risco sai dessas
// respostas e escolhe o modelo da nota. A pesquisa reputacional e as
// consultas a cadastros, exigidas no Alto e no Muito Alto, saem do
// que esta diligência consultou.
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
import {
  DEFAULT_SIGNATORY,
  INTEGRITY_ITEMS,
  RISK_LEVEL_LABEL,
  buildResearchParagraph,
  buildTechnicalNote,
  defaultTechnicalNoteForm,
  missingFields,
  technicalNoteToHtml,
  technicalNoteToText,
  type IntegrityAnswer,
  type RiskLevel,
  type TechnicalNoteForm,
} from '../utils/technicalNote';

interface TechnicalNoteModalProps {
  isOpen: boolean;
  diligence: DiligenceItem;
  onClose: () => void;
}

const SIGNATORY_KEY = 'd360.technicalNote.signatory';

const LEVEL_TONE: Record<RiskLevel, ChipTone> = {
  BAIXO: 'ok',
  MEDIO: 'warn',
  ALTO: 'high',
  MUITO_ALTO: 'critical',
};

const LEVEL_REASON: Record<RiskLevel, string> = {
  BAIXO: 'Nenhum item que eleva o risco foi marcado. A nota termina com o arquivamento do processo.',
  MEDIO: 'Item 7.2 positivo (licenças, autorizações, ART/RRT). A nota termina com o arquivamento do processo.',
  ALTO: 'Item 7.1 positivo (atividade regulada). Inclui pesquisa reputacional e recomendações A–D.',
  MUITO_ALTO: 'Item 4.4 ou 5.2 positivo (condenação ou investigação por corrupção ou fraude). Inclui pesquisa reputacional e recomendações A–F.',
};

const ANSWER_OPTIONS: Array<{ value: IntegrityAnswer; label: string }> = [
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Não' },
  { value: 'omitir', label: 'Não citar' },
];

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

const Flag: React.FC<{
  label: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, disabled, onChange }) => (
  <label className={cn('flex min-w-0 items-start gap-2 text-sm text-ink-2', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-[color:var(--brand-blue)] disabled:cursor-not-allowed"
    />
    <span className="min-w-0">{label}</span>
  </label>
);

const ItemRef: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="num mr-1 font-bold text-ink">{children}</span>
);

const AnswerToggle: React.FC<{
  label: string;
  value: IntegrityAnswer;
  onChange: (value: IntegrityAnswer) => void;
}> = ({ label, value, onChange }) => (
  <div role="radiogroup" aria-label={label} className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
    <span className="min-w-0 flex-1 text-sm text-ink-2">{label}</span>
    <span className="inline-flex shrink-0 overflow-hidden rounded-md border border-line">
      {ANSWER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-8 px-2.5 text-xs font-semibold transition-colors',
            value === option.value ? 'bg-brand text-white' : 'bg-surface text-ink-3 hover:bg-surface-hover',
          )}
        >
          {option.label}
        </button>
      ))}
    </span>
  </div>
);

const FormGroup: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border border-line-soft p-3">
    <legend className="px-1 text-2xs font-bold uppercase tracking-wider text-ink-3">{title}</legend>
    {hint ? <p className="-mt-1 text-xs leading-snug text-ink-3">{hint}</p> : null}
    {children}
  </fieldset>
);

export const TechnicalNoteModal: React.FC<TechnicalNoteModalProps> = ({ isOpen, diligence, onClose }) => {
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

  const research = useMemo(() => buildResearchParagraph(diligence), [diligence]);
  const note = useMemo(() => buildTechnicalNote(form, diligence), [form, diligence]);
  const missing = missingFields(form);
  const nivel = note.nivel;
  const comPesquisa = nivel === 'ALTO' || nivel === 'MUITO_ALTO';

  const handleCopy = async (completa: boolean) => {
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
      size="2xl"
      icon={<Icons.FileText size={17} />}
      title={`Nota Técnica · ${RISK_LEVEL_LABEL[nivel]}`}
      subtitle={`${diligence.razaoSocial} · modelo da Assessoria Especial de Compliance`}
      footer={
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
      }
    >
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
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

          <FormGroup title="Respostas positivas no questionário" hint="Marque só o que a empresa respondeu SIM. O nível de risco sai daqui.">
            <Flag
              label={<><ItemRef>4.4</ItemRef>Condenação administrativa ou civil por corrupção ou fraude em licitações</>}
              checked={form.respondeuItem44}
              onChange={(v) => set('respondeuItem44', v)}
            />
            <Flag
              label={<><ItemRef>5.2</ItemRef>Condenação, processo ou investigação criminal de sócios por corrupção ou fraude</>}
              checked={form.respondeuItem52}
              onChange={(v) => set('respondeuItem52', v)}
            />
            <Flag
              label={<><ItemRef>7.1</ItemRef>Exerce atividade regulada</>}
              checked={form.respondeuItem71}
              onChange={(v) => set('respondeuItem71', v)}
            />
            {form.respondeuItem71 ? (
              <TextArea
                label="Exerce atividade regulada perante…"
                rows={3}
                value={form.atividadeRegulada}
                onChange={(e) => set('atividadeRegulada', e.target.value)}
                placeholder="a Agência Nacional do Petróleo, Gás Natural e Biocombustíveis (ANP), a Agência Nacional de Transportes Aquaviários (ANTAQ) … para o armazenamento e movimentação de granéis líquidos"
                hint={nivel === 'ALTO' ? 'Continua a frase “afirmando que exerce atividade regulada perante”.' : 'Opcional neste nível.'}
              />
            ) : null}
            <Flag
              label={<><ItemRef>7.2</ItemRef>Precisa de licenças, autorizações, ART/RRT ou permissões</>}
              checked={form.respondeuItem72}
              onChange={(v) => set('respondeuItem72', v)}
            />
            {form.respondeuItem72 ? (
              <TextArea
                label="Destaca-se… (opcional)"
                rows={2}
                value={form.licencasDestacadas}
                onChange={(e) => set('licencasDestacadas', e.target.value)}
                placeholder="a Licença de Operação emitida pela Agência Estadual de Meio Ambiente (CPRH) e as Anotações de Responsabilidade Técnica (ART) junto ao CREA"
              />
            ) : null}
            <Flag
              label={<><ItemRef>7.4</ItemRef>Interage com órgãos governamentais ou agentes públicos</>}
              checked={form.respondeuItem74}
              onChange={(v) => set('respondeuItem74', v)}
            />

            <div className="flex min-w-0 flex-col gap-1 rounded-md border border-line-soft bg-surface-subtle px-3 py-2.5">
              <span className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                Classificação
                <Chip tone={LEVEL_TONE[nivel]} size="sm" dot>{RISK_LEVEL_LABEL[nivel]}</Chip>
              </span>
              <span className="text-xs leading-snug text-ink-3">{LEVEL_REASON[nivel]}</span>
              <span className="text-xs leading-snug text-ink-3">
                O índice deste dossiê ({diligence.risco?.nivel || 'sem índice'}) é outra métrica e não entra na nota.
              </span>
            </div>
          </FormGroup>

          <FormGroup title="Declarações de integridade" hint="“Não citar” deixa o item fora do texto, como nas notas que não o mencionam.">
            {INTEGRITY_ITEMS.map((item) => (
              <AnswerToggle
                key={item.id}
                label={item.label}
                value={form.integridade[item.id]}
                onChange={(value) => set('integridade', { ...form.integridade, [item.id]: value })}
              />
            ))}
            <Flag
              label="Declarou não haver condenações, processos ou investigações contra a empresa e sócios"
              checked={form.declarouSemCondenacoes && nivel !== 'MUITO_ALTO'}
              disabled={nivel === 'MUITO_ALTO'}
              onChange={(v) => set('declarouSemCondenacoes', v)}
            />
          </FormGroup>

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
              hint="Texto montado a partir das fontes desta diligência (itens 3.3.2 e 3.3.3 da Política)."
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
    </Modal>
  );
};
