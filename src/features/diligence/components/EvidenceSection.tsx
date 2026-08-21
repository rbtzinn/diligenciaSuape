// ==========================================================
// DILIGÊNCIA 360 — Componente Fontes Consultadas e Evidências
// ==========================================================

import React, { useState } from 'react';
import { SanctionsResult, PepPartnerResult, JudicialProcessItem, AdverseMediaSummary } from '../types';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../components/ui/Icons';
import { Formatters } from '../../../lib/formatters';

interface EvidenceSectionProps {
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  pepResults: PepPartnerResult[];
  processosJudiciais?: JudicialProcessItem[];
  adverseMedia?: AdverseMediaSummary;
  consultadoEm?: string;
}

export const EvidenceSection: React.FC<EvidenceSectionProps> = ({
  ceis,
  cnep,
  pepResults,
  processosJudiciais = [],
  adverseMedia,
  consultadoEm,
}) => {
  const [expanded, setExpanded] = useState(false);

  const pepHits = pepResults.filter((p) => p.encontrado).length;

  const sources = [
    {
      base: 'Dados da Empresa',
      provedor: 'Receita Federal (BrasilAPI)',
      status: 'Consultado com sucesso',
      registros: 'Cadastro completo recuperado',
      horario: Formatters.time(consultadoEm || new Date()),
    },
    {
      base: 'Empresas Impedidas (CEIS)',
      provedor: 'Portal da Transparência',
      status: ceis?.semChave ? 'Sem chave de acesso' : ceis?.ok ? 'Consultado com sucesso' : 'Indisponível',
      registros: ceis?.encontrado ? `${ceis.quantidade} registro(s)` : 'Nenhum encontrado',
      horario: Formatters.time(ceis?.consultadoEm || consultadoEm || new Date()),
    },
    {
      base: 'Punições por Corrupção (CNEP)',
      provedor: 'Portal da Transparência',
      status: cnep?.semChave ? 'Sem chave de acesso' : cnep?.ok ? 'Consultado com sucesso' : 'Indisponível',
      registros: cnep?.encontrado ? `${cnep.quantidade} registro(s)` : 'Nenhum encontrado',
      horario: Formatters.time(cnep?.consultadoEm || consultadoEm || new Date()),
    },
    {
      base: 'Cargos Políticos (PEP)',
      provedor: 'Portal da Transparência',
      status: 'Busca por nome dos sócios',
      registros: pepHits > 0 ? `${pepHits} possível(is) coincidência(s)` : 'Nenhum encontrado',
      horario: Formatters.time(consultadoEm || new Date()),
    },
    {
      base: 'Notícias na Internet',
      provedor: adverseMedia?.provider || 'Brave Search',
      status: adverseMedia?.semChave ? 'Não configurado' : adverseMedia?.ok ? 'Busca concluída' : 'Indisponível',
      registros: adverseMedia?.results ? `${adverseMedia.results.length} resultado(s) analisado(s)` : 'Sem resultados',
      horario: Formatters.time(adverseMedia?.consultadoEm || consultadoEm || new Date()),
    },
    {
      base: 'Processos na Justiça',
      provedor: 'CNJ (DataJud)',
      status: 'Disponível para consulta',
      registros: processosJudiciais.length > 0 ? `${processosJudiciais.length} processo(s) consultado(s)` : 'Consulta por número do processo',
      horario: Formatters.time(processosJudiciais[0]?.consultadoEm || consultadoEm || new Date()),
    },
  ];

  return (
    <Card
      title="De onde vieram essas informações"
      icon={<Icons.Database size={16} />}
      action={
        <Button
          variant="ghost"
          size="sm"
          icon={expanded ? <Icons.ChevronUp size={14} /> : <Icons.ChevronDown size={14} />}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Recolher' : 'Ver detalhes'}
        </Button>
      }
      className="dash-full-width"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="section-subtitle">
          Todas as informações desta análise foram obtidas de fontes públicas oficiais via conexão segura (HTTPS).
        </div>

        {expanded && (
          <div className="table-container animate-fade-in">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fonte</th>
                  <th>Provedor</th>
                  <th>Status</th>
                  <th>Resultado</th>
                  <th>Horário</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s, idx) => (
                  <tr key={idx}>
                    <td style={{ fontWeight: 'var(--font-medium)', color: 'var(--text-primary)' }}>
                      {s.base}
                    </td>
                    <td>{s.provedor}</td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: 'var(--text-2xs)' }}>
                        {s.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 'var(--text-sm)' }}>{s.registros}</td>
                    <td className="font-mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {s.horario}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
};
