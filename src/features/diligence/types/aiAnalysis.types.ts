// ==========================================================
// DILIGÊNCIA 360 — Tipos da análise consolidada por IA
// ==========================================================

export type AiSeverity = 'critico' | 'alto' | 'moderado' | 'atencao' | 'informativo' | 'positivo';

export type AiCoverageStatus =
  | 'CONSULTADO_COM_ACHADOS'
  | 'CONSULTADO_SEM_ACHADOS'
  | 'PARCIAL'
  | 'INDISPONIVEL'
  | 'NAO_CONSULTADO'
  | 'EXIGE_REVISAO_MANUAL';

export interface AiEvidence {
  id: string;
  eixo: string;
  titulo: string;
  detalhe?: string;
  fonte: string;
  url?: string | null;
  data?: string | null;
}

export interface AiFindingEvidence {
  id: string;
  titulo: string;
  fonte: string;
  url?: string | null;
  data?: string | null;
}

export interface AiFinding {
  severidade: AiSeverity;
  severidadeRotulo: string;
  emoji: string;
  eixo: string;
  titulo: string;
  analise: string;
  recomendacao?: string | null;
  evidencias: AiFindingEvidence[];
}

export interface AiCoverageItem {
  eixo: string;
  status: AiCoverageStatus;
  detalhe?: string;
  fonte?: string | null;
}

export interface AiProviderStatus {
  id: string;
  label: string;
  model: string;
  configured: boolean;
  blockedByCostGuard?: boolean;
  message?: string;
}

export interface AiAnalysisResult {
  ok: boolean;
  status?: number;
  erro?: string;
  versao?: string;
  provedor?: string;
  provedorId?: string;
  modelo?: string;
  geradoEm?: string;
  resumoExecutivo?: string;
  leituraDeExposicao?: string;
  achados?: AiFinding[];
  achadosDescartados?: Array<{ titulo: string; motivo: string }>;
  lacunas?: string[];
  perguntasAoFornecedor?: string[];
  cobertura?: AiCoverageItem[];
  evidencias?: AiEvidence[];
  evidenciasTruncadas?: boolean;
  aviso?: string;
  provedores?: AiProviderStatus[];
}

// ----------------------------------------------------------
// Busca assistida por IA: o modelo propõe consultas, os buscadores
// reais executam. As hipóteses voltam em quarentena, sem fonte.
// ----------------------------------------------------------

export interface AiLeadQuery {
  termo: string;
  canal: 'web' | 'news';
  alvo: 'empresa' | 'pessoa';
  motivo?: string | null;
  ok?: boolean;
  resultCount?: number;
  erro?: string;
  partial?: boolean;
  attempts?: Array<{ provider: string; ok: boolean; status?: number; erro?: string; skipped?: boolean }>;
}

export interface AiLeadResult {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  publishedAt?: string | null;
  origemConsulta: string;
  motivoDaConsulta?: string | null;
  providerSources?: string[];
}

export interface AiHypothesis {
  afirmacao: string;
  tipo: string;
  confianca: 'alta' | 'media' | 'baixa';
  comoVerificar?: string | null;
  status: 'NAO_CONFIRMADA';
}

export interface AiLeadsResult {
  ok: boolean;
  erro?: string;
  versao?: string;
  geradoEm?: string;
  provedor?: string;
  modelo?: string;
  consultas?: AiLeadQuery[];
  consultasDescartadas?: Array<{ termo: string; motivo: string }>;
  consultasExecutadas?: AiLeadQuery[];
  resultados?: AiLeadResult[];
  hipoteses?: AiHypothesis[];
  aviso?: string;
  partial?: boolean;
}
