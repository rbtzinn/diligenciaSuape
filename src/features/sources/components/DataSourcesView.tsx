// ==========================================================
// DILIGÊNCIA 360 — Tela de Fontes de Dados
// ==========================================================

import React, { useEffect, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Icons } from '../../../components/ui/Icons';
import { DiligenceService } from '../../diligence/services/diligence.service';

interface SourceInfo {
  name: string;
  provider: string;
  type: string;
  status: 'online' | 'limited' | 'offline';
  statusLabel: string;
  description: string;
  endpoint: string;
}

export const DataSourcesView: React.FC = () => {
  const [cguConfigured, setCguConfigured] = useState<boolean | null>(null);
  const [webSearchConfigured, setWebSearchConfigured] = useState<boolean | null>(null);
  const [datajudConfigured, setDatajudConfigured] = useState<boolean | null>(null);
  const [internalSuape, setInternalSuape] = useState<{ available: boolean; people: number } | null>(null);

  useEffect(() => {
    DiligenceService.getStatus()
      .then((res) => {
        setCguConfigured(res.cguConfigurada);
        setWebSearchConfigured(res.buscaWebConfigurada);
        setDatajudConfigured(res.datajudConfigurada);
        setInternalSuape(res.internalSuape);
      })
      .catch(() => {
        setCguConfigured(null);
        setWebSearchConfigured(null);
        setDatajudConfigured(null);
        setInternalSuape(null);
      });
  }, []);

  const sources: SourceInfo[] = [
    {
      name: 'Cadastro Nacional da Pessoa Jurídica (CNPJ)',
      provider: 'BrasilAPI / Receita Federal do Brasil',
      type: 'Cadastral & Societário',
      status: 'limited',
      statusLabel: 'Consulta sob demanda',
      description: 'Consulta da situação cadastral, CNAE, data de abertura, endereço e composição completa do Quadro de Sócios e Administradores (QSA).',
      endpoint: 'https://brasilapi.com.br/api/cnpj/v1',
    },
    {
      name: 'ReceitaWS (Contingência / Fallback)',
      provider: 'ReceitaWS API',
      type: 'Cadastral & Societário',
      status: 'limited',
      statusLabel: 'Contingência sob demanda',
      description: 'Camada de alta disponibilidade ativada automaticamente caso a BrasilAPI retorne instabilidade ou indisponibilidade.',
      endpoint: 'https://receitaws.com.br/v1/cnpj',
    },
    {
      name: 'Cadastro de Empresas Inidôneas e Suspensas (CEIS)',
      provider: 'Portal da Transparência / Controladoria-Geral da União (CGU)',
      type: 'Sanções Administrativas',
      status: cguConfigured ? 'online' : 'limited',
      statusLabel: cguConfigured ? 'Operacional (Chave Ativa)' : 'Requer Chave de API',
      description: 'Identifica empresas impedidas de contratar com a administração pública decorrentes de processos administrativos sancionadores.',
      endpoint: 'https://api.portaldatransparencia.gov.br/api-de-dados/ceis',
    },
    {
      name: 'Cadastro Nacional de Empresas Punidas (CNEP)',
      provider: 'Portal da Transparência / Controladoria-Geral da União (CGU)',
      type: 'Lei Anticorrupção (12.846/13)',
      status: cguConfigured ? 'online' : 'limited',
      statusLabel: cguConfigured ? 'Operacional (Chave Ativa)' : 'Requer Chave de API',
      description: 'Registra sanções aplicadas com base na Lei Anticorrupção Brasileira.',
      endpoint: 'https://api.portaldatransparencia.gov.br/api-de-dados/cnep',
    },
    {
      name: 'Pessoas Expostas Politicamente (PEP)',
      provider: 'Portal da Transparência / Controladoria-Geral da União (CGU)',
      type: 'Integridade & Governança',
      status: cguConfigured ? 'online' : 'limited',
      statusLabel: cguConfigured ? 'Operacional (Chave Ativa)' : 'Requer Chave de API',
      description: 'Consulta nominal automatizada para cada integrante do QSA para identificar exercício de cargos públicos relevantes.',
      endpoint: 'https://api.portaldatransparencia.gov.br/api-de-dados/peps',
    },
    {
      name: 'Pesquisa de mídia e ocorrências públicas',
      provider: 'Brave Search & Google News Engine',
      type: 'Mídia Adversa',
      status: webSearchConfigured ? 'online' : 'limited',
      statusLabel: webSearchConfigured ? 'Operacional e Ativa' : 'Não configurada',
      description: 'Pesquisa contextual de notícias e publicações, com correlação, deduplicação e revisão humana dos resultados.',
      endpoint: 'https://api.search.brave.com/res/v1/web/search',
    },
    {
      name: 'Metadados processuais por número CNJ',
      provider: 'Conselho Nacional de Justiça / DataJud',
      type: 'Enriquecimento Processual',
      status: datajudConfigured ? 'online' : 'limited',
      statusLabel: datajudConfigured ? 'Operacional (Chave Ativa)' : 'Não configurada',
      description: 'Enriquece um número CNJ já identificado. Não realiza descoberta de processos por nome, CPF ou CNPJ.',
      endpoint: 'https://api-publica.datajud.cnj.jus.br',
    },
    {
      name: 'Diários Oficiais Municipais',
      provider: 'Querido Diário / Open Knowledge Brasil',
      type: 'Publicações Oficiais & Evidências',
      status: 'online',
      statusLabel: 'Operacional e gratuito',
      description: 'Pesquisa a razão social nos diários municipais cobertos, preserva excertos e documentos originais e extrai números CNJ quando presentes.',
      endpoint: 'https://api.queridodiario.ok.org.br/gazettes',
    },
    {
      name: 'Offshore Leaks Database',
      provider: 'International Consortium of Investigative Journalists (ICIJ)',
      type: 'Relações Offshore & Contexto',
      status: 'online',
      statusLabel: 'Operacional e gratuito',
      description: 'Reconcilia empresa e integrantes do QSA em lote. Toda coincidência permanece como hipótese nominal, sem inferir ilegalidade.',
      endpoint: 'https://offshoreleaks.icij.org/api/v1/reconcile',
    },
    {
      name: 'Base Funcional SUAPE',
      provider: 'PostgreSQL local / InternalSUAPEProvider',
      type: 'Vínculo Institucional Interno',
      status: internalSuape?.available ? 'online' : 'limited',
      statusLabel: internalSuape?.available ? `${internalSuape.people} pessoas minimizadas` : 'Base não importada',
      description: 'Compara a rede empresarial com identidades funcionais minimizadas. Remuneração e eventos de folha não são importados nem exibidos.',
      endpoint: 'Banco local autorizado',
    },
  ];

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--text-primary)' }}>
          Fontes de dados e evidências
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          Veja o que é consultado, o escopo de cada fonte e onde a decisão humana continua obrigatória.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {sources.map((src, idx) => (
          <Card
            key={idx}
            title={src.name}
            icon={<Icons.Database size={16} />}
            action={
              <Badge variant={src.status === 'online' ? 'success' : 'medium'}>
                {src.statusLabel}
              </Badge>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                {src.description}
              </p>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div>
                  <strong>Provedor:</strong> {src.provider}
                </div>
                <div>
                  <strong>Categoria:</strong> {src.type}
                </div>
                <div className="font-mono">
                  <strong>API:</strong> {src.endpoint}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
