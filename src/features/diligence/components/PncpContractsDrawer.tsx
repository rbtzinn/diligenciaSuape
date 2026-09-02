// ==========================================================
// DILIGÊNCIA 360 — Contratos e pagamentos públicos
// Fontes diretas: PNCP e Portal da Transparência do Governo Federal.
// ==========================================================

import React from 'react';
import { Drawer } from '../../../components/ui/Drawer';
import { Badge } from '../../../components/ui/Badge';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Icons } from '../../../components/ui/Icons';
import type { FederalContract, FederalExposureSummary, PncpContract, PncpSummary } from '../types';

interface PncpContractsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pncp?: PncpSummary;
  federalExposure?: FederalExposureSummary;
}

function formatCurrency(value?: number | null) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
}

const ContractCard: React.FC<{ contract: PncpContract; confirmed: boolean }> = ({ contract, confirmed }) => (
  <article className="pncp-card">
    <header className="pncp-card-head">
      <Badge variant={confirmed ? 'high' : 'neutral'} size="sm">
        {confirmed ? 'CNPJ confirmado' : 'Outro CNPJ'}
      </Badge>
      <strong>{contract.numeroContrato || 'Contrato sem número'}</strong>
    </header>

    <p className="pncp-card-object">{contract.objeto || 'Objeto não informado'}</p>

    <dl className="pncp-card-grid">
      <div>
        <dt>Órgão</dt>
        <dd>{contract.orgao || '—'}</dd>
      </div>
      <div>
        <dt>Local</dt>
        <dd>{[contract.municipio, contract.uf].filter(Boolean).join('/') || '—'}</dd>
      </div>
      <div>
        <dt>Valor global</dt>
        <dd className="pncp-value">{formatCurrency(contract.valorGlobal)}</dd>
      </div>
      <div>
        <dt>Vigência</dt>
        <dd>
          {formatDate(contract.vigenciaInicio) || '—'}
          {contract.vigenciaFim ? ` até ${formatDate(contract.vigenciaFim)}` : ''}
        </dd>
      </div>
      <div>
        <dt>Fornecedor no documento</dt>
        <dd>
          {contract.fornecedorNome || '—'}
          {contract.fornecedorCnpjFmt ? ` · ${contract.fornecedorCnpjFmt}` : ''}
        </dd>
      </div>
      {contract.modalidade ? (
        <div>
          <dt>Modalidade</dt>
          <dd>{contract.modalidade}</dd>
        </div>
      ) : null}
    </dl>

    {contract.url ? (
      <a className="pncp-card-link" href={contract.url} target="_blank" rel="noopener noreferrer">
        Abrir no PNCP
        <Icons.ExternalLink size={12} aria-hidden="true" />
      </a>
    ) : null}
  </article>
);

const FederalContractCard: React.FC<{ contract: FederalContract }> = ({ contract }) => (
  <article className="pncp-card">
    <header className="pncp-card-head">
      <Badge variant="high" size="sm">CNPJ confirmado · Federal</Badge>
      <strong>{contract.numeroContrato || 'Contrato sem número'}</strong>
    </header>
    <p className="pncp-card-object">{contract.objeto || 'Objeto não informado'}</p>
    <dl className="pncp-card-grid">
      <div><dt>Órgão</dt><dd>{contract.orgao || '—'}</dd></div>
      <div><dt>Órgão superior</dt><dd>{contract.orgaoSuperior || '—'}</dd></div>
      <div><dt>Valor final</dt><dd className="pncp-value">{formatCurrency(contract.valorFinal || contract.valorInicial)}</dd></div>
      <div>
        <dt>Vigência</dt>
        <dd>{formatDate(contract.vigenciaInicio) || '—'}{contract.vigenciaFim ? ` até ${formatDate(contract.vigenciaFim)}` : ''}</dd>
      </div>
      <div><dt>Processo</dt><dd>{contract.numeroProcesso || '—'}</dd></div>
      <div><dt>Situação</dt><dd>{contract.situacao || '—'}</dd></div>
    </dl>
    {contract.url ? (
      <a className="pncp-card-link" href={contract.url} target="_blank" rel="noopener noreferrer">
        Abrir no Portal da Transparência
        <Icons.ExternalLink size={12} aria-hidden="true" />
      </a>
    ) : null}
  </article>
);

export const PncpContractsDrawer: React.FC<PncpContractsDrawerProps> = ({
  isOpen,
  onClose,
  pncp,
  federalExposure,
}) => {
  const confirmados = pncp?.contratos || [];
  const divergentes = pncp?.contratosDivergentes || [];
  const naoVerificados = pncp?.contratosNaoVerificados || [];
  const contratacoes = pncp?.contratacoes || [];
  const resumo = pncp?.resumo;
  const federalContracts = federalExposure?.contratos || [];
  const federalResources = federalExposure?.recursos;
  const totalContracts = (resumo?.confirmados || 0) + federalContracts.length;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Contratos e recursos públicos"
      subtitle={
        pncp?.ok || federalExposure?.ok
          ? `${totalContracts} contrato(s) confirmado(s) pelo CNPJ em fontes oficiais`
          : 'Consultas ao PNCP e ao Portal da Transparência'
      }
    >
      <div className="pncp-stack">
        {!pncp && !federalExposure ? (
          <EmptyState
            icon={<Icons.Landmark size={28} />}
            title="Consulta não executada"
            description="Rode uma nova diligência para consultar as fontes públicas."
          />
        ) : null}

        {pncp && !pncp.ok ? (
          <div className="pncp-notice pncp-notice-error">
            <strong>Fonte indisponível.</strong>
            <p>{pncp.erro}</p>
          </div>
        ) : null}

        {federalExposure?.ok ? (
          <>
            <section className="pncp-section">
              <h3>Contratos do Executivo Federal ({federalContracts.length})</h3>
              <p className="pncp-hint">
                Registros do Portal da Transparência localizados diretamente pelo CNPJ do fornecedor.
              </p>
              {federalContracts.length > 0 ? (
                federalContracts.map((contract, index) => (
                  <FederalContractCard key={contract.id || index} contract={contract} />
                ))
              ) : (
                <p className="pncp-hint">Nenhum contrato federal foi retornado para o CNPJ.</p>
              )}
            </section>

            {federalResources ? (
              <section className="pncp-section">
                <h3>Pagamentos do Executivo Federal</h3>
                <div className="pncp-total">
                  <span>Total no período {federalResources.periodoInicio} a {federalResources.periodoFim}</span>
                  <strong>{formatCurrency(federalResources.valorTotal)}</strong>
                </div>
                {federalResources.orgaos.length > 0 ? (
                  <ul className="pncp-plain-list">
                    {federalResources.orgaos.map((agency) => (
                      <li key={agency.codigo || agency.nome}>
                        <strong>{agency.nome}</strong> — {formatCurrency(agency.valorTotal)}
                        {agency.orgaoSuperior ? ` · ${agency.orgaoSuperior}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pncp-hint">Nenhum pagamento federal foi retornado no período consultado.</p>
                )}
              </section>
            ) : null}

            {federalExposure.consultaParcial ? (
              <div className="pncp-notice pncp-notice-warning">
                <strong>Cobertura federal parcial.</strong>
                <p>{federalExposure.falhas?.join(' · ') || 'Um ou mais períodos não responderam.'}</p>
              </div>
            ) : null}
            <p className="pncp-disclaimer">{federalExposure.limitacao}</p>
          </>
        ) : federalExposure ? (
          <div className="pncp-notice pncp-notice-error">
            <strong>Portal da Transparência indisponível.</strong>
            <p>{federalExposure.erro}</p>
          </div>
        ) : null}

        {pncp?.ok ? (
          <>
            {resumo && resumo.confirmados > 0 ? (
              <div className="pncp-total">
                <span>Valor somado dos contratos confirmados</span>
                <strong>{formatCurrency(resumo.valorTotalConfirmado)}</strong>
              </div>
            ) : null}

            {pncp.consultaParcial ? (
              <div className="pncp-notice pncp-notice-warning">
                <strong>Cobertura incompleta nesta execução.</strong>
                <p>
                  Parte das consultas ao PNCP falhou. A ausência de contrato abaixo não pode ser lida como ausência de
                  contrato no país.
                </p>
              </div>
            ) : null}

            <section className="pncp-section">
              <h3>Contratos confirmados no PNCP ({confirmados.length})</h3>
              {confirmados.length > 0 ? (
                confirmados.map((contract, index) => (
                  <ContractCard key={contract.numeroControlePncp || index} contract={contract} confirmed />
                ))
              ) : (
                <p className="pncp-hint">
                  Nenhum contrato no PNCP foi assinado por este CNPJ nas buscas realizadas.
                </p>
              )}
            </section>

            {divergentes.length > 0 ? (
              <section className="pncp-section">
                <h3>Citam o nome, mas são de outro CNPJ ({divergentes.length})</h3>
                <p className="pncp-hint">
                  A busca do PNCP casa o termo no texto do documento. Estes contratos mencionam o nome pesquisado, porém
                  foram assinados por outra empresa — homônimo ou citação de terceiro.
                </p>
                {divergentes.map((contract, index) => (
                  <ContractCard key={contract.numeroControlePncp || index} contract={contract} confirmed={false} />
                ))}
              </section>
            ) : null}

            {naoVerificados.length > 0 ? (
              <section className="pncp-section">
                <h3>Não foi possível confirmar ({naoVerificados.length})</h3>
                <p className="pncp-hint">
                  O detalhe destes contratos não respondeu, então o fornecedor não pôde ser verificado. Não são achado
                  nem descarte: exigem nova consulta.
                </p>
                <ul className="pncp-plain-list">
                  {naoVerificados.map((contract, index) => (
                    <li key={index}>
                      <strong>{contract.numeroContrato}</strong> — {contract.orgao}
                      {contract.url ? (
                        <a href={contract.url} target="_blank" rel="noopener noreferrer">
                          abrir
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {contratacoes.length > 0 ? (
              <section className="pncp-section">
                <h3>Contratações que citam o nome ({contratacoes.length})</h3>
                <p className="pncp-hint">
                  Editais e avisos de contratação em que o termo aparece. O PNCP só nomeia o vencedor no contrato, então
                  isto não prova participação nem vitória.
                </p>
                <ul className="pncp-plain-list">
                  {contratacoes.map((item, index) => (
                    <li key={index}>
                      <strong>{item.titulo}</strong> — {item.orgao}
                      {item.uf ? ` (${item.municipio}/${item.uf})` : ''}
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          abrir
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <details className="pncp-details">
              <summary>Consultas executadas ({pncp.consultas?.length || 0})</summary>
              <ul>
                {(pncp.consultas || []).map((consulta, index) => (
                  <li key={index}>
                    <code>{consulta.termo}</code> · {consulta.tipo} —{' '}
                    {consulta.ok ? `${consulta.total ?? 0} no total` : `falhou: ${consulta.erro}`}
                  </li>
                ))}
              </ul>
            </details>

            <p className="pncp-disclaimer">{pncp.limitacao}</p>
          </>
        ) : null}
      </div>
    </Drawer>
  );
};
