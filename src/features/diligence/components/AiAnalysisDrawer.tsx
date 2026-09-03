// ==========================================================
// DILIGÊNCIA 360 — Leitura consolidada do dossiê por IA
// Mostra todos os eixos: o que foi achado, o que a fonte não cobriu
// e a evidência exata que sustenta cada frase.
// ==========================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icons } from '../../../components/ui/Icons';
import { AiAnalysisService, AiLeadsService } from '../services/ai-analysis.service';
import type {
  AiAnalysisResult,
  AiCoverageStatus,
  AiFinding,
  AiLeadsResult,
  AiProviderStatus,
  AiSeverity,
  DiligenceItem,
} from '../types';
import type { StatusVariant } from '../../../types';

interface AiAnalysisDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  diligence: DiligenceItem;
}

const SEVERITY_VARIANT: Record<AiSeverity, StatusVariant> = {
  critico: 'critical',
  alto: 'critical',
  moderado: 'high',
  atencao: 'medium',
  informativo: 'neutral',
  positivo: 'success',
};

const COVERAGE_LABEL: Record<AiCoverageStatus, string> = {
  CONSULTADO_COM_ACHADOS: 'Consultado, com achados',
  CONSULTADO_SEM_ACHADOS: 'Consultado, sem achados',
  PARCIAL: 'Consulta parcial',
  INDISPONIVEL: 'Fonte indisponível',
  NAO_CONSULTADO: 'Não consultado',
};

const COVERAGE_VARIANT: Record<AiCoverageStatus, StatusVariant> = {
  CONSULTADO_COM_ACHADOS: 'high',
  CONSULTADO_SEM_ACHADOS: 'success',
  PARCIAL: 'medium',
  INDISPONIVEL: 'critical',
  NAO_CONSULTADO: 'neutral',
};

const AXIS_LABEL: Record<string, string> = {
  CADASTRO: 'Cadastro',
  SOCIETARIO: 'Quadro societário',
  SANCOES_EMPRESA_CEIS: 'Sanções — CEIS',
  SANCOES_EMPRESA_CNEP: 'Sanções — CNEP',
  SANCOES_PESSOAS: 'Sanções de pessoas',
  PEP: 'Pessoas expostas politicamente',
  JUDICIAL: 'Processos judiciais',
  MIDIA: 'Notícias e mídia',
  DIARIOS_OFICIAIS: 'Diários oficiais',
  REDE_SOCIETARIA: 'Rede societária',
  OFFSHORE: 'Offshore',
  BASE_INTERNA_SUAPE: 'Base interna SUAPE',
  SCORE_INTERNO: 'Metodologia interna',
};

function axisLabel(axis: string) {
  return AXIS_LABEL[axis] || axis;
}

function formatDateTime(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('pt-BR');
}

const FindingCard: React.FC<{ finding: AiFinding }> = ({ finding }) => (
  <article className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface p-3.5">
    <header className="flex min-w-0 flex-wrap items-center gap-2">
      <Badge variant={SEVERITY_VARIANT[finding.severidade] || 'neutral'} size="sm">
        {finding.emoji} {finding.severidadeRotulo}
      </Badge>
      <span className="shrink-0 rounded-chip bg-brand-soft px-2 py-0.5 text-2xs font-bold uppercase tracking-wide text-brand">{axisLabel(finding.eixo)}</span>
    </header>
    <h4 className="min-w-0 flex-1 text-sm font-bold leading-snug text-ink">{finding.titulo}</h4>
    <p className="text-sm leading-relaxed text-ink-2">{finding.analise}</p>
    {finding.recomendacao ? (
      <p className="text-sm leading-relaxed text-ink-2">
        <strong>Encaminhamento sugerido:</strong> {finding.recomendacao}
      </p>
    ) : null}
    <ul className="flex min-w-0 flex-col gap-2 [&>li]:flex [&>li]:min-w-0 [&>li]:flex-wrap [&>li]:items-baseline [&>li]:gap-x-2 [&>li]:gap-y-0.5 [&>li]:text-sm [&>li]:text-ink-2 [&_a]:font-semibold [&_a]:text-brand [&_a]:hover:underline">
      {finding.evidencias.map((evidence) => (
        <li key={evidence.id}>
          <span className="shrink-0 rounded-sm bg-surface-active px-1.5 font-mono text-2xs font-semibold text-ink-2">{evidence.id}</span>
          {evidence.url ? (
            <a href={evidence.url} target="_blank" rel="noopener noreferrer">
              {evidence.titulo}
              <Icons.ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : (
            <span>{evidence.titulo}</span>
          )}
          <span className="text-xs text-ink-3">
            {evidence.fonte}
            {evidence.data ? ` · ${evidence.data}` : ''}
          </span>
        </li>
      ))}
    </ul>
  </article>
);

const ProviderList: React.FC<{ providers: AiProviderStatus[] }> = ({ providers }) => (
  <ul className="flex min-w-0 flex-col gap-1.5 [&>li]:min-w-0 [&>li]:text-sm [&>li]:text-ink-2 [&_em]:not-italic [&_em]:text-xs [&_em]:text-ink-3">
    {providers.map((provider) => (
      <li key={provider.id}>
        <Badge variant={provider.configured ? 'success' : 'neutral'} size="sm">
          {provider.configured ? 'pronto' : 'sem chave'}
        </Badge>
        <span>
          {provider.label} — <code>{provider.model}</code>
        </span>
        {provider.message ? <em>{provider.message}</em> : null}
      </li>
    ))}
  </ul>
);

export const AiAnalysisDrawer: React.FC<AiAnalysisDrawerProps> = ({ isOpen, onClose, diligence }) => {
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [providers, setProviders] = useState<AiProviderStatus[]>([]);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<AiLeadsResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || isConfigured !== null) return;
    let active = true;
    AiAnalysisService.getStatus().then((status) => {
      if (!active) return;
      setIsConfigured(status.configurada);
      setProviders(status.provedores || []);
    });
    return () => {
      active = false;
    };
  }, [isConfigured, isOpen]);

  // Uma diligência nova invalida a leitura anterior.
  useEffect(() => {
    setAnalysis(null);
    setError(null);
    setLeads(null);
    setLeadsError(null);
  }, [diligence.id]);

  const runAnalysis = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    const result = await AiAnalysisService.analyze(diligence);
    setIsRunning(false);
    if (!result.ok) {
      setError(result.erro || 'Não foi possível gerar a análise.');
      if (result.provedores) setProviders(result.provedores);
      return;
    }
    setAnalysis(result);
  }, [diligence]);

  const runLeadSearch = useCallback(async () => {
    setIsSearching(true);
    setLeadsError(null);
    const resultado = await AiLeadsService.investigate({
      empresa: {
        razaoSocial: diligence.razaoSocial,
        nomeFantasia: diligence.nomeFantasia,
        cnpj: diligence.cnpj,
        atividade: diligence.empresa?.cnae_fiscal_descricao,
        municipio: diligence.empresa?.municipio,
        uf: diligence.empresa?.uf,
        naturezaJuridica: diligence.empresa?.natureza_juridica,
      },
      socios: Array.isArray(diligence.socios) ? diligence.socios : [],
      cobertura: (analysis?.cobertura || []).map((item) => ({ eixo: item.eixo, status: item.status })),
    });
    setIsSearching(false);
    if (!resultado.ok) {
      setLeadsError(resultado.erro || 'Não foi possível concluir a busca assistida.');
      return;
    }
    setLeads(resultado);
  }, [analysis?.cobertura, diligence]);

  const coverage = useMemo(() => analysis?.cobertura || [], [analysis?.cobertura]);
  const missingCoverage = useMemo(
    () => coverage.filter((item) => item.status !== 'CONSULTADO_COM_ACHADOS' && item.status !== 'CONSULTADO_SEM_ACHADOS'),
    [coverage],
  );

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Leitura consolidada por IA"
      subtitle="A IA lê apenas as evidências já coletadas pelas fontes oficiais. Ela não pesquisa e não cria fatos."
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fechar
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Icons.Sparkles size={16} />}
            isLoading={isRunning}
            loadingLabel="Lendo o dossiê..."
            disabled={isConfigured === false}
            onClick={runAnalysis}
          >
            {analysis ? 'Gerar novamente' : 'Gerar análise'}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-5">
        {isConfigured === false ? (
          <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm text-warn-text [&>p]:leading-relaxed [&>strong]:font-bold [&_code]:rounded-sm [&_code]:bg-surface/60 [&_code]:px-1.5 [&_code]:font-mono [&_code]:text-xs">
            <strong>Nenhum provedor de IA gratuito configurado.</strong>
            <p>
              Preencha ao menos uma das chaves no arquivo <code>.env</code>: <code>GROQ_API_KEY</code>,{' '}
              <code>GEMINI_API_KEY</code> ou <code>GITHUB_MODELS_TOKEN</code>. Todas operam em cota gratuita e não exigem
              cartão de crédito.
            </p>
            {providers.length > 0 ? <ProviderList providers={providers} /> : null}
          </div>
        ) : null}

        {error ? (
          <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-high-line bg-high-bg px-3.5 py-2.5 text-sm text-high-text [&>p]:leading-relaxed [&>strong]:font-bold [&_code]:rounded-sm [&_code]:bg-surface/60 [&_code]:px-1.5 [&_code]:font-mono [&_code]:text-xs">
            <strong>Não foi possível concluir.</strong>
            <p>{error}</p>
          </div>
        ) : null}

        {!analysis && !isRunning && isConfigured !== false && !error ? (
          <EmptyState
            icon={<Icons.Sparkles size={28} />}
            title="Nenhuma leitura gerada ainda"
            description="A análise percorre todos os eixos do dossiê — cadastro, sócios, sanções, processos, notícias, diários oficiais, rede societária e base interna — e cita a evidência de cada afirmação."
          />
        ) : null}

        {analysis ? (
          <>
            <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
              <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                <h3>Resumo executivo</h3>
                <span className="text-xs text-ink-3">
                  {analysis.provedor} · {analysis.modelo}
                  {formatDateTime(analysis.geradoEm) ? ` · ${formatDateTime(analysis.geradoEm)}` : ''}
                </span>
              </header>
              <p className="text-sm leading-relaxed text-ink-2">{analysis.resumoExecutivo || 'O modelo não devolveu resumo.'}</p>
              {analysis.leituraDeExposicao ? (
                <p className="text-sm leading-relaxed text-ink-2">{analysis.leituraDeExposicao}</p>
              ) : null}
            </section>

            <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
              <h3>Achados por severidade ({analysis.achados?.length || 0})</h3>
              {analysis.achados && analysis.achados.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-3">
                  {analysis.achados.map((finding, index) => (
                    <FindingCard key={`${finding.titulo}-${index}`} finding={finding} />
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-ink-2">
                  Nenhum achado sobreviveu à checagem de evidências. Isso não significa ausência de risco: significa que o
                  modelo não sustentou nenhuma afirmação nas evidências disponíveis.
                </p>
              )}
              {analysis.achadosDescartados && analysis.achadosDescartados.length > 0 ? (
                <details className="overflow-hidden rounded-lg border border-line bg-surface [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:px-3.5 [&>summary]:py-2.5 [&>summary]:text-sm [&>summary]:font-semibold [&>summary]:text-ink-2 [&>summary:hover]:bg-surface-hover">
                  <summary>
                    {analysis.achadosDescartados.length} afirmação(ões) descartada(s) por falta de evidência
                  </summary>
                  <ul>
                    {analysis.achadosDescartados.map((item, index) => (
                      <li key={`${item.titulo}-${index}`}>
                        <strong>{item.titulo}</strong> — {item.motivo}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>

            <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
              <h3>Cobertura das fontes ({coverage.length})</h3>
              <p className="text-xs leading-relaxed text-ink-3">
                Ausência de achado não é atestado de idoneidade. Esta tabela mostra o que cada fonte respondeu.
              </p>
              <ul className="flex min-w-0 flex-col gap-2 [&>li]:min-w-0 [&>li]:border-b [&>li]:border-line-soft [&>li]:pb-2 [&>li]:text-sm [&>li]:text-ink-2 [&>li>strong]:block [&>li>strong]:font-bold [&>li>strong]:text-ink [&>li>p]:text-xs [&>li>p]:leading-relaxed [&>li>p]:text-ink-3">
                {coverage.map((item) => (
                  <li key={`${item.eixo}-${item.status}`}>
                    <Badge variant={COVERAGE_VARIANT[item.status] || 'neutral'} size="sm">
                      {COVERAGE_LABEL[item.status] || item.status}
                    </Badge>
                    <div>
                      <strong>{axisLabel(item.eixo)}</strong>
                      {item.detalhe ? <p>{item.detalhe}</p> : null}
                      {item.fonte ? <span className="text-xs text-ink-3">{item.fonte}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {analysis.lacunas && analysis.lacunas.length > 0 ? (
              <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
                <h3>Lacunas apontadas</h3>
                <ul className="flex min-w-0 list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-2">
                  {analysis.lacunas.map((item, index) => (
                    <li key={`lacuna-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {analysis.perguntasAoFornecedor && analysis.perguntasAoFornecedor.length > 0 ? (
              <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
                <h3>Perguntas sugeridas ao fornecedor</h3>
                <ul className="flex min-w-0 list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-2">
                  {analysis.perguntasAoFornecedor.map((item, index) => (
                    <li key={`pergunta-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
              <details className="overflow-hidden rounded-lg border border-line bg-surface [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:px-3.5 [&>summary]:py-2.5 [&>summary]:text-sm [&>summary]:font-semibold [&>summary]:text-ink-2 [&>summary:hover]:bg-surface-hover">
                <summary>Evidências enviadas ao modelo ({analysis.evidencias?.length || 0})</summary>
                <ul className="flex min-w-0 flex-col gap-2 [&>li]:min-w-0 [&>li]:border-b [&>li]:border-line-soft [&>li]:pb-2 [&>li]:text-sm [&>li]:text-ink-2 [&>li>strong]:block [&>li>strong]:font-bold [&>li>strong]:text-ink [&>li>p]:text-xs [&>li>p]:leading-relaxed [&>li>p]:text-ink-3 [&_a]:font-semibold [&_a]:text-brand [&_a]:hover:underline">
                  {(analysis.evidencias || []).map((evidence) => (
                    <li key={evidence.id}>
                      <span className="shrink-0 rounded-sm bg-surface-active px-1.5 font-mono text-2xs font-semibold text-ink-2">{evidence.id}</span>
                      <div>
                        <strong>{evidence.titulo}</strong>
                        {evidence.detalhe ? <p>{evidence.detalhe}</p> : null}
                        <span className="text-xs text-ink-3">
                          {axisLabel(evidence.eixo)} · {evidence.fonte}
                          {evidence.data ? ` · ${evidence.data}` : ''}
                        </span>
                        {evidence.url ? (
                          <a href={evidence.url} target="_blank" rel="noopener noreferrer">
                            Abrir fonte
                            <Icons.ExternalLink size={12} aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            </section>

            <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
              <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                <h3>Busca assistida por IA</h3>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Icons.Search size={14} />}
                  isLoading={isSearching}
                  loadingLabel="Pesquisando..."
                  onClick={runLeadSearch}
                >
                  {leads ? 'Pesquisar de novo' : 'Procurar mais'}
                </Button>
              </header>
              <p className="text-xs leading-relaxed text-ink-3">
                Use quando as fontes acima terminarem sem achado. O modelo não responde o que existe sobre a empresa — ele
                propõe <strong>onde procurar</strong>, e os buscadores reais executam. Consulta que não cite a empresa, o
                CNPJ ou um sócio é rejeitada antes de rodar, para não trazer homônimo.
              </p>

              {leadsError ? (
                <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-high-line bg-high-bg px-3.5 py-2.5 text-sm text-high-text [&>p]:leading-relaxed [&>strong]:font-bold [&_code]:rounded-sm [&_code]:bg-surface/60 [&_code]:px-1.5 [&_code]:font-mono [&_code]:text-xs">
                  <p>{leadsError}</p>
                </div>
              ) : null}

              {leads ? (
                <>
                  <p className="text-xs leading-relaxed text-ink-3">
                    {leads.consultasExecutadas?.length || 0} consulta(s) executada(s) ·{' '}
                    {leads.resultados?.length || 0} página(s) encontrada(s)
                    {leads.consultasDescartadas && leads.consultasDescartadas.length > 0
                      ? ` · ${leads.consultasDescartadas.length} rejeitada(s) por falta de âncora`
                      : ''}
                  </p>

                  {leads.resultados && leads.resultados.length > 0 ? (
                    <ul className="flex min-w-0 flex-col gap-2 [&>li]:min-w-0 [&>li]:border-b [&>li]:border-line-soft [&>li]:pb-2 [&>li]:text-sm [&>li]:text-ink-2 [&>li>strong]:block [&>li>strong]:font-bold [&>li>strong]:text-ink [&>li>p]:text-xs [&>li>p]:leading-relaxed [&>li>p]:text-ink-3 [&_a]:font-semibold [&_a]:text-brand [&_a]:hover:underline">
                      {leads.resultados.map((item) => (
                        <li key={item.url}>
                          <div>
                            <strong>{item.title}</strong>
                            {item.snippet ? <p>{item.snippet}</p> : null}
                            <span className="text-xs text-ink-3">
                              {item.domain}
                              {item.publishedAt ? ` · ${item.publishedAt}` : ''} · veio de: {item.origemConsulta}
                            </span>
                            <a href={item.url} target="_blank" rel="noopener noreferrer">
                              Abrir fonte
                              <Icons.ExternalLink size={12} aria-hidden="true" />
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-relaxed text-ink-2">
                      As consultas sugeridas rodaram e não retornaram página nova. Isso é um resultado, não uma falha.
                    </p>
                  )}

                  <details className="overflow-hidden rounded-lg border border-line bg-surface [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:px-3.5 [&>summary]:py-2.5 [&>summary]:text-sm [&>summary]:font-semibold [&>summary]:text-ink-2 [&>summary:hover]:bg-surface-hover">
                    <summary>Consultas executadas ({leads.consultasExecutadas?.length || 0})</summary>
                    <ul>
                      {(leads.consultasExecutadas || []).map((item, index) => (
                        <li key={`${item.termo}-${index}`}>
                          <code>{item.termo}</code> — {item.ok === false ? `falhou: ${item.erro}` : `${item.resultCount ?? 0} resultado(s)`}
                          {item.motivo ? <div className="text-xs text-ink-3">{item.motivo}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </details>

                  {leads.hipoteses && leads.hipoteses.length > 0 ? (
                    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm text-warn-text [&>p]:leading-relaxed [&>strong]:font-bold [&_code]:rounded-sm [&_code]:bg-surface/60 [&_code]:px-1.5 [&_code]:font-mono [&_code]:text-xs">
                      <strong>⚠️ Quarentena: {leads.hipoteses.length} hipótese(s) sem nenhuma fonte</strong>
                      <p>
                        O que segue é <strong>lembrança do modelo</strong>, não registro público. Nenhuma busca confirmou.
                        Não vale como evidência, não entra no cálculo de risco e não pode ir para relatório enviado a
                        terceiros sem verificação humana. Trate cada linha como pista a investigar, nunca como fato.
                      </p>
                      <ul className="flex min-w-0 list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-2">
                        {leads.hipoteses.map((item, index) => (
                          <li key={`hipotese-${index}`}>
                            <Badge variant="neutral" size="sm">
                              confiança {item.confianca}
                            </Badge>{' '}
                            {item.afirmacao}
                            {item.comoVerificar ? (
                              <div className="text-xs text-ink-3">Verificar em: {item.comoVerificar}</div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-ink-3">
                      O modelo não declarou nenhuma hipótese sobre esta empresa — resposta honesta e preferível a
                      inventar registro.
                    </p>
                  )}
                </>
              ) : null}
            </section>

            <p className="border-t border-line-soft pt-3 text-2xs leading-relaxed text-ink-3">
              {analysis.aviso}
              {missingCoverage.length > 0
                ? ` Eixos sem cobertura completa: ${missingCoverage.map((item) => axisLabel(item.eixo)).join(', ')}.`
                : ''}
            </p>
          </>
        ) : null}
      </div>
    </Drawer>
  );
};
