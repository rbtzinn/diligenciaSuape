// ==========================================================
// DILIGÊNCIA 360 — Cockpit Executivo Questionário SUAPE 2026.2
// Novo layout Split-View (Master-Detail): zero rolagem feia,
// navegação lateral estruturada pelos 10 eixos, leitura ampla e
// foco absoluto em usabilidade, clareza e cores oficiais SUAPE.
// ==========================================================

import React, { useMemo, useState } from 'react';
import type { DiligenceItem, ProcessDiscovery } from '../types';
import {
  buildSuapeQuestionnaire,
  SuapeQuestionItem,
  SuapeQuestionnaireReport,
} from '../utils/suapeQuestionnaireEngine';
import { downloadSuapeQuestionnaireExcel } from '../utils/suapeQuestionnaireExport';
import { Icons } from '../../../components/ui/Icons';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';

interface SuapeQuestionnaireViewProps {
  diligence: DiligenceItem;
  discoveries?: ProcessDiscovery[];
  onOpenEvidence?: () => void;
  onOpenNetwork?: () => void;
}

export const SuapeQuestionnaireView: React.FC<SuapeQuestionnaireViewProps> = ({
  diligence,
  discoveries = [],
  onOpenEvidence,
  onOpenNetwork,
}) => {
  const initialReport = useMemo(
    () => buildSuapeQuestionnaire(diligence, discoveries),
    [diligence, discoveries],
  );

  // Estado de navegação: seleciona a seção ativa (1 a 10 ou 'all')
  const [activeSection, setActiveSection] = useState<number | 'all'>(1);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'review' | 'automated' | 'declaratory'>('all');
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [allCopied, setAllCopied] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  // Aplica edições locais no relatório
  const report: SuapeQuestionnaireReport = useMemo(() => {
    if (Object.keys(editedAnswers).length === 0) return initialReport;
    const updateQuestions = (list: SuapeQuestionItem[]) =>
      list.map((q) => (editedAnswers[q.id] !== undefined ? { ...q, value: editedAnswers[q.id] } : q));

    return {
      ...initialReport,
      allQuestions: updateQuestions(initialReport.allQuestions),
      sections: initialReport.sections.map((s) => ({
        ...s,
        questions: updateQuestions(s.questions),
      })),
    };
  }, [editedAnswers, initialReport]);

  const { metrics } = report;

  // Seção atualmente selecionada
  const currentSectionMeta = useMemo(() => {
    if (activeSection === 'all') {
      return {
        sectionNumber: 0,
        title: 'Visão Geral Consolidada',
        subtitle: 'Todas as 10 seções do questionário de integridade exibidas em sequência contínua.',
        questions: report.allQuestions,
      };
    }
    return report.sections.find((s) => s.sectionNumber === activeSection) || report.sections[0];
  }, [activeSection, report]);

  // Perguntas exibidas com filtros de busca e status
  const displayedQuestions = useMemo(() => {
    let list = currentSectionMeta.questions;

    if (filterStatus === 'review') {
      list = list.filter((q) => q.status === 'review');
    } else if (filterStatus === 'automated') {
      list = list.filter((q) => q.status === 'automated' || q.status === 'regular');
    } else if (filterStatus === 'declaratory') {
      list = list.filter((q) => q.status === 'declaratory');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item) => {
        return (
          item.code.toLowerCase().includes(q) ||
          item.question.toLowerCase().includes(q) ||
          item.value.toLowerCase().includes(q) ||
          (item.sourceLabel || '').toLowerCase().includes(q) ||
          (item.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      });
    }

    return list;
  }, [currentSectionMeta.questions, filterStatus, searchQuery]);

  // Pergunta selecionada para o inspetor lateral
  const activeInspectedQuestion = useMemo(() => {
    if (selectedQuestionId) {
      const found = report.allQuestions.find((q) => q.id === selectedQuestionId);
      if (found) return found;
    }
    return displayedQuestions[0] || report.allQuestions[0] || null;
  }, [displayedQuestions, report.allQuestions, selectedQuestionId]);

  const handleCopySingle = async (item: SuapeQuestionItem) => {
    const text = `[SUAPE Diligência · Item ${item.code}] ${item.question}\nStatus: ${item.statusLabel}\nResposta: ${item.value}\nFonte Oficial: ${item.sourceLabel || 'Diligência 360 SUAPE'}`;
    await navigator.clipboard.writeText(text);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAll = async () => {
    const lines = [
      `=== QUESTIONÁRIO DE DILIGÊNCIA SUAPE 2026.2 ===`,
      `Empresa: ${report.companyName} (${report.cnpjFormatted})`,
      `Data: ${new Date(report.generatedAt).toLocaleDateString('pt-BR')}`,
      `Índice de Preenchimento: ${report.metrics.completionPercent}%`,
      '',
    ];

    report.sections.forEach((sec) => {
      lines.push(`--- ${sec.title} ---`);
      sec.questions.forEach((q) => {
        lines.push(`[${q.code}] ${q.question}`);
        lines.push(`Status: ${q.statusLabel}`);
        lines.push(`Resposta: ${q.value}`);
        if (q.details) lines.push(`Obs: ${q.details}`);
        lines.push(`Fonte: ${q.sourceLabel || 'Diligência 360'}`);
        lines.push('');
      });
    });

    await navigator.clipboard.writeText(lines.join('\n'));
    setAllCopied(true);
    setTimeout(() => setAllCopied(false), 2500);
  };

  const goToNextSection = () => {
    if (activeSection === 'all') return;
    if (activeSection < 10) setActiveSection(activeSection + 1);
  };

  const goToPrevSection = () => {
    if (activeSection === 'all') return;
    if (activeSection > 1) setActiveSection(activeSection - 1);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-canvas text-ink">
      {/* ==========================================================
          SUB-BARRA DE CONTROLE: Métricas e Ações em Linha
          ========================================================== */}
      <header className="shrink-0 border-b border-line bg-surface px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-white font-extrabold text-2xs">
                S
              </span>
              <span className="text-xs font-extrabold tracking-tight text-ink uppercase">
                Questionário SUAPE 2026.2
              </span>
            </div>

            <div className="hidden h-4 w-px bg-line sm:block" />

            {/* Resumo compacto de preenchimento */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-ink-2">Conclusão:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{ width: `${metrics.completionPercent}%` }}
                  />
                </div>
                <span className="font-mono text-xs font-bold text-brand">{metrics.completionPercent}%</span>
              </div>
            </div>

            <div className="hidden h-4 w-px bg-line md:block" />

            {/* Chips rápidos de estado */}
            <div className="hidden items-center gap-1.5 md:flex text-2xs">
              <span className="rounded-md bg-ok-soft px-2 py-0.5 font-semibold text-ok border border-ok-border">
                {metrics.automated + metrics.regular} Preenchidas
              </span>
              {metrics.review > 0 && (
                <span className="rounded-md bg-warn-soft px-2 py-0.5 font-bold text-warn border border-warn-border">
                  {metrics.review} Atenção
                </span>
              )}
              <span className="rounded-md bg-info-soft px-2 py-0.5 font-semibold text-info border border-info-border">
                {metrics.declaratory} Declaratórias
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenEvidence && (
              <Button variant="ghost" size="sm" onClick={onOpenEvidence} icon={<Icons.Shield size={14} />}>
                Evidências
              </Button>
            )}
            {onOpenNetwork && (
              <Button variant="ghost" size="sm" onClick={onOpenNetwork} icon={<Icons.Network size={14} />}>
                Mapa
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyAll}
              icon={allCopied ? <Icons.Check size={14} className="text-ok" /> : <Icons.Copy size={14} />}
            >
              {allCopied ? 'Copiado!' : 'Copiar'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => downloadSuapeQuestionnaireExcel(report)}
              icon={<Icons.Download size={14} />}
            >
              Baixar Excel (.xls)
            </Button>
            <button
              type="button"
              onClick={() => setInspectorOpen(!inspectorOpen)}
              title={inspectorOpen ? 'Recolher painel de detalhes' : 'Expandir painel de detalhes'}
              className={cn(
                'hidden lg:flex items-center justify-center rounded-lg border p-1.5 transition-colors',
                inspectorOpen ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink-3 hover:bg-canvas',
              )}
            >
              <Icons.Layers size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ==========================================================
          CORPO PRINCIPAL SPLIT-VIEW:
          [Menu Lateral dos 10 Eixos] | [Painel de Leitura] | [Inspetor]
          ========================================================== */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ========================================================
            COLUNA 1 (300px): Navegador dos 10 Eixos Oficiais
            ======================================================== */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface">
          {/* Busca Rápida na Sidebar */}
          <div className="border-b border-line p-3">
            <div className="relative">
              <Icons.Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar perguntas ou termos..."
                className="w-full rounded-lg border border-line bg-canvas py-1.5 pl-8 pr-7 text-xs text-ink placeholder:text-ink-3 focus:border-brand focus:bg-surface focus:outline-none focus:ring-1 focus:ring-brand"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-3 hover:text-ink"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filtro rápido de status */}
            <div className="mt-2 flex items-center justify-between gap-1 text-3xs">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={cn(
                  'flex-1 rounded py-1 font-semibold transition-colors text-center',
                  filterStatus === 'all' ? 'bg-ink text-surface' : 'bg-canvas text-ink-3 hover:text-ink',
                )}
              >
                Todas ({report.allQuestions.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('review')}
                className={cn(
                  'flex-1 rounded py-1 font-semibold transition-colors text-center',
                  filterStatus === 'review' ? 'bg-warn text-ink font-extrabold' : 'bg-canvas text-warn hover:bg-warn-soft',
                )}
              >
                Atenção ({metrics.review})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('automated')}
                className={cn(
                  'flex-1 rounded py-1 font-semibold transition-colors text-center',
                  filterStatus === 'automated' ? 'bg-ok text-white font-extrabold' : 'bg-canvas text-ok hover:bg-ok-soft',
                )}
              >
                API ({metrics.automated + metrics.regular})
              </button>
            </div>
          </div>

          {/* Lista dos 10 Eixos SUAPE */}
          <nav aria-label="Eixos do Questionário" className="flex-1 overflow-y-auto p-2 space-y-1">
            <button
              type="button"
              onClick={() => setActiveSection('all')}
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition-all',
                activeSection === 'all'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-ink-2 hover:bg-canvas hover:text-ink',
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-md font-mono text-3xs font-extrabold',
                    activeSection === 'all' ? 'bg-white/20 text-white' : 'bg-line text-ink-2',
                  )}
                >
                  ∞
                </span>
                <span>Ver Todos os 10 Eixos</span>
              </div>
              <span className={cn('text-3xs font-mono', activeSection === 'all' ? 'text-white/80' : 'text-ink-3')}>
                {report.allQuestions.length}
              </span>
            </button>

            <div className="my-1.5 px-3 pt-1 text-3xs font-bold uppercase tracking-wider text-ink-3">
              Eixos Oficiais SUAPE
            </div>

            {report.sections.map((sec) => {
              const isCurrent = activeSection === sec.sectionNumber;
              const hasAlert = sec.reviewCount > 0;
              const isAllAutomated = sec.reviewCount === 0 && sec.declaratoryCount === 0;

              return (
                <button
                  key={sec.sectionNumber}
                  type="button"
                  onClick={() => setActiveSection(sec.sectionNumber)}
                  className={cn(
                    'group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-all',
                    isCurrent
                      ? 'bg-brand text-white font-bold shadow-xs'
                      : 'text-ink-2 hover:bg-canvas hover:text-ink font-medium',
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-3xs font-black',
                        isCurrent
                          ? 'bg-white/20 text-white'
                          : hasAlert
                            ? 'bg-warn-soft text-warn font-extrabold'
                            : 'bg-line text-ink-3',
                      )}
                    >
                      {sec.sectionNumber}
                    </span>
                    <span className="truncate">{sec.title.replace(/^\d+\.\s*/, '')}</span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 ml-2">
                    {hasAlert && (
                      <span
                        className={cn(
                          'flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-3xs font-black',
                          isCurrent ? 'bg-warn text-ink' : 'bg-warn text-white',
                        )}
                        title={`${sec.reviewCount} item(ns) exigem atenção`}
                      >
                        !{sec.reviewCount}
                      </span>
                    )}
                    {isAllAutomated && !hasAlert && (
                      <Icons.Check
                        size={12}
                        className={cn(isCurrent ? 'text-white' : 'text-ok')}
                      />
                    )}
                    <span className={cn('text-3xs font-mono', isCurrent ? 'text-white/70' : 'text-ink-3')}>
                      {sec.totalQuestions}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ========================================================
            COLUNA 2 (Central): Painel de Leitura Ampla e Focada
            ======================================================== */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-canvas p-4 sm:p-6">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
            {/* Cabeçalho do Eixo Selecionado */}
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xs font-extrabold uppercase tracking-wider text-brand">
                      {activeSection === 'all' ? 'Consolidação' : `Eixo ${activeSection} de 10`}
                    </span>
                    <span className="text-2xs text-ink-3">· Questionário Oficial SUAPE</span>
                  </div>
                  <h2 className="mt-1 text-lg font-black text-ink sm:text-xl">
                    {currentSectionMeta.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-2">
                    {currentSectionMeta.subtitle}
                  </p>
                </div>

                {activeSection !== 'all' && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={activeSection === 1}
                      onClick={goToPrevSection}
                      className="rounded-lg border border-line bg-canvas p-1.5 text-ink-2 hover:bg-surface-hover hover:text-ink disabled:opacity-30 transition-colors"
                      title="Eixo Anterior"
                    >
                      <Icons.ArrowLeft size={14} />
                    </button>
                    <span className="text-xs font-mono font-bold text-ink-3 px-1">
                      {activeSection}/10
                    </span>
                    <button
                      type="button"
                      disabled={activeSection === 10}
                      onClick={goToNextSection}
                      className="rounded-lg border border-line bg-canvas p-1.5 text-ink-2 hover:bg-surface-hover hover:text-ink disabled:opacity-30 transition-colors"
                      title="Próximo Eixo"
                    >
                      <Icons.ArrowRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Lista de Perguntas do Eixo */}
            {displayedQuestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface p-12 text-center">
                <Icons.Search size={28} className="text-ink-3" />
                <h3 className="mt-2 text-sm font-bold text-ink">Nenhuma pergunta encontrada neste filtro</h3>
                <p className="mt-0.5 text-xs text-ink-2">Tente alterar os filtros de status ou a busca textual.</p>
                <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setFilterStatus('all'); setSearchQuery(''); }}>
                  Limpar Filtros
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {displayedQuestions.map((item) => {
                  const isSelected = activeInspectedQuestion?.id === item.id;
                  const isEditing = editingId === item.id;
                  const isCopied = copiedId === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedQuestionId(item.id)}
                      className={cn(
                        'group relative flex cursor-pointer flex-col rounded-2xl border bg-surface p-5 shadow-2xs transition-all',
                        isSelected ? 'ring-2 ring-brand border-brand' : 'border-line hover:border-line-strong',
                        item.status === 'review' && !isSelected && 'border-warn-border bg-warn-soft/20',
                      )}
                    >
                      {/* Topo do Card de Pergunta */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-black',
                              item.status === 'review'
                                ? 'bg-warn text-ink'
                                : 'bg-brand-soft text-brand',
                            )}
                          >
                            {item.code}
                          </span>
                          <div>
                            <span className="text-3xs font-bold uppercase tracking-wider text-ink-3">
                              {item.sectionTitle}
                            </span>
                            <h3 className="text-sm font-extrabold text-ink leading-snug">
                              {item.question}
                            </h3>
                          </div>
                        </div>

                        {/* Badge de Status */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-bold',
                              item.status === 'automated' && 'bg-ok-soft text-ok border border-ok-border',
                              item.status === 'regular' && 'bg-ok-soft text-ok border border-ok-border',
                              item.status === 'review' && 'bg-warn text-white font-black shadow-2xs',
                              item.status === 'declaratory' && 'bg-info-soft text-info border border-info-border',
                            )}
                          >
                            {item.status === 'automated' && <Icons.Check size={11} />}
                            {item.status === 'regular' && <Icons.ShieldCheck size={11} />}
                            {item.status === 'review' && '! '}
                            {item.status === 'declaratory' && <Icons.FileText size={11} />}
                            {item.statusLabel}
                          </span>
                        </div>
                      </div>

                      {/* Bloco de Resposta */}
                      <div className="mt-3.5 rounded-xl border border-line bg-canvas p-3.5">
                        {isEditing ? (
                          <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
                            <label className="text-3xs font-bold uppercase tracking-wider text-ink-3">
                              Ajustar Resposta da Diligência:
                            </label>
                            <textarea
                              rows={3}
                              defaultValue={item.value}
                              id={`edit-text-${item.id}`}
                              className="w-full rounded-lg border border-line bg-surface p-2.5 text-xs text-ink leading-relaxed focus:border-brand focus:outline-none"
                            />
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                                Cancelar
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  const val = (document.getElementById(`edit-text-${item.id}`) as HTMLTextAreaElement)?.value;
                                  if (val !== undefined) setEditedAnswers((prev) => ({ ...prev, [item.id]: val }));
                                  setEditingId(null);
                                }}
                              >
                                Salvar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-semibold leading-relaxed text-ink">
                              {item.value}
                            </p>
                            <div
                              className="flex shrink-0 items-center gap-1 opacity-80 group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => handleCopySingle(item)}
                                title="Copiar resposta"
                                className="rounded-md p-1 text-ink-3 hover:bg-surface hover:text-ink"
                              >
                                {isCopied ? <Icons.Check size={13} className="text-ok" /> : <Icons.Copy size={13} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(item.id)}
                                title="Editar resposta"
                                className="rounded-md p-1 text-ink-3 hover:bg-surface hover:text-ink"
                              >
                                <Icons.Edit size={13} />
                              </button>
                            </div>
                          </div>
                        )}

                        {item.details && !isEditing && (
                          <div className="mt-2 border-t border-line-subtle pt-2 text-2xs leading-relaxed text-ink-2">
                            <strong className="font-semibold text-ink-3">Contextualização: </strong>
                            {item.details}
                          </div>
                        )}
                      </div>

                      {/* Subtabela de Dados da Pergunta (Sócios, PEP, 9.2 Listas) */}
                      {item.tableData && item.tableData.length > 0 && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-surface">
                          <div className="border-b border-line bg-surface-subtle px-3 py-1.5 text-3xs font-bold uppercase tracking-wider text-ink-3">
                            Tabela Oficial ({item.tableData.length} registros)
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-2xs text-ink">
                              <thead className="border-b border-line bg-canvas text-3xs font-bold uppercase text-ink-3">
                                <tr>
                                  {Object.keys(item.tableData[0]).map((h) => (
                                    <th key={h} className="px-3 py-1.5 font-semibold">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line-subtle">
                                {item.tableData.map((row, rIdx) => (
                                  <tr key={rIdx} className="hover:bg-canvas/60">
                                    {Object.values(row).map((v, cIdx) => (
                                      <td key={cIdx} className="px-3 py-2 text-2xs text-ink font-medium">
                                        {String(v ?? '—')}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Rodapé do Card */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-3xs text-ink-3">
                        <div className="flex items-center gap-1.5">
                          <Icons.Database size={11} className="text-brand" />
                          <span>
                            Fonte: <strong className="text-ink-2 font-semibold">{item.sourceLabel || 'Bases Oficiais'}</strong>
                          </span>
                        </div>
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {item.tags.map((t) => (
                              <span key={t} className="rounded bg-canvas px-1.5 py-0.2 text-3xs font-semibold text-ink-3">
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Navegação Sequencial de Rodapé */}
            {activeSection !== 'all' && (
              <div className="mt-2 flex items-center justify-between rounded-2xl border border-line bg-surface p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={activeSection === 1}
                  onClick={goToPrevSection}
                  icon={<Icons.ArrowLeft size={14} />}
                >
                  Eixo Anterior
                </Button>
                <span className="text-xs font-bold text-ink-2">
                  Eixo {activeSection} de 10
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={activeSection === 10}
                  onClick={goToNextSection}
                  rightIcon={<Icons.ArrowRight size={14} />}
                >
                  Próximo Eixo
                </Button>
              </div>
            )}
          </div>
        </main>

        {/* ========================================================
            COLUNA 3 (Direita - Inspetor de Compliance SUAPE):
            ======================================================== */}
        {inspectorOpen && activeInspectedQuestion && (
          <aside className="hidden w-80 shrink-0 flex-col border-l border-line bg-surface lg:flex">
            <div className="flex items-center justify-between border-b border-line p-3.5">
              <div className="flex items-center gap-1.5">
                <Icons.Shield size={14} className="text-brand" />
                <span className="text-xs font-black uppercase tracking-wider text-ink">
                  Inspetor de Evidência
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="text-xs text-ink-3 hover:text-ink p-1"
                title="Fechar painel"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Card Resumo do Item Ativo */}
              <div className="rounded-xl border border-line bg-canvas p-3">
                <span className="text-3xs font-mono font-bold text-brand">ITEM {activeInspectedQuestion.code}</span>
                <h4 className="mt-1 text-xs font-black text-ink leading-snug">
                  {activeInspectedQuestion.question}
                </h4>
                <div className="mt-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5 text-3xs font-bold',
                      activeInspectedQuestion.status === 'review'
                        ? 'bg-warn text-white'
                        : 'bg-ok-soft text-ok border border-ok-border',
                    )}
                  >
                    {activeInspectedQuestion.statusLabel}
                  </span>
                </div>
              </div>

              {/* Fundamentação Legal e Instrução de Compliance */}
              <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
                <h5 className="text-3xs font-black uppercase tracking-wider text-ink-3">
                  Base Legal & Critério SUAPE
                </h5>
                <p className="text-2xs text-ink-2 leading-relaxed">
                  Conforme a <strong>Lei Federal nº 13.303/2016 (Lei das Estatais)</strong> e o Regulamento de Licitações
                  e Contratos de SUAPE, a diligência de integridade exige verificação formal de sanções impeditivas,
                  quadro societário e conflitos de interesse.
                </p>
                <div className="rounded-lg bg-canvas p-2.5 text-3xs text-ink-3">
                  <strong className="text-ink font-semibold">Fonte Oficial Auditável:</strong>{' '}
                  {activeInspectedQuestion.sourceLabel || 'Bases públicas integradas'}
                </div>
              </div>

              {/* Detalhes Técnicos da Resposta */}
              <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
                <h5 className="text-3xs font-black uppercase tracking-wider text-ink-3">
                  Texto da Resposta Gerada
                </h5>
                <p className="rounded-lg bg-canvas p-2.5 text-2xs font-medium text-ink leading-relaxed">
                  {activeInspectedQuestion.value}
                </p>
                {activeInspectedQuestion.details && (
                  <p className="text-3xs text-ink-3 italic leading-relaxed">
                    {activeInspectedQuestion.details}
                  </p>
                )}
              </div>

              {/* Ações Rápidas no Inspetor */}
              <div className="space-y-1.5 pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  block
                  onClick={() => handleCopySingle(activeInspectedQuestion)}
                  icon={copiedId === activeInspectedQuestion.id ? <Icons.Check size={13} className="text-ok" /> : <Icons.Copy size={13} />}
                >
                  {copiedId === activeInspectedQuestion.id ? 'Resposta Copiada' : 'Copiar Resposta'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  block
                  onClick={() => setEditingId(activeInspectedQuestion.id)}
                  icon={<Icons.Edit size={13} />}
                >
                  Editar Texto Deste Item
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
