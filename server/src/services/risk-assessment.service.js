// ==========================================================
// DILIGÊNCIA 360 — Classificação e sobreposição EGOS de risco
// Risco mede exposição/necessidade de análise, nunca culpabilidade.
// ==========================================================

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

const RISK_RANGES = Object.freeze({
  'Atenção Baixa': [0, 14],
  'Atenção Moderada': [15, 34],
  'Atenção Elevada': [35, 59],
  'Atenção Crítica': [60, 100],
});

function isScoreWithinLevel(level, scoreValue) {
  const range = RISK_RANGES[level];
  const score = Number(scoreValue);
  return Boolean(range) && Number.isFinite(score) && score >= range[0] && score <= range[1];
}

function classifyRisk(scoreValue) {
  const score = clampScore(scoreValue);
  if (score <= 14) {
    return {
      score,
      nivel: 'Atenção Baixa',
      cor: 'low',
      emoji: '🟢',
      decisao: 'Prosseguir com Monitoramento Ordinário',
      decisaoDesc: 'A exposição identificada é baixa, considerando também as limitações declaradas das fontes consultadas.',
    };
  }
  if (score <= 34) {
    return {
      score,
      nivel: 'Atenção Moderada',
      cor: 'medium',
      emoji: '🟡',
      decisao: 'Realizar Análise Complementar',
      decisaoDesc: 'Há sinais, hipóteses ou lacunas que aumentam a exposição e precisam ser documentados antes da decisão.',
    };
  }
  if (score <= 59) {
    return {
      score,
      nivel: 'Atenção Elevada',
      cor: 'high',
      emoji: '🟠',
      decisao: 'Aprofundar a Diligência',
      decisaoDesc: 'A combinação de vínculos, ocorrências ou incertezas representa exposição relevante para o Compliance.',
    };
  }
  return {
    score,
    nivel: 'Atenção Crítica',
    cor: 'critical',
    emoji: '🔴',
    decisao: 'Submeter ao Comitê de Riscos',
    decisaoDesc: 'A exposição acumulada exige decisão formal, medidas de mitigação e validação humana antes de avançar.',
  };
}

function decisionForManualLevel(level, score, reason) {
  const base = classifyRisk(score);
  const allowed = new Set(['Atenção Baixa', 'Atenção Moderada', 'Atenção Elevada', 'Atenção Crítica']);
  const nivel = allowed.has(level) ? level : base.nivel;
  const decisions = {
    'Atenção Baixa': ['Prosseguir com Monitoramento Ordinário', 'low', '🟢'],
    'Atenção Moderada': ['Realizar Análise Complementar', 'medium', '🟡'],
    'Atenção Elevada': ['Aprofundar a Diligência', 'high', '🟠'],
    'Atenção Crítica': ['Submeter ao Comitê de Riscos', 'critical', '🔴'],
  };
  const [decisao, cor, emoji] = decisions[nivel];
  return {
    score: clampScore(score),
    nivel,
    cor,
    emoji,
    decisao,
    decisaoDesc: `Classificação final ajustada pelo Compliance. Justificativa: ${reason}`,
  };
}

function applyEgosOverlay(baseRisk, egos) {
  const risk = baseRisk && typeof baseRisk === 'object' ? baseRisk : classifyRisk(0);
  const details = Array.isArray(risk.detalhes) ? [...risk.detalhes] : [];
  const internalFindings = (egos?.findings || []).filter((finding) => {
    const axis = String(finding.axis || '').toUpperCase();
    return (axis.includes('INTERNAL') || axis.includes('SUAPE'))
      && finding.reviewStatus !== 'discarded'
      && (finding.status === 'REVIEW' || finding.status === 'INCONCLUSIVE');
  });

  let adjustment = 0;
  for (const finding of internalFindings) {
    const points = finding.severity === 'HIGH'
      ? 15
      : finding.severity === 'MEDIUM'
        ? 10
        : finding.severity === 'LOW'
          ? 5
          : 2;
    adjustment = Math.min(25, adjustment + points);
  }

  if (adjustment <= 0) {
    return {
      ...risk,
      automaticScore: risk.automaticScore ?? risk.score ?? 0,
      methodologyVersion: risk.methodologyVersion || 'v2.0-exposure',
      detalhes: details,
    };
  }

  details.push({
    criterio: 'Possíveis vínculos com a base interna SUAPE',
    pontos: adjustment,
    info: `${internalFindings.length} hipótese(s) internas exigem validação de identidade, vínculo funcional e eventual conflito de interesses.`,
    categoria: 'PESSOAS_RELACIONADAS',
    natureza: 'uncertainty',
    confianca: 'media',
    requerRevisao: true,
  });

  const automaticScore = clampScore((risk.score || 0) + adjustment);
  return {
    ...classifyRisk(automaticScore),
    automaticScore,
    methodologyVersion: 'v2.0-exposure-egos',
    detalhes: details,
  };
}

module.exports = {
  applyEgosOverlay,
  classifyRisk,
  clampScore,
  decisionForManualLevel,
  isScoreWithinLevel,
};
