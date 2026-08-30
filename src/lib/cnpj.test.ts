import { describe, it, expect } from 'vitest';
import { CNPJ } from './cnpj';

describe('CNPJ.validate', () => {
  it('aceita CNPJ numérico com dígitos verificadores corretos', () => {
    expect(CNPJ.validate('20.867.216/0001-66')).toBe(true);
    expect(CNPJ.validate('20867216000166')).toBe(true);
  });

  it('recusa dígito verificador errado', () => {
    expect(CNPJ.validate('20867216000167')).toBe(false);
  });

  it('recusa comprimento diferente de 14', () => {
    expect(CNPJ.validate('2086721600016')).toBe(false);
    expect(CNPJ.validate('208672160001666')).toBe(false);
    expect(CNPJ.validate('')).toBe(false);
  });

  // A RFB passou a emitir CNPJ com letras; a validação usa ASCII-48 por caractere.
  it('aceita o formato alfanumérico da RFB', () => {
    expect(CNPJ.validate('12ABC34501DE35')).toBe(true);
  });

  it('recusa alfanumérico com verificador errado', () => {
    expect(CNPJ.validate('12ABC34501DE36')).toBe(false);
  });
});

describe('CNPJ.clean', () => {
  it('remove pontuação e normaliza para maiúsculas', () => {
    expect(CNPJ.clean('20.867.216/0001-66')).toBe('20867216000166');
    expect(CNPJ.clean('12abc34501de35')).toBe('12ABC34501DE35');
  });
});

describe('CNPJ.format', () => {
  it('formata no padrão oficial', () => {
    expect(CNPJ.format('20867216000166')).toBe('20.867.216/0001-66');
  });

  it('devolve a entrada intacta quando não tem 14 posições', () => {
    expect(CNPJ.format('123')).toBe('123');
  });
});

describe('CNPJ.mask', () => {
  it('vai aplicando a máscara conforme a digitação avança', () => {
    expect(CNPJ.mask('20')).toBe('20');
    expect(CNPJ.mask('20867')).toBe('20.867');
    expect(CNPJ.mask('20867216')).toBe('20.867.216');
    expect(CNPJ.mask('208672160001')).toBe('20.867.216/0001');
    expect(CNPJ.mask('20867216000166')).toBe('20.867.216/0001-66');
  });

  it('descarta o excesso além de 14 posições', () => {
    expect(CNPJ.mask('2086721600016699999')).toBe('20.867.216/0001-66');
  });

  it('ignora o que o usuário colar de pontuação', () => {
    expect(CNPJ.mask('20.867.216/0001-66')).toBe('20.867.216/0001-66');
  });
});
