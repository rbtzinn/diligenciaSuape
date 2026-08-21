// ==========================================================
// DILIGÊNCIA 360 — Motor de Cálculo: Indicador Preliminar de Atenção
// Metodologia auditada, transparente e sem pontuação arbitrária de homônimos ou porte societário
// ==========================================================

import { CompanyData, SanctionsResult, PepPartnerResult, RiskAssessment, RiskDetail } from '../types';

interface RiskInput {
  empresa: CompanyData;
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  pepResults: PepPartnerResult[];
}

export function calculateRisk(dados: RiskInput): RiskAssessment {
  let score = 0;
  const detalhes: RiskDetail[] = [];

  // 1. Situação cadastral não ativa
  const sit = (dados.empresa.descricao_situacao_cadastral || '').toUpperCase();
  if (sit && sit !== 'ATIVA') {
    score += 30;
    detalhes.push({ criterio: 'Situação cadastral irregular na Receita Federal', pontos: 30, info: `Status: ${sit}` });
  }

  // 2. CEIS — Cadastro de Empresas Inidôneas e Suspensas (Apenas Sanções Vigentes pontuam)
  const ceisVigentes = Array.isArray(dados.ceis?.registros)
    ? dados.ceis.registros.filter((r) => r.vigente === true).length
    : (dados.ceis?.encontrado ? dados.ceis.quantidade : 0);
  const ceisHistoricas = (dados.ceis?.quantidade || 0) - ceisVigentes;

  if (ceisVigentes > 0) {
    score += 35;
    detalhes.push({
      criterio: 'Sanção VIGENTE no CEIS (Impedimento/Inidoneidade Ativa)',
      pontos: 35,
      info: `${ceisVigentes} sanção(ões) vigente(s) identificada(s)`,
    });
  } else if (ceisHistoricas > 0) {
    detalhes.push({
      criterio: 'Registro HISTÓRICO no CEIS (Sanção Expirada / Encerrada)',
      pontos: 0,
      info: `${ceisHistoricas} sanção(ões) expirada(s) — sem penalidade pontuada`,
    });
  }

  // 3. CNEP — Cadastro Nacional de Empresas Punidas (Lei Anticorrupção)
  const cnepVigentes = Array.isArray(dados.cnep?.registros)
    ? dados.cnep.registros.filter((r) => r.vigente === true).length
    : (dados.cnep?.encontrado ? dados.cnep.quantidade : 0);
  const cnepHistoricas = (dados.cnep?.quantidade || 0) - cnepVigentes;

  if (cnepVigentes > 0) {
    score += 35;
    detalhes.push({
      criterio: 'Sanção VIGENTE no CNEP (Lei Anticorrupção Ativa)',
      pontos: 35,
      info: `${cnepVigentes} punição(ões) vigente(s) identificada(s)`,
    });
  } else if (cnepHistoricas > 0) {
    detalhes.push({
      criterio: 'Registro HISTÓRICO no CNEP (Sanção Expirada / Encerrada)',
      pontos: 0,
      info: `${cnepHistoricas} punição(ões) expirada(s) — sem penalidade pontuada`,
    });
  }

  // 4. PEP — Possíveis correspondências nominais (NÃO PONTUAM PUNITIVAMENTE)
  const pepCount = (dados.pepResults || []).filter((p) => p.encontrado).length;
  if (pepCount > 0) {
    detalhes.push({
      criterio: 'Possível correspondência nominal PEP (Pendente de Validação de Homônimo)',
      pontos: 0,
      info: `${pepCount} sócio(s) com correspondência nominal na CGU — 0 pontos aplicados`,
    });
  }

  // 5. Empresa recém-aberta (menos de 1 ano de atividade)
  if (dados.empresa.data_inicio_atividade) {
    const abertura = new Date(dados.empresa.data_inicio_atividade);
    const umAnoAtras = new Date();
    umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
    if (!isNaN(abertura.getTime()) && abertura > umAnoAtras) {
      score += 10;
      detalhes.push({ criterio: 'Empresa recente (aberta há menos de 1 ano)', pontos: 10, info: `Início: ${dados.empresa.data_inicio_atividade}` });
    }
  }

  // 6. Estrutura societária (Informativo — 0 pontos)
  const socios = dados.empresa.qsa || [];
  if (socios.length > 10) {
    detalhes.push({
      criterio: 'Estrutura societária extensa (>10 integrantes)',
      pontos: 0,
      info: `${socios.length} sócios e administradores — Informativo (0 pts aplicados)`,
    });
  }

  // Limite máximo de pontuação
  score = Math.min(score, 100);

  // Classificação do Indicador Preliminar de Atenção
  if (score <= 20) {
    return {
      score,
      nivel: 'Atenção Baixa',
      cor: 'low',
      emoji: '🟢',
      decisao: 'Prosseguir para as Demais Etapas',
      decisaoDesc: 'Nenhum impedimento identificado nas fontes consultadas até o momento. Prosseguir para as demais etapas da diligência.',
      detalhes,
    };
  }
  if (score <= 45) {
    return {
      score,
      nivel: 'Atenção Moderada',
      cor: 'medium',
      emoji: '🟡',
      decisao: 'Prosseguir com Análise Complementar',
      decisaoDesc: 'Existem apontamentos que requerem validação documental antes da formalização.',
      detalhes,
    };
  }
  if (score <= 70) {
    return {
      score,
      nivel: 'Atenção Elevada',
      cor: 'high',
      emoji: '🟠',
      decisao: 'Aprofundar Diligência',
      decisaoDesc: 'Apontamentos relevantes identificados. Recomenda-se parecer formal de Compliance.',
      detalhes,
    };
  }

  return {
    score,
    nivel: 'Atenção Crítica',
    cor: 'critical',
    emoji: '🔴',
    decisao: 'Encaminhar para Comitê de Avaliação',
    decisaoDesc: 'Sanções vigentes ativas ou irregularidades cadastrais detectadas.',
    detalhes,
  };
}
