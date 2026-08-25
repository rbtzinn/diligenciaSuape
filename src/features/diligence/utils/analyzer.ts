// ==========================================================
// DILIGÊNCIA 360 — Motor de Análise Automatizada
// ==========================================================

import { CompanyData, SanctionsResult, PepPartnerResult, RiskAssessment, AutomatedAnalysis, AnalysisAlert, AdverseMediaSummary } from '../types';

interface AnalyzerInput {
  empresa: CompanyData;
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  pepResults: PepPartnerResult[];
  adverseMedia?: AdverseMediaSummary;
  risco: RiskAssessment;
}

export function generateAutomatedAnalysis({ empresa, ceis, cnep, pepResults, adverseMedia, risco }: AnalyzerInput): AutomatedAnalysis {
  const alertas: AnalysisAlert[] = [];
  const observacoes: string[] = [];
  const resumo: string[] = [];
  const formatSanctionsSummary = (result: SanctionsResult | undefined): string => {
    if (!result || result.semChave) return 'Indisponível — integração não configurada';
    if (!result.ok) return 'Indisponível — falha na fonte';
    if (result.consultaParcial) return `${result.quantidade} registro(s) — consulta parcial`;
    return result.encontrado ? `${result.quantidade} registro(s)` : 'Sem ocorrências nas fontes consultadas';
  };

  // Alertas CEIS
  const ceisVigentes = ceis?.vigentes ?? (ceis?.encontrado ? ceis.quantidade : 0);
  if (ceisVigentes > 0) {
    alertas.push({
      tipo: 'critical',
      titulo: 'Sanção VIGENTE no CEIS (Inidônea/Suspensa)',
      texto: `Encontrada(s) ${ceisVigentes} sanção(ões) com vigência ativa no Cadastro de Empresas Inidôneas e Suspensas da CGU.`,
      acao: 'Avaliar os órgãos sancionadores e fundamentações antes de formalizar qualquer contratação.',
    });
  } else if (ceis?.encontrado) {
    alertas.push({
      tipo: 'medium',
      titulo: 'Registro HISTÓRICO no CEIS (Expirado)',
      texto: `Constam ${ceis.quantidade} registro(s) no CEIS, porém todos possuem vigência encerrada/histórica.`,
      acao: 'Verificar se existem pendências de cumprimento ou reincidências.',
    });
  }

  // Alertas CNEP
  const cnepVigentes = cnep?.vigentes ?? (cnep?.encontrado ? cnep.quantidade : 0);
  if (cnepVigentes > 0) {
    alertas.push({
      tipo: 'critical',
      titulo: 'Sanção VIGENTE no CNEP (Lei Anticorrupção)',
      texto: `Encontrada(s) ${cnepVigentes} punição(ões) com vigência ativa no Cadastro Nacional de Empresas Punidas da CGU.`,
      acao: 'Verificar motivação da penalidade e impedimento legal de contratação pública.',
    });
  }

  // Alertas Situação Cadastral
  const situacao = (empresa.descricao_situacao_cadastral || '').toUpperCase();
  if (situacao && situacao !== 'ATIVA') {
    alertas.push({
      tipo: 'high',
      titulo: `Situação Cadastral Irregular: ${situacao}`,
      texto: `O cadastro da empresa perante a Receita Federal encontra-se com situação "${situacao}".`,
      acao: 'Exigir regularização cadastral e certidões antes de prosseguir.',
    });
  }

  // Alertas PEP (Tratamento cuidadoso de homonímia)
  const pepsEncontrados = pepResults.filter((p) => p.encontrado);
  pepsEncontrados.forEach((pep) => {
    alertas.push({
      tipo: 'medium',
      titulo: `Possível Correspondência PEP: ${pep.nome}`,
      texto: `Correspondência nominal encontrada na base de Pessoas Expostas Politicamente da CGU (${pep.quantidade} registro(s)). Por ser busca por nome, há risco de homonímia.`,
      acao: 'Requer validação: confirmar se o CPF descaracterizado ou órgão/cargo coincidem com o integrante do QSA antes de considerar o vínculo confirmado.',
    });
  });

  // Ocorrências públicas: empresa e pessoas são avaliadas separadamente.
  const companyMediaCandidates = adverseMedia?.results.filter((item) => (
    item.subjectType !== 'person' && (item.matchStrength === 'high' || item.matchStrength === 'medium')
  )).length || 0;
  const personMediaCandidates = adverseMedia?.results.filter((item) => (
    item.subjectType === 'person'
    && item.personMatch?.fullName
    && (item.matchStrength === 'high' || item.matchStrength === 'medium')
  )).length || 0;
  if (companyMediaCandidates > 0) {
    alertas.push({
      tipo: 'medium',
      titulo: 'Conteúdo público associado à empresa',
      texto: `Foram identificadas ${companyMediaCandidates} publicação(ões) com razão social, nome fantasia ou CNPJ correlacionado(s).`,
      acao: 'Ler o conteúdo, confirmar a fonte e qualificar o fato antes de registrar qualquer conclusão.',
    });
  }
  if (personMediaCandidates > 0) {
    alertas.push({
      tipo: 'medium',
      titulo: 'Conteúdo público associado ao nome de integrante',
      texto: `${personMediaCandidates} publicação(ões) mencionam o nome completo de pessoa(s) do QSA em buscas com termos criminais ou de integridade.`,
      acao: 'Validar identidade, CPF, processo e teor. A coincidência nominal não confirma crime, investigação ou condenação.',
    });
  }

  // Observações contextuais
  const socios = empresa.qsa || [];
  if (socios.length === 0) {
    observacoes.push('Quadro societário (QSA) não disponível na base pública consultada.');
  } else {
    observacoes.push(`${socios.length} sócio(s) e administrador(es) identificados.`);
  }

  if (empresa.data_inicio_atividade) {
    observacoes.push(`Início de atividade registrado em ${empresa.data_inicio_atividade}.`);
  }

  // Resumo Executivo
  resumo.push(`Razão Social: ${empresa.razao_social || 'Não informado'}`);
  resumo.push(`Situação: ${situacao || 'Não informado'}`);
  resumo.push(`Quadro Societário: ${socios.length} integrante(s)`);
  resumo.push(`CEIS: ${formatSanctionsSummary(ceis)}`);
  resumo.push(`CNEP: ${formatSanctionsSummary(cnep)}`);
  resumo.push(`Ocorrências públicas: ${
    !adverseMedia || adverseMedia.semChave || !adverseMedia.ok
      ? 'Indisponível — integração não configurada ou fonte indisponível'
      : adverseMedia.results.length
        ? `${adverseMedia.companyResultsCount ?? 0} da empresa; ${adverseMedia.personResultsCount ?? 0} nominal(is) de pessoas`
        : 'Sem ocorrências nas fontes consultadas'
  }`);
  resumo.push(`Indicador de Atenção Preliminar: ${risco.score}/100 (${risco.nivel})`);

  return {
    provider: 'rules-engine',
    tipoAnalise: 'Análise Automatizada de Risco Preliminar',
    disclaimer: 'Análise gerada por regras objetivas predefinidas. Não substitui avaliação do Compliance.',
    alertas,
    observacoes,
    resumo,
    totalAlertas: alertas.length,
    alertasCriticos: alertas.filter((a) => a.tipo === 'critical').length,
  };
}
