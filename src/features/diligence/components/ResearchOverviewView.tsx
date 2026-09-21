import React, { useMemo } from 'react';
import type { DiligenceItem } from '../types';
import { deriveDossierFindings } from './dossier/dossierFindings';
import { deriveSourceCoverage } from './dossier/sourceCoverage';
import { deriveRiskBreakdown } from './dossier/riskBreakdown';
import { Icons } from '../../../components/ui/Icons';

interface ResearchOverviewViewProps {
  diligence: DiligenceItem;
  onOpenDossier: () => void;
  onOpenNetwork: () => void;
  onOpenReputation: () => void;
  onOpenSuape: () => void;
}

export const ResearchOverviewView: React.FC<ResearchOverviewViewProps> = ({
  diligence, onOpenDossier, onOpenNetwork, onOpenReputation, onOpenSuape,
}) => {
  const findings = useMemo(() => deriveDossierFindings(diligence), [diligence]);
  const coverage = useMemo(() => deriveSourceCoverage(diligence), [diligence]);
  const priorityFindings = findings.filter((finding) => ['critico', 'alto', 'moderado', 'atencao'].includes(finding.severity));
  const priority = priorityFindings.length > 0 ? priorityFindings.slice(0, 3) : deriveRiskBreakdown(diligence.risco).needsReview
    .filter((detail) => detail.pontos > 0)
    .slice(0, 3)
    .map((detail, index) => ({ id: `risk-${index}`, severity: 'atencao' as const, source: 'Índice de atenção', title: detail.criterio, description: detail.info }));
  const responded = coverage.filter((source) => source.status === 'com-achado' || source.status === 'sem-achado').length;
  const missing = coverage.filter((source) => source.status === 'falhou').length;
  const score = Math.max(0, Math.min(100, Number(diligence.risco?.score) || 0));
  const shareholders = diligence.socios?.length || 0;
  const companies = diligence.corporateNetwork?.companies?.length || 0;
  const entities = Math.max(companies, diligence.egos?.metrics?.entities || 0);

  return (
    <main className="command-overview">
      <div className="command-overview-inner">
        <header className="command-hero">
          <div className="command-hero-copy">
            <p className="command-eyebrow"><span /> PESQUISA PÚBLICA / VISÃO GERAL</p>
            <h1>{diligence.razaoSocial}</h1>
            <div className="command-hero-meta"><span>{diligence.cnpjFmt}</span><span>{diligence.empresa?.descricao_situacao_cadastral || 'Situação não informada'}</span><span>{diligence.empresa?.municipio ? `${diligence.empresa.municipio}/${diligence.empresa.uf}` : 'Localidade não informada'}</span></div>
            <p>Uma leitura inicial das fontes consultadas. Abra cada área para examinar os registros e validar os vínculos.</p>
            <button type="button" onClick={onOpenDossier}>Explorar dossiê completo <Icons.ArrowRight size={17} /></button>
          </div>
          <div className="command-score" style={{ '--score-angle': `${score * 3.6}deg` } as React.CSSProperties}>
            <div className="command-score-ring"><strong>{score}</strong><span>DE 100</span></div>
            <p>ÍNDICE DE ATENÇÃO</p>
            <small>{diligence.risco?.nivel || 'Não calculado'}</small>
          </div>
        </header>

        <div className="command-metrics" aria-label="Resumo da pesquisa">
          <div><span>QUADRO SOCIETÁRIO</span><strong>{shareholders}</strong><small>{shareholders === 1 ? 'integrante identificado' : 'integrantes identificados'}</small></div>
          <div><span>REDE ANALISADA</span><strong>{entities}</strong><small>{companies > 0 ? `${companies} empresa(s) relacionadas` : entities === 1 ? 'entidade no mapa' : 'entidades no mapa'}</small></div>
          <div><span>COBERTURA</span><strong>{responded}<i>/{coverage.length}</i></strong><small>fontes responderam{missing > 0 ? ` · ${missing} sem resposta` : ''}</small></div>
        </div>

        <div className="command-columns">
          <section className="command-priority">
            <div className="command-section-heading"><div><p>O QUE MERECE ATENÇÃO</p><h2>Leitura prioritária</h2></div><button type="button" onClick={onOpenDossier}>Ver todos <Icons.ArrowRight size={15} /></button></div>
            {priority.length > 0 ? (
              <ul>{priority.map((finding) => <li key={finding.id}><span className={`command-severity command-severity-${finding.severity}`} /><div><small>{finding.source}</small><strong>{finding.title}</strong><p>{finding.description}</p></div></li>)}</ul>
            ) : (
              <div className="command-empty"><Icons.ShieldCheck size={28} /><strong>Nenhum ponto prioritário nesta consulta.</strong><span>Revise o dossiê e a cobertura antes de concluir.</span></div>
            )}
          </section>

          <section className="command-next">
            <div className="command-section-heading"><div><p>ESCOLHA O PRÓXIMO PASSO</p><h2>Explore a investigação</h2></div></div>
            <div className="command-actions">
              <button type="button" onClick={onOpenNetwork}><span><Icons.Network size={20} /></span><strong>Mapa de vínculos</strong><small>Veja as relações em contexto</small><Icons.ArrowRight size={16} /></button>
              <button type="button" onClick={onOpenReputation}><span><Icons.Globe size={20} /></span><strong>Reputação</strong><small>Investigue notícias e documentos</small><Icons.ArrowRight size={16} /></button>
              <button type="button" onClick={onOpenSuape}><span><Icons.FileSpreadsheet size={20} /></span><strong>Avaliação SUAPE</strong><small>Anexe o questionário do terceiro</small><Icons.ArrowRight size={16} /></button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};
