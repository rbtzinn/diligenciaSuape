// ==========================================================
// DILIGÊNCIA 360 — Fontes de dados e evidências
// ==========================================================
// A tela usava `.sources-page`, `.sources-summary` e
// `.source-catalog-card`, com um cabeçalho próprio que não batia com
// o do histórico nem com o do dossiê. O endpoint em monoespaçado
// estourava a largura do cartão no celular, porque nada o autorizava
// a quebrar. Agora usa a casca de página e as seções do projeto, e o
// endereço quebra dentro do cartão.
// ==========================================================

import React, { useEffect, useState } from 'react';
import { Section } from '../../../components/ui/Section';
import { Chip } from '../../../components/ui/Chip';
import { Icons } from '../../../components/ui/Icons';
import { Fact, FactGrid } from '../../../components/ui/Facts';
import { Page, PageBody, PageHeader } from '../../../components/layout/Page';
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
      provider: 'Integração institucional opcional',
      type: 'Vínculo Institucional Interno',
      status: internalSuape?.available ? 'online' : 'limited',
      statusLabel: internalSuape?.available ? `${internalSuape.people} pessoas minimizadas` : 'Base não importada',
      description: 'Compara a rede empresarial com identidades funcionais minimizadas. Remuneração e eventos de folha não são importados nem exibidos.',
      endpoint: 'Não configurada nesta implantação',
    },
  ];

  const onlineCount = sources.filter((source) => source.status === 'online').length;
  const attentionCount = sources.length - onlineCount;

  return (
    <Page>
      <PageHeader
        eyebrow="Rastreabilidade da análise"
        title="Fontes de dados e evidências"
        subtitle="Veja a cobertura, a disponibilidade e os limites de cada consulta."
      />

      <PageBody>
        <section
          aria-label="Resumo das fontes"
          className="rounded-card border border-line bg-surface p-4 shadow-xs"
        >
          <FactGrid columns={3}>
            <Fact label="Fontes mapeadas" value={sources.length} />
            <Fact label="Operacionais agora" value={onlineCount} tone="ok" />
            <Fact
              label="Sob demanda ou configuração"
              value={attentionCount}
              tone={attentionCount > 0 ? 'warn' : 'muted'}
            />
          </FactGrid>
        </section>

        {sources.map((src) => (
          <Section
            key={src.name}
            mark={<Icons.Database size={12} />}
            title={src.name}
            subtitle={src.type}
            trailing={
              <Chip tone={src.status === 'online' ? 'ok' : 'warn'} size="sm" dot>
                {src.statusLabel}
              </Chip>
            }
          >
            <p className="text-sm leading-relaxed text-ink-2">{src.description}</p>

            <dl className="mt-3 grid gap-2 border-t border-line-soft pt-3 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Provedor</dt>
                <dd className="text-sm text-ink">{src.provider}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Categoria</dt>
                <dd className="text-sm text-ink">{src.type}</dd>
              </div>
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Endereço da API</dt>
                {/* URL longa em monoespaçado precisa de autorização
                    explícita para quebrar; sem isto ela empurrava o
                    cartão para fora da tela. */}
                <dd className="font-mono text-xs text-ink-2 [overflow-wrap:anywhere]">{src.endpoint}</dd>
              </div>
            </dl>
          </Section>
        ))}
      </PageBody>
    </Page>
  );
};
