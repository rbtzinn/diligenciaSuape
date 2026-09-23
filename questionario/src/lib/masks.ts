// ==========================================================
// DILIGÊNCIA 360 — Máscaras de campo
//
// Documento, data e valor têm forma fixa, e até aqui cada campo
// aceitava o que o analista digitasse. Isso custa de dois lados: quem
// digita precisa lembrar onde vai ponto, barra e vírgula; e quem lê o
// Mapa de Risco depois encontra "5000000", "5.000.000" e "R$ 5 mi" na
// mesma coluna, porque três pessoas escreveram de três jeitos.
//
// A máscara resolve os dois: ela formata enquanto se digita e, como o
// valor guardado passa a ter forma única, o que chega à planilha é
// comparável.
//
// REGRA DE TODAS ELAS: máscara formata, não valida e não completa.
// Digitar "31/02/2026" continua possível — data impossível é problema
// de validação, e inventar o dia certo seria pior do que aceitar o
// errado. Nenhuma função aqui rejeita entrada; todas aceitam texto
// parcial, porque o campo é lido a cada tecla.
// ==========================================================

import { CNPJ } from './cnpj';
import { CNJ } from './cnj';

const onlyDigits = (value: string): string => String(value ?? '').replace(/\D/g, '');
const alphanumeric = (value: string): string => String(value ?? '').replace(/[^a-zA-Z0-9]/g, '');

/**
 * 00.000.000/0000-00, inclusive na forma alfanumérica da Receita.
 *
 * Delega para `CNPJ.mask`, que já existia e aceita letra. Reescrever
 * aqui com `\D` pareceria mais simples e apagaria silenciosamente o
 * CNPJ alfanumérico — que é válido e está em uso.
 */
export function maskCnpj(value: string): string {
  return CNPJ.mask(value);
}

/** 000.000.000-00 */
export function maskCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/**
 * CPF ou CNPJ conforme o que já foi digitado.
 *
 * Só vira CNPJ no 12º dígito: antes disso os dois documentos têm a
 * mesma pontuação, e trocar a máscara no meio faria o texto pular
 * debaixo do dedo de quem digita.
 */
export function maskCpfCnpj(value: string): string {
  const limpo = alphanumeric(value);
  // Letra só existe em CNPJ; sem letra, decide o comprimento.
  const ehCnpj = /[a-zA-Z]/.test(limpo) || limpo.length > 11;
  return ehCnpj ? maskCnpj(limpo) : maskCpf(limpo);
}

/** dd/mm/aaaa */
export function maskDate(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** aaaa — ano de exercício. */
export function maskYear(value: string): string {
  return onlyDigits(value).slice(0, 4);
}

/** 00000-000 */
export function maskCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** (00) 00000-0000, aceitando fixo de oito dígitos. */
export function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Valor em reais, digitado dos centavos para cima.
 *
 * O dígito entra sempre pela direita: "5" vira 0,05, depois 0,50, depois
 * 5,00. É o comportamento de caixa registradora, e é o único que
 * dispensa o usuário de acertar a vírgula — que é justamente onde o
 * valor de contrato costuma sair errado por uma casa decimal.
 */
export function maskCurrency(value: string): string {
  const d = onlyDigits(value).slice(0, 15);
  if (!d) return '';
  const centavos = Number(d);
  return (centavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 0000000.00000/0000-00 — número de processo SEI. */
export function maskProcessoSei(value: string): string {
  const d = onlyDigits(value).slice(0, 18);
  if (d.length <= 7) return d;
  if (d.length <= 12) return `${d.slice(0, 7)}.${d.slice(7)}`;
  if (d.length <= 16) return `${d.slice(0, 7)}.${d.slice(7, 12)}/${d.slice(12)}`;
  return `${d.slice(0, 7)}.${d.slice(7, 12)}/${d.slice(12, 16)}-${d.slice(16)}`;
}

/**
 * 0000000-00.0000.0.00.0000 — numeração única do CNJ.
 *
 * Delega para `CNJ.mask`, pelo mesmo motivo do CNPJ: a regra do número
 * de processo já existia e é usada na descoberta de processos. Duas
 * implementações do mesmo formato divergiriam com o tempo.
 */
export function maskProcessoCnj(value: string): string {
  return CNJ.mask(value);
}

export type MaskName =
  | 'cnpj'
  | 'cpf'
  | 'cpfCnpj'
  | 'date'
  | 'year'
  | 'cep'
  | 'phone'
  | 'currency'
  | 'processoSei'
  | 'processoCnj';

export const MASKS: Record<MaskName, (value: string) => string> = {
  cnpj: maskCnpj,
  cpf: maskCpf,
  cpfCnpj: maskCpfCnpj,
  date: maskDate,
  year: maskYear,
  cep: maskCep,
  phone: maskPhone,
  currency: maskCurrency,
  processoSei: maskProcessoSei,
  processoCnj: maskProcessoCnj,
};

/** Só os dígitos — o que vai para a API, a planilha e a comparação. */
export function unmask(value: string): string {
  return onlyDigits(value);
}

/** Documento sem pontuação, preservando letra do CNPJ alfanumérico. */
export function unmaskDocument(value: string): string {
  return alphanumeric(value).toUpperCase();
}

/**
 * Valor em reais como número.
 *
 * "1.234,56" → 1234.56. Devolve `null` quando não há dígito nenhum, em
 * vez de 0: campo vazio e contrato de zero real são coisas diferentes, e
 * a classificação de SUAPE depende de saber qual é qual.
 */
export function currencyToNumber(value: string): number | null {
  const d = onlyDigits(value);
  if (!d) return null;
  return Number(d) / 100;
}

/** Número para o texto do campo: 1234.56 → "1.234,56". */
export function numberToCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return maskCurrency(String(Math.round(value * 100)));
}
