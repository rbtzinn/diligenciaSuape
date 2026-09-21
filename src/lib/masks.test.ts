// ==========================================================
// DILIGÊNCIA 360 — Máscaras
//
// Máscara roda a cada tecla, sobre texto sempre incompleto. O que estes
// testes fixam é o comportamento nesse meio do caminho, e duas regras
// que já custaram caro no projeto: o CNPJ alfanumérico da Receita não
// pode perder as letras, e o valor entra pelos centavos, porque é a casa
// decimal do valor de contrato que decide a classificação de SUAPE.
// ==========================================================

import { describe, it, expect } from 'vitest';
import {
  maskCnpj,
  maskCpf,
  maskCpfCnpj,
  maskDate,
  maskYear,
  maskCep,
  maskPhone,
  maskCurrency,
  maskProcessoSei,
  maskProcessoCnj,
  unmask,
  unmaskDocument,
  currencyToNumber,
  numberToCurrency,
} from './masks';

describe('documentos', () => {
  it('formata o CNPJ enquanto se digita', () => {
    expect(maskCnpj('20')).toBe('20');
    expect(maskCnpj('20867')).toBe('20.867');
    expect(maskCnpj('20867216')).toBe('20.867.216');
    expect(maskCnpj('208672160001')).toBe('20.867.216/0001');
    expect(maskCnpj('20867216000166')).toBe('20.867.216/0001-66');
  });

  it('preserva a letra do CNPJ alfanumérico da Receita', () => {
    expect(maskCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35');
    expect(unmaskDocument('12.ABC.345/01DE-35')).toBe('12ABC34501DE35');
  });

  it('não deixa passar do tamanho do documento', () => {
    expect(maskCnpj('2086721600016699999')).toBe('20.867.216/0001-66');
    expect(maskCpf('123456789012345')).toBe('123.456.789-01');
  });

  it('formata o CPF enquanto se digita', () => {
    expect(maskCpf('123')).toBe('123');
    expect(maskCpf('123456')).toBe('123.456');
    expect(maskCpf('12345678')).toBe('123.456.78');
    expect(maskCpf('12345678901')).toBe('123.456.789-01');
  });

  it('só vira CNPJ depois do 11º dígito, para o texto não pular sob o dedo', () => {
    expect(maskCpfCnpj('12345678901')).toBe('123.456.789-01');
    expect(maskCpfCnpj('123456789012')).toBe('12.345.678/9012');
  });

  it('texto com letra é tratado como CNPJ mesmo curto', () => {
    expect(maskCpfCnpj('12ABC345')).toBe('12.ABC.345');
  });
});

describe('data e ano', () => {
  it('formata dd/mm/aaaa enquanto se digita', () => {
    expect(maskDate('3')).toBe('3');
    expect(maskDate('31')).toBe('31');
    expect(maskDate('3112')).toBe('31/12');
    expect(maskDate('31122026')).toBe('31/12/2026');
    expect(maskDate('311220261')).toBe('31/12/2026');
  });

  it('formata, mas não valida: data impossível continua passando', () => {
    // Corrigir "31/02" aqui significaria inventar o dia que o usuário
    // quis. Data impossível é assunto de validação, não de máscara.
    expect(maskDate('31022026')).toBe('31/02/2026');
  });

  it('ano tem no máximo quatro dígitos', () => {
    expect(maskYear('20265')).toBe('2026');
  });
});

describe('valor em reais', () => {
  it('entra pelos centavos, como caixa registradora', () => {
    expect(maskCurrency('5')).toBe('0,05');
    expect(maskCurrency('50')).toBe('0,50');
    expect(maskCurrency('500')).toBe('5,00');
    expect(maskCurrency('500000000')).toBe('5.000.000,00');
  });

  it('campo vazio continua vazio', () => {
    expect(maskCurrency('')).toBe('');
    expect(maskCurrency('abc')).toBe('');
  });

  it('lê o valor de volta sem perder a casa decimal', () => {
    expect(currencyToNumber('5.000.000,00')).toBe(5_000_000);
    expect(currencyToNumber('1.234,56')).toBe(1234.56);
    expect(currencyToNumber('0,05')).toBe(0.05);
  });

  it('vazio é null, e não zero: contrato de zero real é outra coisa', () => {
    expect(currencyToNumber('')).toBeNull();
    expect(currencyToNumber('R$')).toBeNull();
    expect(currencyToNumber('0,00')).toBe(0);
  });

  it('número volta para o texto do campo sem desvio de arredondamento', () => {
    expect(numberToCurrency(1234.56)).toBe('1.234,56');
    expect(numberToCurrency(0)).toBe('0,00');
    expect(numberToCurrency(null)).toBe('');
    expect(currencyToNumber(numberToCurrency(987_654.32))).toBe(987_654.32);
  });
});

describe('processos e demais campos padronizados', () => {
  it('formata o processo SEI', () => {
    expect(maskProcessoSei('123456700001202600')).toBe('1234567.00001/2026-00');
  });

  it('formata a numeração única do CNJ', () => {
    expect(maskProcessoCnj('00012345620268170001')).toBe('0001234-56.2026.8.17.0001');
  });

  it('formata CEP e telefone', () => {
    expect(maskCep('55590000')).toBe('55590-000');
    expect(maskPhone('8199998888')).toBe('(81) 9999-8888');
    expect(maskPhone('81999998888')).toBe('(81) 99999-8888');
  });
});

describe('estabilidade', () => {
  it('aplicar a máscara de novo sobre o texto já formatado não muda nada', () => {
    const casos: Array<[(v: string) => string, string]> = [
      [maskCnpj, '20867216000166'],
      [maskCpf, '12345678901'],
      [maskDate, '31122026'],
      [maskCep, '55590000'],
      [maskPhone, '81999998888'],
      [maskProcessoSei, '123456700001202600'],
      [maskProcessoCnj, '00012345620268170001'],
    ];

    for (const [fn, entrada] of casos) {
      const uma = fn(entrada);
      expect(fn(uma)).toBe(uma);
    }
  });

  it('unmask devolve só os dígitos', () => {
    expect(unmask('20.867.216/0001-66')).toBe('20867216000166');
    expect(unmask('R$ 1.234,56')).toBe('123456');
  });
});
