// ==========================================================
// DILIGÊNCIA 360 — Tipos da análise consolidada por IA
// ==========================================================

export type AiSeverity = 'critico' | 'alto' | 'moderado' | 'atencao' | 'informativo' | 'positivo';

export type AiCoverageStatus =
  | 'CONSULTADO_COM_ACHADOS'
  | 'CONSULTADO_SEM_ACHADOS'
  | 'PARCIAL'
  | 'INDISPONIVEL'
  | 'NAO_CONSULTADO';

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
