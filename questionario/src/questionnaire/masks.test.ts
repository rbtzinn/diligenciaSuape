import { describe, it, expect } from 'vitest';
import { maskEmail, maskInteger, maskPercent, maskPeriod, maskCpfCnpj, maskPhone, maskDate } from '../lib/masks';
import { formatProblem, isValidDate } from './questionnaireState';

describe('máscaras', () => {
  it('número inteiro: só dígitos, sem zero à esquerda', () => {
    expect(maskInteger('061 empregados')).toBe('61');
  });

  it('percentual: vírgula decimal, até duas casas, no máximo 100', () => {
    expect(maskPercent('33.335')).toBe('33,33');
    expect(maskPercent('250')).toBe('100');
    expect(maskPercent('100,5')).toBe('100');
    expect(maskPercent(',5')).toBe('0,5');
    expect(maskPercent('50%')).toBe('50');
  });

  it('período: aaaa-aaaa', () => {
    expect(maskPeriod('20242027')).toBe('2024-2027');
    expect(maskPeriod('2024')).toBe('2024');
  });

  it('e-mail: sem espaço e minúsculo', () => {
    expect(maskEmail(' Contato@TMP.com.br ')).toBe('contato@tmp.com.br');
  });

  it('documentos, telefone e data seguem o padrão', () => {
    expect(maskCpfCnpj('52998224725')).toBe('529.982.247-25');
    expect(maskCpfCnpj('02639582000186')).toBe('02.639.582/0001-86');
    expect(maskPhone('81994195973')).toBe('(81) 99419-5973');
    expect(maskDate('09052024')).toBe('09/05/2024');
  });
});

describe('validação de formato', () => {
  it('data precisa existir no calendário', () => {
    expect(isValidDate('29/02/2024')).toBe(true);
    expect(isValidDate('31/02/2026')).toBe(false);
    expect(formatProblem('date', '09/05')).toContain('data inválida');
  });

  it('CPF/CNPJ aceita qualquer um dos dois, se válido', () => {
    expect(formatProblem('cpfCnpj', '529.982.247-25')).toBeNull();
    expect(formatProblem('cpfCnpj', '02.639.582/0001-86')).toBeNull();
    expect(formatProblem('cpfCnpj', '111.111.111-11')).toContain('inválido');
  });

  it('telefone exige DDD, período exige início antes do fim', () => {
    expect(formatProblem('phone', '(81) 3527')).toContain('DDD');
    expect(formatProblem('period', '2027-2024')).toContain('período inválido');
    expect(formatProblem('period', '2024-2027')).toBeNull();
  });

  it('campo vazio não é erro de formato', () => {
    expect(formatProblem('cpf', '')).toBeNull();
  });
});
