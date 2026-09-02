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
import { AiAnalysisService } from '../services/ai-analysis.service';
import type {
  AiAnalysisResult,
  AiCoverageStatus,
  AiFinding,
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
  <article className="ai-finding-card">
    <header className="ai-finding-head">
      <Badge variant={SEVERITY_VARIANT[finding.severidade] || 'neutral'} size="sm">
        {finding.emoji} {finding.severidadeRotulo}
      </Badge>
      <span className="ai-finding-axis">{axisLabel(finding.eixo)}</span>
    </header>
    <h4 className="ai-finding-title">{finding.titulo}</h4>
    <p className="ai-finding-body">{finding.analise}</p>
    {finding.recomendacao ? (
      <p className="ai-finding-action">
        <strong>Encaminhamento sugerido:</strong> {finding.recomendacao}
      </p>
    ) : null}
    <ul className="ai-evidence-list">
      {finding.evidencias.map((evidence) => (
        <li key={evidence.id}>
          <span className="ai-evidence-id">{evidence.id}</span>
          {evidence.url ? (
            <a href={evidence.url} target="_blank" rel="noopener noreferrer">
              {evidence.titulo}
              <Icons.ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : (
            <span>{evidence.titulo}</span>
          )}
          <span className="ai-evidence-source">
            {evidence.fonte}
            {evidence.data ? ` · ${evidence.data}` : ''}
          </span>
        </li>
      ))}
    </ul>
  </article>
);

const ProviderList: React.FC<{ providers: AiProviderStatus[] }> = ({ providers }) => (
  <ul className="ai-provider-list">
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
      <div className="ai-analysis-stack">
        {isConfigured === false ? (
          <div className="ai-analysis-notice ai-analysis-notice-warning">
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
          <div className="ai-analysis-notice ai-analysis-notice-error">
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
            <section className="ai-analysis-section">
              <header className="ai-analysis-section-head">
                <h3>Resumo executivo</h3>
                <span className="ai-analysis-meta">
                  {analysis.provedor} · {analysis.modelo}
                  {formatDateTime(analysis.geradoEm) ? ` · ${formatDateTime(analysis.geradoEm)}` : ''}
                </span>
              </header>
              <p className="ai-analysis-paragraph">{analysis.resumoExecutivo || 'O modelo não devolveu resumo.'}</p>
              {analysis.leituraDeExposicao ? (
                <p className="ai-analysis-paragraph">{analysis.leituraDeExposicao}</p>
              ) : null}
            </section>

            <section className="ai-analysis-section">
              <h3>Achados por severidade ({analysis.achados?.length || 0})</h3>
              {analysis.achados && analysis.achados.length > 0 ? (
                <div className="ai-finding-stack">
                  {analysis.achados.map((finding, index) => (
                    <FindingCard key={`${finding.titulo}-${index}`} finding={finding} />
                  ))}
                </div>
              ) : (
                <p className="ai-analysis-paragraph">
                  Nenhum achado sobreviveu à checagem de evidências. Isso não significa ausência de risco: significa que o
                  modelo não sustentou nenhuma afirmação nas evidências disponíveis.
                </p>
              )}
              {analysis.achadosDescartados && analysis.achadosDescartados.length > 0 ? (
                <details className="ai-analysis-details">
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

            <section className="ai-analysis-section">
              <h3>Cobertura das fontes ({coverage.length})</h3>
              <p className="ai-analysis-hint">
                Ausência de achado não é atestado de idoneidade. Esta tabela mostra o que cada fonte respondeu.
              </p>
              <ul className="ai-coverage-list">
                {coverage.map((item) => (
                  <li key={`${item.eixo}-${item.status}`}>
                    <Badge variant={COVERAGE_VARIANT[item.status] || 'neutral'} size="sm">
                      {COVERAGE_LABEL[item.status] || item.status}
                    </Badge>
                    <div>
                      <strong>{axisLabel(item.eixo)}</strong>
                      {item.detalhe ? <p>{item.detalhe}</p> : null}
                      {item.fonte ? <span className="ai-evidence-source">{item.fonte}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {analysis.lacunas && analysis.lacunas.length > 0 ? (
              <section className="ai-analysis-section">
                <h3>Lacunas apontadas</h3>
                <ul className="ai-analysis-bullets">
                  {analysis.lacunas.map((item, index) => (
                    <li key={`lacuna-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {analysis.perguntasAoFornecedor && analysis.perguntasAoFornecedor.length > 0 ? (
              <section className="ai-analysis-section">
                <h3>Perguntas sugeridas ao fornecedor</h3>
                <ul className="ai-analysis-bullets">
                  {analysis.perguntasAoFornecedor.map((item, index) => (
                    <li key={`pergunta-${index}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="ai-analysis-section">
              <details className="ai-analysis-details">
                <summary>Evidências enviadas ao modelo ({analysis.evidencias?.length || 0})</summary>
                <ul className="ai-evidence-full-list">
                  {(analysis.evidencias || []).map((evidence) => (
                    <li key={evidence.id}>
                      <span className="ai-evidence-id">{evidence.id}</span>
                      <div>
                        <strong>{evidence.titulo}</strong>
                        {evidence.detalhe ? <p>{evidence.detalhe}</p> : null}
                        <span className="ai-evidence-source">
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

            <p className="ai-analysis-disclaimer">
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
