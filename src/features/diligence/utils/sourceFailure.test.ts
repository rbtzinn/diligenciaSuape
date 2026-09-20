import { describe, it, expect } from 'vitest';
import { describeSourceFailure } from './sourceFailure';

describe('describeSourceFailure', () => {
  it('só diz "Fonte indisponível" quando não há motivo nenhum', () => {
    expect(describeSourceFailure(undefined)).toBe('Fonte indisponível');
    expect(describeSourceFailure(null)).toBe('Fonte indisponível');
    expect(describeSourceFailure('   ')).toBe('Fonte indisponível');
  });

  it('separa tempo esgotado de fonte fora do ar', () => {
    expect(describeSourceFailure('Tempo limite excedido na consulta')).toBe('Tempo esgotado');
    expect(describeSourceFailure('timeout')).toBe('Tempo esgotado');
    expect(describeSourceFailure('Não foi possível falar com o servidor')).toBe('Servidor não respondeu');
    expect(describeSourceFailure('Failed to fetch')).toBe('Servidor não respondeu');
  });

  it('preserva a mensagem da própria fonte, que é mais precisa que um rótulo genérico', () => {
    expect(describeSourceFailure('Querido Diário recusou a consulta (429)')).toBe(
      'Querido Diário recusou a consulta (429)'
    );
  });

  it('encurta mensagem longa para caber na etapa', () => {
    const rotulo = describeSourceFailure('x'.repeat(200));
    expect(rotulo).toHaveLength(61);
    expect(rotulo.endsWith('…')).toBe(true);
  });
});
