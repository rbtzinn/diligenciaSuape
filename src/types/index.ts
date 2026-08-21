// ==========================================================
// DILIGÊNCIA 360 — Tipos Globais
// ==========================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type StatusVariant = 'low' | 'medium' | 'high' | 'critical' | 'info' | 'neutral' | 'success' | 'primary';

export type StepStatus = 'pending' | 'loading' | 'done' | 'error';

export type ViewType = 'chat' | 'history' | 'sources' | 'dashboard' | 'users';

export interface BaseApiResponse<T = unknown> {
  ok: boolean;
  fonte?: string;
  consultadoEm?: string;
  erro?: string;
  data?: T;
}
