// ==========================================================
// DILIGÊNCIA 360 — Guarda da avaliação de integridade
//
// O questionário vivia só no `localStorage` do navegador de quem o
// colou. Trocar de máquina, limpar o cache ou passar o dossiê para
// outra pessoa significava colar a transcrição de novo e reconferir
// item a item — o trabalho mais caro da tela, refeito por falta de onde
// guardar.
//
// Aqui ele passa a ir para o retrato da diligência, no Google Sheets.
// O rascunho local continua existindo como a camada rápida: ele salva a
// cada tecla e sobrevive a um F5 mesmo sem rede. O retrato é a camada
// durável, e é escrito depois de a digitação parar.
//
// A escrita é adiada de propósito. Uma chamada por tecla estouraria a
// cota da planilha e deixaria a fila de gravação atrás da digitação.
// ==========================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../../../lib/api';

/** Tempo de silêncio antes de gravar. */
const ESPERA_MS = 2_500;

export type PersistenceStatus = 'ocioso' | 'pendente' | 'salvando' | 'salvo' | 'erro';

export interface IntegritySnapshot {
  answers: Record<string, boolean | null>;
  contractValueStr: string;
  extras: { choices: Record<string, boolean | null>; texts: Record<string, string> };
}

export function useIntegrityPersistence(diligenceId: string) {
  const [status, setStatus] = useState<PersistenceStatus>('ocioso');
  const [erro, setErro] = useState<string | null>(null);

  const timer = useRef<number | null>(null);
  const pendente = useRef<IntegritySnapshot | null>(null);
  // O que já está gravado, para não reescrever o que não mudou — abrir
  // o dossiê e sair não pode custar uma escrita na planilha.
  const gravado = useRef<string | null>(null);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const gravar = useCallback(async (dados: IntegritySnapshot) => {
    setStatus('salvando');
    setErro(null);
    try {
      await request(`/api/diligences/${diligenceId}/avaliacao`, {
        method: 'PATCH',
        body: JSON.stringify(dados),
      });
      gravado.current = JSON.stringify(dados);
      setStatus('salvo');
    } catch (error) {
      setStatus('erro');
      setErro(
        error instanceof Error
          ? `Não foi possível guardar no histórico: ${error.message}`
          : 'Não foi possível guardar o questionário no histórico.'
      );
    }
  }, [diligenceId]);

  /** Marca o que veio do banco como já gravado, para não regravá-lo. */
  const marcarComoGravado = useCallback((dados: IntegritySnapshot) => {
    gravado.current = JSON.stringify(dados);
  }, []);

  const agendar = useCallback((dados: IntegritySnapshot) => {
    const serializado = JSON.stringify(dados);
    if (serializado === gravado.current) return;

    pendente.current = dados;
    setStatus('pendente');

    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const alvo = pendente.current;
      pendente.current = null;
      if (alvo) void gravar(alvo);
    }, ESPERA_MS);
  }, [gravar]);

  /** Grava agora o que estiver pendente — para o "tentar de novo". */
  const gravarAgora = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const alvo = pendente.current;
    pendente.current = null;
    if (alvo) return gravar(alvo);
    return Promise.resolve();
  }, [gravar]);

  return { status, erro, agendar, gravarAgora, marcarComoGravado };
}
