// ==========================================================
// DILIGÊNCIA 360 — Badge
// ==========================================================
// Mantém a assinatura antiga (`variant` com os nomes de nível de
// risco do domínio) porque meia dúzia de telas já a chamam assim,
// mas desenha através do Chip. Um selo, uma forma.
// ==========================================================

import React from 'react';
import { StatusVariant } from '../../types';
import { ControlSize, resolveControlSize } from './controlSize';
import { Chip, ChipTone } from './Chip';

interface BadgeProps {
  variant?: StatusVariant;
  size?: ControlSize;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Nível do domínio → tom visual. O domínio fala de risco; o Chip
    fala de cor. A tradução mora aqui, num lugar só. */
const TONE: Record<StatusVariant, ChipTone> = {
  low: 'ok',
  success: 'ok',
  medium: 'warn',
  high: 'high',
  critical: 'critical',
  info: 'info',
  primary: 'brand',
  neutral: 'neutral',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  icon,
  children,
  className = '',
}) => (
  <Chip
    tone={TONE[variant] ?? 'neutral'}
    size={resolveControlSize(size) === 'sm' ? 'sm' : 'md'}
    icon={icon}
    className={className}
  >
    {children}
  </Chip>
);
