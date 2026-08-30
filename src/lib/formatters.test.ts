import { describe, it, expect } from 'vitest';
import { Formatters } from './formatters';

describe('Formatters.date', () => {
  it('converte ISO para o padrão brasileiro', () => {
    expect(Formatters.date('2026-08-30')).toBe('30/08/2026');
    expect(Formatters.date('2026-08-30T14:25:00.000Z')).toBe('30/08/2026');
  });

  it('devolve intacto o que já está em DD/MM/AAAA', () => {
    expect(Formatters.date('30/08/2026')).toBe('30/08/2026');
  });

  // A conversão de ISO é feita por regex, sem passar pelo Date, justamente
  // para o fuso não empurrar a data um dia para trás.
  it('não desloca o dia por fuso horário', () => {
    expect(Formatters.date('2026-01-01')).toBe('01/01/2026');
    expect(Formatters.date('2026-12-31')).toBe('31/12/2026');
  });

  it('devolve "Não informado" para vazio, nulo e lixo', () => {
    for (const v of ['', null, undefined, '—', 'null', 'undefined', 'Invalid Date', 'abacaxi', {}, []]) {
      expect(Formatters.date(v), String(v)).toBe('Não informado');
    }
  });
});

describe('Formatters.dateTime', () => {
  it('devolve "Não informado" para entrada inválida', () => {
    expect(Formatters.dateTime('')).toBe('Não informado');
    expect(Formatters.dateTime('abacaxi')).toBe('Não informado');
    expect(Formatters.dateTime(null)).toBe('Não informado');
  });

  it('inclui data e hora para timestamp válido', () => {
    const saida = Formatters.dateTime('2026-08-30T14:25:00.000Z');
    expect(saida).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(saida).toMatch(/\d{2}:\d{2}/);
  });
});

describe('Formatters.time', () => {
  it('usa travessão como ausência, não "Não informado"', () => {
    expect(Formatters.time('')).toBe('—');
    expect(Formatters.time('abacaxi')).toBe('—');
  });

  it('inclui segundos', () => {
    expect(Formatters.time('2026-08-30T14:25:33.000Z')).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});

describe('Formatters.currency', () => {
  it('formata em reais', () => {
    // O Intl usa espaço não separável (U+00A0) depois do símbolo; a
    // comparação normaliza para o espaço comum.
    const brl = (v: unknown) => Formatters.currency(v).replace(/\u00A0/g, ' ');
    expect(brl(1234.5)).toBe('R$ 1.234,50');
    expect(brl(0)).toBe('R$ 0,00');
  });

  it('aceita número em texto', () => {
    expect(Formatters.currency('99.9').replace(/\u00A0/g, ' ')).toBe('R$ 99,90');
  });

  it('devolve zero para entrada não numérica, em vez de NaN na tela', () => {
    expect(Formatters.currency('abacaxi').replace(/\u00A0/g, ' ')).toBe('R$ 0,00');
    expect(Formatters.currency(undefined).replace(/\u00A0/g, ' ')).toBe('R$ 0,00');
  });
});

describe('Formatters.truncate', () => {
  it('não mexe em texto dentro do limite', () => {
    expect(Formatters.truncate('EMPRESA LTDA')).toBe('EMPRESA LTDA');
  });

  it('corta e acrescenta reticências acima do limite', () => {
    const r = Formatters.truncate('a'.repeat(80));
    expect(r).toHaveLength(61);          // 60 caracteres + o sinal de corte
    expect(r.endsWith('…')).toBe(true);
  });

  it('respeita limite personalizado', () => {
    expect(Formatters.truncate('abcdefghij', 4)).toBe('abcd…');
  });

  it('usa travessão para vazio', () => {
    expect(Formatters.truncate('')).toBe('—');
    expect(Formatters.truncate(null)).toBe('—');
  });
});
