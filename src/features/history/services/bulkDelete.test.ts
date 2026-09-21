// ==========================================================
// DILIGÊNCIA 360 — Remoção em lote
//
// O que importa aqui só se manifesta quando algo falha no meio: o que
// já saiu não volta, então parar na primeira falha deixaria a lista num
// estado que ninguém pediu e sem dizer onde parou.
// ==========================================================

import { describe, it, expect } from 'vitest';
import { removeInSeries } from './bulkDelete';

describe('removeInSeries', () => {
  it('remove todos quando nada falha', async () => {
    const chamados: string[] = [];
    const resultado = await removeInSeries(['a', 'b', 'c'], async (id) => { chamados.push(id); });

    expect(resultado.removidos).toBe(3);
    expect(resultado.falhas).toEqual([]);
    expect(chamados).toEqual(['a', 'b', 'c']);
  });

  it('uma falha no meio não interrompe as demais', async () => {
    const chamados: string[] = [];
    const resultado = await removeInSeries(['a', 'b', 'c'], async (id) => {
      chamados.push(id);
      if (id === 'b') throw new Error('servidor recusou');
    });

    expect(chamados).toEqual(['a', 'b', 'c']);
    expect(resultado.removidos).toBe(2);
    expect(resultado.falhas).toEqual([{ id: 'b', motivo: 'servidor recusou' }]);
  });

  it('cada falha volta nomeada, para a tela poder dizer quais ficaram', async () => {
    const resultado = await removeInSeries(['a', 'b'], async () => {
      throw new Error('fora do ar');
    });

    expect(resultado.removidos).toBe(0);
    expect(resultado.falhas.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('erro que não é Error ainda produz um motivo legível', async () => {
    const resultado = await removeInSeries(['a'], async () => { throw 'texto solto'; });

    expect(resultado.falhas[0].motivo).toBe('falha não identificada');
  });

  it('uma de cada vez: a próxima só começa quando a anterior termina', async () => {
    let emVoo = 0;
    let maximoSimultaneo = 0;

    await removeInSeries(['a', 'b', 'c', 'd'], async () => {
      emVoo += 1;
      maximoSimultaneo = Math.max(maximoSimultaneo, emVoo);
      await new Promise((resolve) => { setTimeout(resolve, 1); });
      emVoo -= 1;
    });

    // Em paralelo, a API recusaria metade por limite de requisições.
    expect(maximoSimultaneo).toBe(1);
  });

  it('lista vazia não chama nada', async () => {
    let chamou = false;
    const resultado = await removeInSeries([], async () => { chamou = true; });

    expect(chamou).toBe(false);
    expect(resultado).toEqual({ removidos: 0, falhas: [] });
  });
});
