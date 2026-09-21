// ==========================================================
// DILIGÊNCIA 360 — Dados do Formulário de Diligência preenchido
//
// Monta o que o servidor precisa para desenhar o PDF no layout da aba
// "Avaliação de Integridade" da planilha oficial.
//
// A montagem mora aqui, e não no servidor, pelo mesmo motivo da linha
// do Mapa de Risco: as perguntas verbatim, o plano de ação, os
// critérios e as fórmulas de classificação já vivem neste lado. Uma
// segunda cópia no backend divergiria da tela com o tempo, e um PDF que
// discorda da tela é pior do que um PDF que não existe.
//
// O servidor, do outro lado, só desenha.
// ==========================================================

import type { DiligenceItem } from '../types';
import {
  SUAPE_QUESTION_TEXTS,
  SUAPE_ALCADA_CONSELHO_VALOR,
  SUAPE_REQUIRED_ITEMS,
  SUAPE_MATURITY_ITEMS,
  type IntegrityAnswers,
  type SuapeIntegrityEvaluationResult,
} from './suapeRiskMapRowGenerator';

export interface IntegrityFormProcessData {
  registro?: string;
  ano?: string;
  diretoria?: string;
  gestor?: string;
  valor?: string;
  dataEntrada?: string;
  dataSaida?: string;
  processoSei?: string;
}

/** Os cinco blocos do formulário, na ordem da planilha. */
const BLOCOS = [
  {
    numero: '01',
    titulo: 'Comprometimento da Alta Administração',
    itens: ['4.4', '5.2'] as const,
  },
  {
    numero: '02',
    titulo: 'Interação com a Administração Pública',
    itens: ['7.1', '7.2', '7.3', '7.4', '7.5', '7.6', '7.7', '7.8', '7.9'] as const,
  },
] as const;

/** Tabela T53:U57 da planilha — os critérios de cada faixa. */
const CRITERIOS = [
  {
    grupo: 'Muito Alto',
    criterio: 'Resposta positiva para os itens 4.4 e/ou 5.2 do Formulário do Questionário de Diligência do terceiro.',
  },
  {
    grupo: 'Alto',
    criterio: 'Não estar incluído nos critérios anteriores; resposta positiva para algum dos seguintes itens: '
      + '7.3, 7.4, 7.5, 7.6, 7.7, 7.8 ou 7.9; ou contratação autorizada por alçada do Conselho de Administração.',
  },
  {
    grupo: 'Médio',
    criterio: 'Não estar incluído nos critérios anteriores; resposta positiva para o item 7.1 ou 7.2 do Formulário.',
  },
  { grupo: 'Baixo', criterio: 'Não estar incluído nos critérios anteriores.' },
];

const moeda = (valor: number) => valor.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

function enderecoCompleto(empresa: DiligenceItem['empresa']): string {
  const partes = [
    [empresa?.logradouro, empresa?.numero].filter(Boolean).join(', '),
    empresa?.complemento,
    empresa?.bairro,
    [empresa?.municipio, empresa?.uf].filter(Boolean).join('/'),
    empresa?.cep,
  ].filter((parte) => String(parte || '').trim());

  return partes.join(' — ');
}

/**
 * Texto para campo que a Receita não publica.
 *
 * "Não informado" e vazio são coisas diferentes num documento que vai a
 * processo: o primeiro diz que a informação foi procurada e não está em
 * fonte pública; o segundo parece descuido de preenchimento.
 */
const NAO_PUBLICO = 'Não informado em fonte pública';

export interface IntegrityFormPayload {
  empresa: Record<string, string>;
  classificacao: string;
  blocos: Array<{
    numero: string;
    titulo: string;
    nota?: string;
    perguntas: Array<{ codigo: string; texto: string; resposta: boolean | null }>;
  }>;
  maturidade: { percentual: string; nivel: string };
  planoDeAcao: string;
  criterios: Array<{ grupo: string; criterio: string }>;
  processo: IntegrityFormProcessData;
}

export function buildIntegrityFormPayload(
  diligence: DiligenceItem,
  answers: IntegrityAnswers,
  evaluation: SuapeIntegrityEvaluationResult,
  processo: IntegrityFormProcessData = {},
): IntegrityFormPayload {
  const empresa = diligence.empresa || {};

  const blocos: IntegrityFormPayload['blocos'] = BLOCOS.map((bloco) => ({
    numero: bloco.numero,
    titulo: bloco.titulo,
    perguntas: bloco.itens.map((item) => ({
      codigo: item,
      texto: SUAPE_QUESTION_TEXTS[item],
      // `undefined` e `null` significam a mesma coisa aqui: o terceiro
      // não respondeu. Só o booleano é declaração dele.
      resposta: answers[item] === true || answers[item] === false ? answers[item] : null,
    })),
  }));

  blocos.push({
    numero: '03',
    titulo: 'Valor da Contratação',
    perguntas: [{
      codigo: '—',
      texto: SUAPE_QUESTION_TEXTS.alcadaConselho,
      resposta: answers.alcadaConselho === true || answers.alcadaConselho === false
        ? answers.alcadaConselho
        : null,
    }],
    nota: `Alçada do Conselho de Administração a partir de ${moeda(SUAPE_ALCADA_CONSELHO_VALOR)}.`,
  });

  return {
    empresa: {
      razaoSocial: diligence.razaoSocial || empresa.razao_social || '',
      cnpj: diligence.cnpjFmt || diligence.cnpj || '',
      objetoSocial: empresa.cnae_fiscal_descricao || NAO_PUBLICO,
      ramoAtividade: empresa.cnae_fiscal
        ? `${empresa.cnae_fiscal_descricao || ''} (CNAE ${empresa.cnae_fiscal})`.trim()
        : NAO_PUBLICO,
      dataConstituicao: empresa.data_inicio_atividade || NAO_PUBLICO,
      numeroEmpregados: NAO_PUBLICO,
      endereco: enderecoCompleto(empresa) || NAO_PUBLICO,
      sitioEletronico: NAO_PUBLICO,
      paises: empresa.municipio ? 'Brasil' : NAO_PUBLICO,
      servico: NAO_PUBLICO,
    },
    // Vazio enquanto a classificação não pode ser apurada: o formulário
    // diz que ela depende do questionário, em vez de arbitrar uma faixa.
    classificacao: evaluation.calculatedRisk || '',
    blocos,
    maturidade: {
      // `null` quando nenhum item do bloco de maturidade foi respondido:
      // 0% afirmaria programa de integridade inexistente, que é
      // conclusão, não ausência de resposta.
      percentual: evaluation.maturity?.percent === null || evaluation.maturity?.percent === undefined
        ? 'Não apurado'
        : `${evaluation.maturity.percent}%`,
      nivel: evaluation.maturity?.level || 'Não apurado',
    },
    planoDeAcao: evaluation.recommendedAction || '',
    criterios: CRITERIOS,
    processo,
  };
}

// ==========================================================
// Preenchimento da planilha oficial
//
// Outro destino, outro formato. O PDF recebe textos prontos para
// desenhar; a planilha recebe só o que se digita nas células de
// entrada, porque quem calcula lá são as fórmulas de SUAPE.
// ==========================================================

export interface IntegritySheetPayload {
  cadastro: Record<string, string>;
  redFlags: Record<string, boolean | null>;
  maturidade: Record<string, boolean | null>;
  cadastros: Record<string, boolean>;
  classificacaoDoSistema: string;
}

/** Só o booleano é declaração; o resto é ausência de resposta. */
const declaracao = (valor: unknown): boolean | null => (
  valor === true || valor === false ? valor : null
);

export function buildIntegritySheetPayload(
  diligence: DiligenceItem,
  answers: IntegrityAnswers,
  evaluation: SuapeIntegrityEvaluationResult,
): IntegritySheetPayload {
  const empresa = diligence.empresa || {};

  const redFlags: Record<string, boolean | null> = {};
  for (const item of [...SUAPE_REQUIRED_ITEMS, 'alcadaConselho'] as const) {
    redFlags[item] = declaracao((answers as Record<string, unknown>)[item]);
  }

  const maturidade: Record<string, boolean | null> = {};
  for (const item of SUAPE_MATURITY_ITEMS) {
    maturidade[item.key] = declaracao((answers as Record<string, unknown>)[item.key]);
  }

  // Item 9.2 da CheckList. Só marca o que a consulta afirmou; fonte que
  // não respondeu fica em branco, porque "não consta" e "não
  // consultado" mudam a nota de maturidade e significam o oposto.
  const cadastros: Record<string, boolean> = {};
  for (const registro of evaluation.registryCoverage || []) {
    cadastros[registro.key] = registro.status === 'consta';
  }

  return {
    cadastro: {
      razaoSocial: diligence.razaoSocial || empresa.razao_social || '',
      cnpj: diligence.cnpjFmt || diligence.cnpj || '',
      objetoSocial: empresa.cnae_fiscal_descricao || '',
      dataConstituicao: empresa.data_inicio_atividade || '',
      numeroEmpregados: '',
      endereco: enderecoCompleto(empresa),
      paises: empresa.municipio ? 'Brasil' : '',
      servico: '',
    },
    redFlags,
    maturidade,
    cadastros,
    classificacaoDoSistema: evaluation.calculatedRisk || '',
  };
}
