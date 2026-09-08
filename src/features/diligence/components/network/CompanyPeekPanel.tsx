// ==========================================================
// DILIGÊNCIA 360 — Espiada numa empresa vinculada
// ==========================================================
// Fica no painel do mapa, abaixo da identificação do nó. Responde
// "e essa sócia, tem alguma coisa?" sem tirar o analista do dossiê
// que ele está conduzindo.
//
// Duas decisões que a tela precisa sustentar:
//
// 1. A consulta é sob demanda. Carregar ao selecionar o nó
//    transformaria cada toque no mapa numa busca de publicações — e
//    na exploração por ramos do celular toca-se em nó o tempo todo.
//
// 2. A tela diz, o tempo todo, que isto não é uma diligência. Sem
//    score, sem "situação regular". Quem lê "nada encontrado" e
//    conclui "empresa verificada" foi induzido ao erro pela
//    interface, e num sistema de compliance esse erro só aparece
//    depois — quando já foi usado para decidir.
// ==========================================================

import React from 'react';
import { Button } from '../../../../components/ui/Button';
import { Chip } from '../../../../components/ui/Chip';
import { Fact, FactGrid } from '../../../../components/ui/Facts';
import { Icons } from '../../../../components/ui/Icons';
import { Note } from '../../../../components/ui/Note';
import { Section } from '../../../../components/ui/Section';
import { Formatters } from '../../../../lib/formatters';
import { formatCnpj } from '../../utils/entityCnpj';
import { safeExternalUrl } from './networkUtils';
import type { AdverseMediaResult, SanctionsResult } from '../../types';
import type { CompanyPeek, PeekSource } from '../../types/companyPeek.types';

/** Publicações mostradas na espiada. O resto fica na diligência. */
const MAX_NEWS = 5;
/** Sanções listadas antes de resumir o restante numa linha. */
const MAX_SANCTIONS = 4;

interface CompanyPeekPanelProps {
  cnpj: string;
  name: string;
  peek?: CompanyPeek;
  onConsultar: () => void;
  onReconsultar: () => void;
}

const Loading: React.FC<{ label: string }> = ({ label }) => (
  <p className="flex min-w-0 items-center gap-2 px-4 py-3 text-xs text-ink-3">
    <Icons.Loader size={14} aria-hidden="true" />
    {label}
  </p>
);

/**
 * Uma fonte que não respondeu não é uma empresa sem ocorrência. O
 * bloco fica com a cor de alerta e diz qual fonte falhou, para que a
 * lacuna não passe por resultado limpo.
 */
const SourceError: React.FC<{ source: PeekSource<unknown>; fallback: string }> = ({ source, fallback }) => (
  <div className="px-4 py-3">
    <Note tone="warn" icon={<Icons.AlertCircle size={15} aria-hidden="true" />}>
      {source.erro || fallback}
    </Note>
  </div>
);

function countSanctions(result?: SanctionsResult): number {
  return Number(result?.quantidade || result?.registros?.length || 0);
}

export const CompanyPeekPanel: React.FC<CompanyPeekPanelProps> = ({
  cnpj,
  name,
  peek,
  onConsultar,
  onReconsultar,
}) => {
  if (!peek) {
    return (
      <Section
        mark={<Icons.Search size={12} />}
        title="O que há sobre esta empresa"
        subtitle="Cadastro, sanções e publicações, sem sair deste dossiê"
      >
        <p className="text-sm leading-relaxed text-ink-2">
          A consulta é feita na hora, nas mesmas fontes públicas do dossiê. Ela serve para decidir se
          esta empresa merece uma diligência própria — e não substitui essa diligência.
        </p>

        <Button
          variant="secondary"
          block
          onClick={onConsultar}
          icon={<Icons.Search size={15} aria-hidden="true" />}
          className="mt-3"
        >
          Consultar esta empresa
        </Button>
      </Section>
    );
  }

  const { cadastro, sancoes, noticias } = peek;
  const company = cadastro.data;
  const ceisCount = countSanctions(sancoes.data?.ceis);
  const cnepCount = countSanctions(sancoes.data?.cnep);
  const sanctionRecords = [
    ...(sancoes.data?.ceis.registros || []).map((registro) => ({ registro, fonte: 'CEIS' })),
    ...(sancoes.data?.cnep.registros || []).map((registro) => ({ registro, fonte: 'CNEP' })),
  ];
  const news: AdverseMediaResult[] = noticias.data?.results || [];
  const carregando = [cadastro, sancoes, noticias].some((source) => source.state === 'loading');

  return (
    <Section
      mark={<Icons.Search size={12} />}
      title="O que há sobre esta empresa"
      subtitle={formatCnpj(cnpj)}
      trailing={
        carregando ? (
          <Icons.Loader size={15} aria-hidden="true" className="text-ink-3" />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={onReconsultar}
            aria-label="Consultar novamente"
            title="Consultar novamente"
            icon={<Icons.RefreshCw size={14} aria-hidden="true" />}
          />
        )
      }
      flush
    >
      {/* O aviso é permanente e fica antes do conteúdo: ele é a
          diferença entre uma espiada e uma diligência, e quem rola
          direto para os achados precisa passar por ele. */}
      <div className="px-4 pb-1 pt-3">
        <Note tone="info" icon={<Icons.Info size={15} aria-hidden="true" />}>
          Consulta pontual, sem classificação de risco e sem registro na trilha de auditoria. Para
          avaliar esta empresa, abra a diligência dela.
        </Note>
      </div>

      {/* ---- Cadastro ---- */}
      {cadastro.state === 'loading' ? <Loading label="Consultando o cadastro…" /> : null}
      {cadastro.state === 'error' ? (
        <SourceError source={cadastro} fallback="O cadastro não foi localizado." />
      ) : null}
      {cadastro.state === 'ok' && company ? (
        <div className="border-t border-line-soft px-4 py-3">
          <p className="mb-2 truncate text-sm font-bold text-ink">{company.razao_social || name}</p>
          <FactGrid columns={2}>
            <Fact label="Situação" value={company.descricao_situacao_cadastral || '—'} />
            <Fact label="Abertura" value={Formatters.date(company.data_inicio_atividade) || '—'} />
            <Fact
              label="Município"
              value={company.municipio ? `${company.municipio}${company.uf ? ` / ${company.uf}` : ''}` : '—'}
            />
            <Fact label="Integrantes do QSA" value={String(company.qsa?.length ?? 0)} />
          </FactGrid>
          {company.cnae_fiscal_descricao ? (
            <p className="mt-2 text-xs text-ink-3">{company.cnae_fiscal_descricao}</p>
          ) : null}
        </div>
      ) : null}

      {/* ---- Sanções ---- */}
      {sancoes.state === 'loading' ? <Loading label="Consultando CEIS e CNEP…" /> : null}
      {sancoes.state === 'error' ? (
        <SourceError source={sancoes} fallback="Os cadastros de sanção não responderam." />
      ) : null}
      {sancoes.state === 'ok' ? (
        <div className="border-t border-line-soft px-4 py-3">
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Sanções</span>
            <Chip tone={ceisCount > 0 ? 'high' : 'ok'} size="sm">
              CEIS: {ceisCount}
            </Chip>
            <Chip tone={cnepCount > 0 ? 'high' : 'ok'} size="sm">
              CNEP: {cnepCount}
            </Chip>
          </div>

          {sanctionRecords.length === 0 ? (
            <p className="text-xs text-ink-3">
              Nenhum registro nos dois cadastros para este CNPJ, na data da consulta.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sanctionRecords.slice(0, MAX_SANCTIONS).map(({ registro, fonte }, index) => (
                <li
                  key={`${fonte}-${registro.id ?? index}`}
                  className="min-w-0 rounded-md border border-high-line bg-high-bg px-2.5 py-1.5"
                >
                  <span className="block text-2xs font-bold uppercase tracking-wide text-high-text">
                    {fonte}
                    {registro.vigente === false ? ' · encerrada' : ''}
                  </span>
                  <span className="block text-xs text-ink-2">{registro.sancao || 'Sanção registrada'}</span>
                  {registro.orgao ? (
                    <span className="block truncate text-2xs text-ink-3">{registro.orgao}</span>
                  ) : null}
                </li>
              ))}
              {sanctionRecords.length > MAX_SANCTIONS ? (
                <li className="text-2xs text-ink-3">
                  e mais {sanctionRecords.length - MAX_SANCTIONS} registro(s) — a diligência desta
                  empresa traz todos.
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}

      {/* ---- Publicações ---- */}
      {noticias.state === 'loading' ? <Loading label="Procurando publicações…" /> : null}
      {noticias.state === 'error' ? (
        <SourceError source={noticias} fallback="A busca de publicações não foi concluída." />
      ) : null}
      {noticias.state === 'ok' ? (
        <div className="border-t border-line-soft px-4 py-3">
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-3">Publicações</span>
            <Chip tone={news.length > 0 ? 'warn' : 'neutral'} size="sm">
              {noticias.data?.totalFound ?? news.length} encontrada(s)
            </Chip>
            {noticias.data?.consultaParcial ? (
              <Chip tone="warn" size="sm" dot>
                busca parcial
              </Chip>
            ) : null}
          </div>

          {news.length === 0 ? (
            <p className="text-xs text-ink-3">
              Nenhuma publicação correlacionada a esta empresa nas fontes consultadas.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {news.slice(0, MAX_NEWS).map((item) => {
                const href = safeExternalUrl(item.canonicalUrl || item.url);
                return (
                  <li key={item.id} className="min-w-0">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block min-w-0 rounded-md border border-line px-2.5 py-1.5 transition-colors hover:border-brand-line hover:bg-brand-soft"
                      >
                        <span className="block text-xs font-semibold leading-snug text-ink">
                          {item.title}
                        </span>
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-ink-3">
                          <span className="truncate">{item.domain}</span>
                          {item.publishedAt ? <span>· {Formatters.date(item.publishedAt)}</span> : null}
                          {item.riskRelevant === false ? <span>· menção geral</span> : null}
                        </span>
                      </a>
                    ) : (
                      <span className="block text-xs text-ink-2">{item.title}</span>
                    )}
                  </li>
                );
              })}
              {news.length > MAX_NEWS ? (
                <li className="text-2xs text-ink-3">
                  e mais {news.length - MAX_NEWS} publicação(ões) — a diligência desta empresa traz
                  todas, com validação e descarte.
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </Section>
  );
};
