// ==========================================================
// DILIGÊNCIA 360 — Espiada numa empresa vinculada
// ==========================================================
// Orquestra as consultas de uma empresa do mapa reaproveitando as
// rotas que o dossiê já usa. Não há rota nova no servidor: são as
// mesmas de cadastro, CEIS, CNEP e publicações, cada uma já aceitando
// um CNPJ solto.
//
// As consultas não são disparadas juntas por acaso. Cadastro, CEIS e
// CNEP saem de imediato, em paralelo. As publicações esperam o
// cadastro, porque é ele que traz razão social oficial, nome
// fantasia, município e UF — as âncoras que a resolução de identidade
// usa para separar a empresa certa de uma homônima. Buscar notícia
// sem essas âncoras devolve mais ruído do que sinal, e num mapa de
// vínculos ruído com aparência de achado é pior do que lacuna.
// ==========================================================

import { useCallback, useRef, useState } from 'react';
import { DiligenceService } from '../services/diligence.service';
import { CNPJ } from '../../../lib/cnpj';
import { classifyCompany, classifyNews, classifySanctions } from '../utils/companyPeek';
import type { CompanyData } from '../types';
import type { CompanyPeek, CompanyPeekIndex } from '../types/companyPeek.types';

function emptyPeek(cnpj: string, name: string): CompanyPeek {
  return {
    cnpj,
    name,
    consultadoEm: new Date().toISOString(),
    cadastro: { state: 'loading' },
    sancoes: { state: 'loading' },
    noticias: { state: 'loading' },
  };
}

export interface UseCompanyPeek {
  /** Espiadas já feitas nesta sessão, por CNPJ. */
  peeks: CompanyPeekIndex;
  consultar: (cnpj: string, name: string) => void;
  /** Refaz a consulta ignorando o que já está em memória. */
  reconsultar: (cnpj: string, name: string) => void;
}

export function useCompanyPeek(): UseCompanyPeek {
  const [peeks, setPeeks] = useState<CompanyPeekIndex>({});
  // Consultas em curso, para que dois toques seguidos no mesmo nó não
  // disparem a mesma busca duas vezes.
  const inFlightRef = useRef<Set<string>>(new Set());
  // Espelho do estado para leitura fora do ciclo de renderização. Sem
  // ele, saber "esta empresa já foi consultada?" exigiria decidir
  // dentro do atualizador do `useState` — que o React pode chamar duas
  // vezes, e que não é lugar de disparar requisição.
  const consultedRef = useRef<Set<string>>(new Set());

  const run = useCallback((rawCnpj: string, name: string, forceRefresh: boolean) => {
    const cnpj = CNPJ.clean(rawCnpj);
    if (cnpj.length !== 14 || inFlightRef.current.has(cnpj)) return;

    inFlightRef.current.add(cnpj);
    consultedRef.current.add(cnpj);
    setPeeks((current) => ({ ...current, [cnpj]: emptyPeek(cnpj, name) }));

    // Cada fonte grava só a sua parte. Escrever o objeto inteiro faria
    // a resposta mais lenta apagar a mais rápida.
    const patch = (change: Partial<CompanyPeek>) => {
      setPeeks((current) => {
        const existing = current[cnpj];
        if (!existing) return current;
        return { ...current, [cnpj]: { ...existing, ...change } };
      });
    };

    const cadastroPromise = DiligenceService.getCompany(cnpj)
      .then((response) => {
        const source = classifyCompany(response);
        patch({ cadastro: source });
        return source.data;
      })
      .catch((error: unknown) => {
        patch({
          cadastro: {
            state: 'error',
            erro: error instanceof Error ? error.message : 'Falha na consulta cadastral.',
          },
        });
        return undefined;
      });

    Promise.all([DiligenceService.getCEIS(cnpj), DiligenceService.getCNEP(cnpj)])
      .then(([ceis, cnep]) => patch({ sancoes: classifySanctions(ceis, cnep) }))
      .catch((error: unknown) => {
        patch({
          sancoes: {
            state: 'error',
            erro: error instanceof Error ? error.message : 'Falha na consulta de sanções.',
          },
        });
      });

    cadastroPromise
      .then((company: CompanyData | undefined) =>
        DiligenceService.searchAdverseMedia({
          cnpj,
          razaoSocial: company?.razao_social || name,
          nomeFantasia: company?.nome_fantasia || undefined,
          municipio: company?.municipio || undefined,
          uf: company?.uf || undefined,
          // A espiada olha a empresa, não o quadro societário dela:
          // expandir para as pessoas multiplicaria as consultas e
          // atravessaria o escopo, que é o vínculo em foco.
          shareholders: [],
          forceRefresh,
        }),
      )
      .then((summary) => patch({ noticias: classifyNews(summary) }))
      .catch((error: unknown) => {
        patch({
          noticias: {
            state: 'error',
            erro: error instanceof Error ? error.message : 'Falha na busca de publicações.',
          },
        });
      })
      .finally(() => {
        inFlightRef.current.delete(cnpj);
      });
  }, []);

  const consultar = useCallback(
    (cnpj: string, name: string) => {
      // Já consultada nesta sessão: o painel mostra o que está em
      // memória em vez de bater nas fontes de novo a cada toque.
      if (consultedRef.current.has(CNPJ.clean(cnpj))) return;
      run(cnpj, name, false);
    },
    [run],
  );

  const reconsultar = useCallback(
    (cnpj: string, name: string) => {
      inFlightRef.current.delete(CNPJ.clean(cnpj));
      run(cnpj, name, true);
    },
    [run],
  );

  return { peeks, consultar, reconsultar };
}
