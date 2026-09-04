// ==========================================================
// DILIGÊNCIA 360 — Card
// ==========================================================
// Mesma assinatura de antes, agora desenhada pela Section. Existia
// um `.card` no CSS e um cartão à mão no dossiê, com raio e respiro
// diferentes; este arquivo passa a ser um apelido, para que as telas
// que já chamavam `Card` não precisem mudar de uma vez.
//
// Em código novo prefira `Section`: ela tem selo de situação,
// rodapé e a variante recolhível.
// ==========================================================

import React from 'react';
import { ControlSize } from './controlSize';
import { Section } from './Section';

interface CardProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  /** Aceito por compatibilidade; o respiro agora é o da Section. */
  size?: ControlSize;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export const Card: React.FC<CardProps> = ({
  title,
  icon,
  action,
  children,
  className = '',
  bodyClassName = '',
}) => (
  <Section mark={icon} title={title} trailing={action} className={className} bodyClassName={bodyClassName}>
    {children}
  </Section>
);
