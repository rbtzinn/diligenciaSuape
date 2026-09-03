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
  <article className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-surface-subtle p-3.5">
    <header className="flex min-w-0 flex-wrap items-center gap-2 [&>strong]:ml-auto [&>strong]:font-mono [&>strong]:text-sm [&>strong]:font-bold [&>strong]:text-ink">
      <Badge variant={confirmed ? 'high' : 'neutral'} size="sm">
        {confirmed ? 'CNPJ confirmado' : 'Outro CNPJ'}
      </Badge>
      <strong>{contract.numeroContrato || 'Contrato sem número'}</strong>
    </header>

    <p className="text-sm leading-relaxed text-ink-2">{contract.objeto || 'Objeto não informado'}</p>

    <dl className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] [&_dt]:text-2xs [&_dt]:font-medium [&_dt]:uppercase [&_dt]:tracking-wide [&_dt]:text-ink-3 [&_dd]:mt-0.5 [&_dd]:text-sm [&_dd]:leading-snug [&_dd]:text-ink">
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
        <dd className="font-bold">{formatCurrency(contract.valorGlobal)}</dd>
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
      <a className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" href={contract.url} target="_blank" rel="noopener noreferrer">
        Abrir no PNCP
        <Icons.ExternalLink size={12} aria-hidden="true" />
      </a>
    ) : null}
  </article>
);

const FederalContractCard: React.FC<{ contract: FederalContract }> = ({ contract }) => (
  <article className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-surface-subtle p-3.5">
    <header className="flex min-w-0 flex-wrap items-center gap-2 [&>strong]:ml-auto [&>strong]:font-mono [&>strong]:text-sm [&>strong]:font-bold [&>strong]:text-ink">
      <Badge variant="high" size="sm">CNPJ confirmado · Federal</Badge>
      <strong>{contract.numeroContrato || 'Contrato sem número'}</strong>
    </header>
    <p className="text-sm leading-relaxed text-ink-2">{contract.objeto || 'Objeto não informado'}</p>
    <dl className="grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))] [&_dt]:text-2xs [&_dt]:font-medium [&_dt]:uppercase [&_dt]:tracking-wide [&_dt]:text-ink-3 [&_dd]:mt-0.5 [&_dd]:text-sm [&_dd]:leading-snug [&_dd]:text-ink">
      <div><dt>Órgão</dt><dd>{contract.orgao || '—'}</dd></div>
      <div><dt>Órgão superior</dt><dd>{contract.orgaoSuperior || '—'}</dd></div>
      <div><dt>Valor final</dt><dd className="font-bold">{formatCurrency(contract.valorFinal || contract.valorInicial)}</dd></div>
      <div>
        <dt>Vigência</dt>
        <dd>{formatDate(contract.vigenciaInicio) || '—'}{contract.vigenciaFim ? ` até ${formatDate(contract.vigenciaFim)}` : ''}</dd>
      </div>
      <div><dt>Processo</dt><dd>{contract.numeroProcesso || '—'}</dd></div>
      <div><dt>Situação</dt><dd>{contract.situacao || '—'}</dd></div>
    </dl>
    {contract.url ? (
      <a className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline" href={contract.url} target="_blank" rel="noopener noreferrer">
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
      <div className="flex min-w-0 flex-col gap-4">
        {!pncp && !federalExposure ? (
          <EmptyState
            icon={<Icons.Landmark size={28} />}
            title="Consulta não executada"
            description="Rode uma nova diligência para consultar as fontes públicas."
          />
        ) : null}

        {pncp && !pncp.ok ? (
          <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-high-line bg-high-bg px-3.5 py-2.5 text-sm text-high-text [&>p]:leading-relaxed [&>strong]:font-bold">
            <strong>Fonte indisponível.</strong>
            <p>{pncp.erro}</p>
          </div>
        ) : null}

        {federalExposure?.ok ? (
          <>
            <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
              <h3>Contratos do Executivo Federal ({federalContracts.length})</h3>
              <p className="text-xs leading-relaxed text-ink-3">
                Registros do Portal da Transparência localizados diretamente pelo CNPJ do fornecedor.
              </p>
              {federalContracts.length > 0 ? (
                federalContracts.map((contract, index) => (
                  <FederalContractCard key={contract.id || index} contract={contract} />
                ))
              ) : (
                <p className="text-xs leading-relaxed text-ink-3">Nenhum contrato federal foi retornado para o CNPJ.</p>
              )}
            </section>

            {federalResources ? (
              <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
                <h3>Pagamentos do Executivo Federal</h3>
                <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-ok-line bg-ok-bg px-3.5 py-3 [&>span]:text-xs [&>span]:text-ok-text [&>strong]:num [&>strong]:text-xl [&>strong]:font-extrabold [&>strong]:text-ok-text">
                  <span>Total no período {federalResources.periodoInicio} a {federalResources.periodoFim}</span>
                  <strong>{formatCurrency(federalResources.valorTotal)}</strong>
                </div>
                {federalResources.orgaos.length > 0 ? (
                  <ul className="flex min-w-0 flex-col gap-2 [&>li]:border-b [&>li]:border-line-soft [&>li]:pb-2 [&>li]:text-sm [&>li]:leading-relaxed [&>li]:text-ink-2 [&_a]:ml-1.5 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-xs [&_a]:font-semibold [&_a]:text-brand [&_a]:hover:underline">
                    {federalResources.orgaos.map((agency) => (
                      <li key={agency.codigo || agency.nome}>
                        <strong>{agency.nome}</strong> — {formatCurrency(agency.valorTotal)}
                        {agency.orgaoSuperior ? ` · ${agency.orgaoSuperior}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs leading-relaxed text-ink-3">Nenhum pagamento federal foi retornado no período consultado.</p>
                )}
              </section>
            ) : null}

            {federalExposure.consultaParcial ? (
              <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm text-warn-text [&>p]:leading-relaxed [&>strong]:font-bold">
                <strong>Cobertura federal parcial.</strong>
                <p>{federalExposure.falhas?.join(' · ') || 'Um ou mais períodos não responderam.'}</p>
              </div>
            ) : null}
            <p className="border-t border-line-soft pt-3 text-2xs leading-relaxed text-ink-3">{federalExposure.limitacao}</p>
          </>
        ) : federalExposure ? (
          <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-high-line bg-high-bg px-3.5 py-2.5 text-sm text-high-text [&>p]:leading-relaxed [&>strong]:font-bold">
            <strong>Portal da Transparência indisponível.</strong>
            <p>{federalExposure.erro}</p>
          </div>
        ) : null}

        {pncp?.ok ? (
          <>
            {resumo && resumo.confirmados > 0 ? (
              <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-ok-line bg-ok-bg px-3.5 py-3 [&>span]:text-xs [&>span]:text-ok-text [&>strong]:num [&>strong]:text-xl [&>strong]:font-extrabold [&>strong]:text-ok-text">
                <span>Valor somado dos contratos confirmados</span>
                <strong>{formatCurrency(resumo.valorTotalConfirmado)}</strong>
              </div>
            ) : null}

            {pncp.consultaParcial ? (
              <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm text-warn-text [&>p]:leading-relaxed [&>strong]:font-bold">
                <strong>Cobertura incompleta nesta execução.</strong>
                <p>
                  Parte das consultas ao PNCP falhou. A ausência de contrato abaixo não pode ser lida como ausência de
                  contrato no país.
                </p>
              </div>
            ) : null}

            <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
              <h3>Contratos confirmados no PNCP ({confirmados.length})</h3>
              {confirmados.length > 0 ? (
                confirmados.map((contract, index) => (
                  <ContractCard key={contract.numeroControlePncp || index} contract={contract} confirmed />
                ))
              ) : (
                <p className="text-xs leading-relaxed text-ink-3">
                  Nenhum contrato no PNCP foi assinado por este CNPJ nas buscas realizadas.
                </p>
              )}
            </section>

            {divergentes.length > 0 ? (
              <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
                <h3>Citam o nome, mas são de outro CNPJ ({divergentes.length})</h3>
                <p className="text-xs leading-relaxed text-ink-3">
                  A busca do PNCP casa o termo no texto do documento. Estes contratos mencionam o nome pesquisado, porém
                  foram assinados por outra empresa — homônimo ou citação de terceiro.
                </p>
                {divergentes.map((contract, index) => (
                  <ContractCard key={contract.numeroControlePncp || index} contract={contract} confirmed={false} />
                ))}
              </section>
            ) : null}

            {naoVerificados.length > 0 ? (
              <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
                <h3>Não foi possível confirmar ({naoVerificados.length})</h3>
                <p className="text-xs leading-relaxed text-ink-3">
                  O detalhe destes contratos não respondeu, então o fornecedor não pôde ser verificado. Não são achado
                  nem descarte: exigem nova consulta.
                </p>
                <ul className="flex min-w-0 flex-col gap-2 [&>li]:border-b [&>li]:border-line-soft [&>li]:pb-2 [&>li]:text-sm [&>li]:leading-relaxed [&>li]:text-ink-2 [&_a]:ml-1.5 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-xs [&_a]:font-semibold [&_a]:text-brand [&_a]:hover:underline">
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
              <section className="flex min-w-0 flex-col gap-2.5 [&>h3]:text-md [&>h3]:font-bold [&>h3]:text-ink">
                <h3>Contratações que citam o nome ({contratacoes.length})</h3>
                <p className="text-xs leading-relaxed text-ink-3">
                  Editais e avisos de contratação em que o termo aparece. O PNCP só nomeia o vencedor no contrato, então
                  isto não prova participação nem vitória.
                </p>
                <ul className="flex min-w-0 flex-col gap-2 [&>li]:border-b [&>li]:border-line-soft [&>li]:pb-2 [&>li]:text-sm [&>li]:leading-relaxed [&>li]:text-ink-2 [&_a]:ml-1.5 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-xs [&_a]:font-semibold [&_a]:text-brand [&_a]:hover:underline">
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

            <details className="overflow-hidden rounded-md border border-line bg-surface [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:px-3 [&>summary]:py-2 [&>summary]:text-xs [&>summary]:font-semibold [&>summary]:text-ink-2 [&>ul]:flex [&>ul]:list-disc [&>ul]:flex-col [&>ul]:gap-1.5 [&>ul]:border-t [&>ul]:border-line-soft [&>ul]:px-3 [&>ul]:py-2.5 [&>ul]:pl-7 [&>ul]:text-xs [&>ul]:leading-relaxed [&>ul]:text-ink-2 [&_code]:rounded-sm [&_code]:bg-surface-active [&_code]:px-1.5">
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

            <p className="border-t border-line-soft pt-3 text-2xs leading-relaxed text-ink-3">{pncp.limitacao}</p>
          </>
        ) : null}
      </div>
    </Drawer>
  );
};
