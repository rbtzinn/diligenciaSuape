// ==========================================================
// DILIGÊNCIA 360 — Mensagem Principal Executiva (Resumo Inicial)
// Síntese determinística em linguagem clara para leitura em 5 segundos
// ==========================================================

import React from 'react';
import { CompanyData, SanctionsResult, PepPartnerResult, AdverseMediaSummary, ProcessDiscovery } from '../types';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';

interface ExecutiveSummaryBannerProps {
  empresa: CompanyData;
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  pepResults: PepPartnerResult[];
  adverseMedia?: AdverseMediaSummary;
  discoveries?: ProcessDiscovery[];
  onReviewPendencies?: () => void;
}

export const ExecutiveSummaryBanner: React.FC<ExecutiveSummaryBannerProps> = ({
  empresa,
  ceis,
  cnep,
  pepResults,
  adverseMedia,
  discoveries = [],
  onReviewPendencies,
}) => {
  const situacao = (empresa.descricao_situacao_cadastral || 'NÃO INFORMADA').toUpperCase();
  const isAtiva = situacao === 'ATIVA';
  const ceisVigentes = ceis?.vigentes ?? (ceis?.encontrado ? ceis.quantidade : 0);
  const cnepVigentes = cnep?.vigentes ?? (cnep?.encontrado ? cnep.quantidade : 0);
  const hasActiveSanction = ceisVigentes > 0 || cnepVigentes > 0;

  const pepHits = pepResults.filter((p) => p.encontrado).length;
  const strongMedia = adverseMedia?.strongMatches || 0;
  const pendingProcesses = discoveries.filter((d) => d.status === 'candidate').length;
  const unavailableAxes = [
    ceis?.semChave || ceis?.ok === false,
    cnep?.semChave || cnep?.ok === false,
    pepResults.length > 0 && pepResults.some((p) => p.semChave || !p.ok),
    !adverseMedia || adverseMedia.semChave || !adverseMedia.ok,
  ].filter(Boolean).length;

  const totalPendencies = pepHits + (strongMedia > 0 ? 1 : 0) + pendingProcesses;

  let message: string;
  let title: string;
  let variant: 'success' | 'warning' | 'critical';
  let ctaText: string;

  if (!isAtiva) {
    variant = 'critical';
    title = 'Pare antes de contratar';
    message = `A empresa está com situação "${empresa.descricao_situacao_cadastral}" na Receita Federal. Não é possível contratar enquanto não estiver regularizada.`;
    ctaText = 'Ver detalhes';
  } else if (hasActiveSanction) {
    variant = 'critical';
    title = 'Contratação bloqueada';
    const total = ceisVigentes + cnepVigentes;
    message = `Esta empresa possui ${total} impedimento${total > 1 ? 's' : ''} ativo${total > 1 ? 's' : ''} em listas oficiais do governo. A contratação está bloqueada até a regularização.`;
    ctaText = 'Ver impedimentos';
  } else if (totalPendencies > 0) {
    variant = 'warning';
    title = 'Revise antes de decidir';
    const partes = [];
    if (pepHits > 0) partes.push(`${pepHits} sócio${pepHits > 1 ? 's' : ''} pode${pepHits > 1 ? 'm' : ''} ter cargo político`);
    if (strongMedia > 0) partes.push(`${strongMedia} notícia${strongMedia > 1 ? 's' : ''} negativa${strongMedia > 1 ? 's' : ''} na internet`);
    if (pendingProcesses > 0) partes.push(`${pendingProcesses} processo${pendingProcesses > 1 ? 's' : ''} judicial${pendingProcesses > 1 ? 'is' : ''} para revisar`);

    message = `${unavailableAxes > 0 ? 'A análise também possui fontes indisponíveis. ' : ''}Não foi localizado impedimento confirmado, mas existem itens que precisam ser verificados: ${partes.join(', ')}.`;
    ctaText = `Revisar ${totalPendencies} ${totalPendencies > 1 ? 'itens' : 'item'}`;
  } else if (unavailableAxes > 0) {
    variant = 'warning';
    title = 'Análise incompleta';
    message = `${unavailableAxes} eixo${unavailableAxes > 1 ? 's não puderam' : ' não pôde'} ser consultado${unavailableAxes > 1 ? 's' : ''}. Não é possível concluir que está tudo certo enquanto essas verificações estiverem indisponíveis.`;
    ctaText = 'Ver cobertura';
  } else {
    variant = 'success';
    title = 'Pode seguir para a próxima etapa';
    message = 'Nenhum impedimento ou problema encontrado nas bases públicas consultadas. A empresa está apta para prosseguir.';
    ctaText = 'Tudo certo';
  }

  return (
    <section className={`decision-hero decision-hero-${variant} animate-fade-in`} aria-labelledby="decision-title">
      <div className="decision-hero-icon" aria-hidden="true">
          {variant === 'success' ? (
            <Icons.CheckCircle size={28} />
          ) : (
            <Icons.AlertTriangle size={28} />
          )}
      </div>
      <div className="decision-hero-copy">
        <span className="decision-hero-eyebrow">Parecer em linguagem simples</span>
        <h2 id="decision-title">{title}</h2>
        <p>{message}</p>
        <div className="decision-hero-facts" aria-label="Resumo da verificação">
          <span><strong>{isAtiva ? 'Regular' : situacao}</strong> na Receita Federal</span>
          <span><strong>{ceisVigentes + cnepVigentes}</strong> impedimentos ativos</span>
          <span><strong>{totalPendencies}</strong> {totalPendencies === 1 ? 'item' : 'itens'} para revisão</span>
          <span><strong>{unavailableAxes}</strong> {unavailableAxes === 1 ? 'eixo indisponível' : 'eixos indisponíveis'}</span>
        </div>
      </div>
      {onReviewPendencies && totalPendencies > 0 ? (
        <Button variant={variant === 'critical' ? 'primary' : 'secondary'} onClick={onReviewPendencies}>
          {ctaText} <Icons.ArrowRight size={16} />
        </Button>
      ) : null}
    </section>
  );
};
