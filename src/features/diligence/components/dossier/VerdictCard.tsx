// ==========================================================
// DILIGÊNCIA 360 — Cartão de resposta do dossiê
// ==========================================================
// O veredito é a decisão da metodologia de risco que já existe no backend
// (risk-assessment.service.js). Nenhuma linguagem de compliance é inventada
// aqui: o texto vem de `risco.decisao` e `risco.decisaoDesc`.
//
// "O que pesa contra" reúne os achados mais graves e as fontes que não
// responderam. Cobertura incompleta entra na decisão, e não como nota de
// rodapé técnica: decidir sem ter consultado tudo é diferente de decidir
// tendo consultado.
// ==========================================================

import React from 'react';
import type { DiligenceItem } from '../../types';
import type { DossierFinding } from './dossierFindings';
import type { SourceCoverageItem } from './sourceCoverage';

interface VerdictCardProps {
  diligence: DiligenceItem;
  findings: DossierFinding[];
  coverage: SourceCoverageItem[];
}

interface Blocker {
  id: string;
  tone: 'high' | 'medium';
  title: string;
  detail: string;
}

const WEIGHTED: DossierFinding['severity'][] = ['critico', 'alto', 'moderado'];

function buildBlockers(findings: DossierFinding[], coverage: SourceCoverageItem[]): Blocker[] {
  const fromFindings: Blocker[] = findings
    .filter((finding) => WEIGHTED.includes(finding.severity))
    .slice(0, 3)
    .map((finding) => ({
      id: finding.id,
      tone: finding.severity === 'moderado' ? 'medium' : 'high',
      title: finding.title,
      detail: finding.description,
    }));

  const failed = coverage.filter((item) => item.status === 'falhou');
  if (failed.length > 0) {
    fromFindings.push({
      id: 'cobertura',
      tone: 'medium',
      title: failed.length === 1
        ? `${failed[0].label} não respondeu`
        : `${failed.length} fontes não responderam`,
      detail: 'A cobertura desta consulta está incompleta. Ausência de achado nessas fontes não pode ser lida como ausência de ocorrência.',
    });
  }

  return fromFindings;
}

export const VerdictCard: React.FC<VerdictCardProps> = ({ diligence, findings, coverage }) => {
  const risco = diligence.risco;
  const blockers = buildBlockers(findings, coverage);
  const tone = risco?.cor || 'neutral';

  return (
    <section className={`dossier-card dossier-verdict span-all tone-${tone}`}>
      <div className="dossier-verdict-top">
        <div className="dossier-verdict-mark" aria-hidden="true">{risco?.emoji || '•'}</div>
        <div className="dossier-verdict-copy">
          <span className="dossier-eyebrow">Resposta</span>
          <h2>{risco?.decisao || 'Classificação não calculada'}</h2>
          <p>{risco?.decisaoDesc}</p>
        </div>
      </div>

      {blockers.length > 0 ? (
        <div className="dossier-blockers">
          <span className="dossier-eyebrow">O que pesa contra</span>
          {blockers.map((blocker) => (
            <div key={blocker.id} className={`dossier-blocker tone-${blocker.tone}`}>
              <i aria-hidden="true" />
              <div>
                <strong>{blocker.title}</strong>
                <span>{blocker.detail}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="dossier-blockers">
          <span className="dossier-eyebrow">O que pesa contra</span>
          <p className="dossier-blocker-empty">
            Nenhuma ocorrência relevante nas fontes que responderam.
          </p>
        </div>
      )}
    </section>
  );
};
