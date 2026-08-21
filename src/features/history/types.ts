// ==========================================================
// DILIGÊNCIA 360 — Tipos do Histórico
// ==========================================================

import { DiligenceItem } from '../diligence/types';

export type HistoryItem = DiligenceItem;

export interface HistoryFilter {
  query?: string;
  minScore?: number;
  level?: string;
}
