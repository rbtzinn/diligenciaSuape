// ==========================================================
// DILIGÊNCIA 360 — Sanções (CEIS e CNEP)
// ==========================================================
// Separação explícita entre sanção vigente e histórico expirado: as
// duas contam zero na tela quando não há nada, e significam coisas
// diferentes quando há.
//
// Saíram `.section-subtitle` e `.clean-state-block` do index.css, e
// o estado limpo passou a ser um aviso do projeto, com a mesma forma
// do aviso de atenção logo ao lado.
// ==========================================================

import React, { useState } from 'react';
import { SanctionsResult } from '../types';
import { Section } from '../../../components/ui/Section';
import { Chip, ChipTone } from '../../../components/ui/Chip';
import { Button } from '../../../components/ui/Button';
import { Note } from '../../../components/ui/Note';
import { Icons } from '../../../components/ui/Icons';
import { SanctionsDrawer } from './SanctionsDrawer';

interface SanctionsSectionProps {
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
}

/** Selo de situação da base. Cobertura ausente nunca é "tudo certo". */
function statusChip(vigentes: number, historicas: number, res?: SanctionsResult) {
  const chip = (tone: ChipTone, label: string) => (
    <Chip tone={tone} size="sm" dot>
      {label}
    </Chip>
  );

  if (!res) return chip('muted', 'Não consultado');
  if (res.semChave) return chip('warn', 'Sem chave de acesso');
  if (!res.ok) return chip('high', 'Indisponível');
  if (vigentes > 0) return chip('critical', `${vigentes} ativo(s)`);
  if (historicas > 0) return chip('neutral', `${historicas} já expirado(s)`);
  return chip('ok', 'Nada encontrado');
}

const SanctionsCard: React.FC<{
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  cleanCopy: string;
  countCopy: React.ReactNode;
  vigentes: number;
  historicas: number;
  result?: SanctionsResult;
  onOpenDetails: () => void;
}> = ({ title, icon, subtitle, cleanCopy, countCopy, vigentes, historicas, result, onOpenDetails }) => {
  const clean = vigentes === 0 && historicas === 0;

  return (
    <Section
      mark={icon}
      title={title}
      subtitle={subtitle}
      trailing={statusChip(vigentes, historicas, result)}
      footer={
        clean ? undefined : (
          <Button variant="outline" size="sm" onClick={onOpenDetails} rightIcon={<Icons.ArrowRight size={14} aria-hidden="true" />}>
            Ver detalhes completos
          </Button>
        )
      }
    >
      {clean ? (
        <Note tone="ok" icon={<Icons.Check size={16} aria-hidden="true" />}>
          {cleanCopy}
        </Note>
      ) : (
        <p className="text-sm leading-relaxed text-ink-2">{countCopy}</p>
      )}
    </Section>
  );
};

export const SanctionsSection: React.FC<SanctionsSectionProps> = ({ ceis, cnep }) => {
  const [selectedDrawer, setSelectedDrawer] = useState<'CEIS' | 'CNEP' | null>(null);

  const ceisVigentes = ceis?.vigentes ?? (ceis?.encontrado ? ceis.quantidade : 0);
  const ceisTotal = ceis?.encontrado ? ceis.quantidade : 0;
  const ceisHistoricas = ceisTotal - ceisVigentes;

  const cnepVigentes = cnep?.vigentes ?? (cnep?.encontrado ? cnep.quantidade : 0);
  const cnepTotal = cnep?.encontrado ? cnep.quantidade : 0;
  const cnepHistoricas = cnepTotal - cnepVigentes;

  return (
    <>
      <SanctionsCard
        title="Lista de empresas impedidas (CEIS)"
        icon={<Icons.ShieldAlert size={12} />}
        subtitle="Verifica se a empresa está proibida de contratar com o governo"
        cleanCopy="Nenhum impedimento encontrado — a empresa pode contratar normalmente."
        countCopy={
          <>
            <strong className="font-bold text-ink">{ceisVigentes} impedimento(s) ativo(s)</strong> ·{' '}
            {ceisHistoricas} já expirado(s) no histórico
          </>
        }
        vigentes={ceisVigentes}
        historicas={ceisHistoricas}
        result={ceis}
        onOpenDetails={() => setSelectedDrawer('CEIS')}
      />

      <SanctionsCard
        title="Punições por corrupção (CNEP)"
        icon={<Icons.Scale size={12} />}
        subtitle="Verifica se a empresa foi punida pela Lei Anticorrupção"
        cleanCopy="Nenhuma punição por corrupção registrada."
        countCopy={
          <>
            <strong className="font-bold text-ink">{cnepVigentes} punição(ões) ativa(s)</strong> ·{' '}
            {cnepHistoricas} já expirada(s) no histórico
          </>
        }
        vigentes={cnepVigentes}
        historicas={cnepHistoricas}
        result={cnep}
        onOpenDetails={() => setSelectedDrawer('CNEP')}
      />

      {selectedDrawer ? (
        <SanctionsDrawer
          isOpen
          onClose={() => setSelectedDrawer(null)}
          tipo={selectedDrawer}
          registros={selectedDrawer === 'CEIS' ? ceis?.registros || [] : cnep?.registros || []}
        />
      ) : null}
    </>
  );
};
