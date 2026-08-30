import { describe, it, expect } from 'vitest';
import { CNJ } from './cnj';

// Números reais quanto ao dígito verificador (mod 97 do padrão CNJ).
const TJPE = '00012346820208170001';   // 0001234-68.2020.8.17.0001
const TRT6 = '00099991220225060002';   // 0009999-12.2022.5.06.0002

describe('CNJ.validate', () => {
  it('aceita numeração com dígito verificador correto', () => {
    expect(CNJ.validate(TJPE)).toBe(true);
    expect(CNJ.validate('0001234-68.2020.8.17.0001')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(CNJ.validate('00012349920208170001')).toBe(false);
  });

  it('recusa comprimento diferente de 20', () => {
    expect(CNJ.validate('0001234682020817000')).toBe(false);
    expect(CNJ.validate('')).toBe(false);
  });

  it('recusa ano fora da faixa plausível', () => {
    // DV coerente de propósito: o que reprova é a regra de ano, não o mod 97.
    expect(CNJ.validate('00012347918008170001')).toBe(false);
  });

  it('recusa segmento do judiciário fora de 1..9', () => {
    // Também com DV coerente, para provar a guarda do segmento.
    expect(CNJ.validate('00012343720200170001')).toBe(false);
  });
});

describe('CNJ.format', () => {
  it('formata os 20 dígitos no padrão do CNJ', () => {
    expect(CNJ.format(TJPE)).toBe('0001234-68.2020.8.17.0001');
  });

  it('devolve a entrada intacta quando não tem 20 dígitos', () => {
    expect(CNJ.format('123')).toBe('123');
  });
});

describe('CNJ.mask', () => {
  it('vai formatando conforme a digitação avança', () => {
    expect(CNJ.mask('0001234')).toBe('0001234');
    expect(CNJ.mask('000123468')).toBe('0001234-68');
    expect(CNJ.mask('0001234682020')).toBe('0001234-68.2020');
    expect(CNJ.mask(TJPE)).toBe('0001234-68.2020.8.17.0001');
  });

  it('descarta o excesso além de 20 dígitos', () => {
    expect(CNJ.mask(TJPE + '999')).toBe('0001234-68.2020.8.17.0001');
  });
});

describe('CNJ.extractFromText', () => {
  it('encontra número pontuado no meio do texto', () => {
    const achados = CNJ.extractFromText('A ação 0001234-68.2020.8.17.0001 corre em Recife.');
    expect(achados).toHaveLength(1);
    expect(achados[0].normalized).toBe(TJPE);
    expect(achados[0].formatted).toBe('0001234-68.2020.8.17.0001');
    expect(achados[0].tribunalKey).toBe('8.17');
  });

  it('encontra número sem pontuação', () => {
    const achados = CNJ.extractFromText(`Processo ${TJPE} distribuído.`);
    expect(achados).toHaveLength(1);
    expect(achados[0].normalized).toBe(TJPE);
  });

  // Esta é a garantia que impede o dossiê de inventar processo a partir de
  // qualquer sequência de 20 dígitos que apareça numa notícia.
  it('descarta sequência de 20 dígitos com verificador inválido', () => {
    expect(CNJ.extractFromText('Código 12345678901234567890 no boleto.')).toHaveLength(0);
  });

  it('não duplica o mesmo processo citado em formatos diferentes', () => {
    const achados = CNJ.extractFromText(`0001234-68.2020.8.17.0001 e também ${TJPE}`);
    expect(achados).toHaveLength(1);
  });

  it('encontra vários processos distintos no mesmo texto', () => {
    const achados = CNJ.extractFromText(`Autos ${TJPE} e ${TRT6} em curso.`);
    expect(achados.map((a) => a.normalized).sort()).toEqual([TJPE, TRT6].sort());
  });

  it('devolve lista vazia para entrada não textual', () => {
    expect(CNJ.extractFromText('')).toEqual([]);
    expect(CNJ.extractFromText(null as unknown as string)).toEqual([]);
  });
});
