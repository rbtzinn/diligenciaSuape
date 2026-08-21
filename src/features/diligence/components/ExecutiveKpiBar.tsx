import React from 'react';
import { CompanyData, SanctionsResult, PepPartnerResult, AdverseMediaSummary, ProcessDiscovery } from '../types';
import { Icons } from '../../../components/ui/Icons';

interface ExecutiveKpiBarProps {
  empresa: CompanyData;
  sociosCount: number;
  pepResults: PepPartnerResult[];
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  adverseMedia?: AdverseMediaSummary;
  discoveries?: ProcessDiscovery[];
  onOpenSocios?: () => void;
  onOpenCeis?: () => void;
  onOpenCnep?: () => void;
  onOpenPep?: () => void;
  onOpenJudicial?: () => void;
  onOpenMedia?: () => void;
}

type KpiTone = 'success' | 'warning' | 'critical' | 'neutral';

interface KpiCardProps {
  label: string;
  explanation: string;
  value: string;
  tone: KpiTone;
  icon: React.ReactNode;
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, explanation, value, tone, icon, onClick }) => (
  <button
    type="button"
    className={`kpi-summary-item kpi-item-${tone}`}
    onClick={onClick}
    disabled={!onClick}
    aria-label={`${label}: ${value}${onClick ? '. Abrir detalhes' : ''}`}
  >
    <span className="kpi-item-icon" aria-hidden="true">{icon}</span>
    <span className="kpi-item-content">
      <span className="kpi-item-label">{label}</span>
      <strong className="kpi-item-value">{value}</strong>
      <span className="kpi-item-subtitle">{explanation}</span>
    </span>
    {onClick ? <span className="kpi-item-link">Ver detalhes <Icons.ArrowRight size={13} /></span> : null}
  </button>
);

export const ExecutiveKpiBar: React.FC<ExecutiveKpiBarProps> = ({
  empresa,
  sociosCount,
  pepResults,
  ceis,
  cnep,
  adverseMedia,
  discoveries = [],
  onOpenSocios,
  onOpenCeis,
  onOpenCnep,
  onOpenPep,
  onOpenJudicial,
  onOpenMedia,
}) => {
  const situacao = (empresa.descricao_situacao_cadastral || 'NÃO INFORMADA').toUpperCase();
  const isAtiva = situacao === 'ATIVA';
  const pepHits = pepResults.filter((item) => item.encontrado).length;
  const ceisVigentes = ceis?.vigentes ?? (ceis?.encontrado ? ceis.quantidade : 0);
  const ceisTotal = ceis?.encontrado ? ceis.quantidade : 0;
  const cnepVigentes = cnep?.vigentes ?? (cnep?.encontrado ? cnep.quantidade : 0);
  const cnepTotal = cnep?.encontrado ? cnep.quantidade : 0;
  const mediaTotal = adverseMedia?.totalFound || 0;
  const mediaStrong = adverseMedia?.strongMatches || 0;
  const procsTotal = discoveries.length;
  const pepUnavailable = pepResults.length > 0 && pepResults.some((item) => item.semChave || !item.ok);
  const ceisUnavailable = !ceis || ceis.semChave || !ceis.ok;
  const cnepUnavailable = !cnep || cnep.semChave || !cnep.ok;
  const mediaUnavailable = !adverseMedia || adverseMedia.semChave || !adverseMedia.ok;

  return (
    <div className="kpi-summary-bar animate-fade-in-up">
      <KpiCard label="Cadastro da empresa" explanation="Situação informada pela Receita Federal" value={isAtiva ? 'Empresa ativa' : situacao} tone={isAtiva ? 'success' : 'critical'} icon={<Icons.Building size={21} />} />
      <KpiCard label="Pessoas ligadas" explanation="Sócios e administradores identificados" value={`${sociosCount} ${sociosCount === 1 ? 'pessoa' : 'pessoas'}`} tone="neutral" icon={<Icons.Users size={21} />} onClick={onOpenSocios} />
      <KpiCard label="Relação com cargo público" explanation="Verificação de pessoa politicamente exposta" value={pepUnavailable ? 'Indisponível' : pepResults.length === 0 ? 'Não aplicável' : pepHits > 0 ? `${pepHits} para verificar` : 'Nada encontrado'} tone={pepUnavailable || pepResults.length === 0 ? 'neutral' : pepHits > 0 ? 'warning' : 'success'} icon={<Icons.Landmark size={21} />} onClick={onOpenPep || onOpenSocios} />
      <KpiCard label="Impedimentos" explanation="Cadastro de empresas impedidas (CEIS)" value={ceisUnavailable ? 'Indisponível' : ceisVigentes > 0 ? `${ceisVigentes} ativos` : ceisTotal > 0 ? `${ceisTotal} expirados` : 'Nenhum ativo'} tone={ceisUnavailable ? 'neutral' : ceisVigentes > 0 ? 'critical' : ceisTotal > 0 ? 'warning' : 'success'} icon={<Icons.ShieldAlert size={21} />} onClick={onOpenCeis} />
      <KpiCard label="Punições oficiais" explanation="Cadastro de empresas punidas (CNEP)" value={cnepUnavailable ? 'Indisponível' : cnepVigentes > 0 ? `${cnepVigentes} ativas` : cnepTotal > 0 ? `${cnepTotal} expiradas` : 'Nenhuma ativa'} tone={cnepUnavailable ? 'neutral' : cnepVigentes > 0 ? 'critical' : cnepTotal > 0 ? 'warning' : 'success'} icon={<Icons.Scale size={21} />} onClick={onOpenCnep} />
      <KpiCard label="Processos judiciais" explanation="Descoberta de números processuais associados" value={procsTotal > 0 ? `${procsTotal} candidatos` : 'Não pesquisado'} tone={procsTotal > 0 ? 'warning' : 'neutral'} icon={<Icons.FileText size={21} />} onClick={onOpenJudicial} />
      <KpiCard label="Notícias na internet" explanation="Resultados que podem exigir conferência" value={mediaUnavailable ? 'Indisponível' : mediaStrong > 0 ? `${mediaStrong} relevantes` : mediaTotal > 0 ? `${mediaTotal} para analisar` : 'Nada encontrado'} tone={mediaUnavailable ? 'neutral' : mediaStrong > 0 ? 'critical' : mediaTotal > 0 ? 'warning' : 'success'} icon={<Icons.Globe size={21} />} onClick={onOpenMedia} />
    </div>
  );
};
