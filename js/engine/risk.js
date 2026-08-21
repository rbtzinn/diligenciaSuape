// ============================================
// DILIGÊNCIA 360 — Motor de Risco (Preliminar)
// Pontuação baseada em critérios objetivos.
// Este motor é PRELIMINAR e deve ser revisado
// e aprovado pela área de Compliance.
// ============================================

/**
 * Critérios de pontuação (penalidades)
 * Cada critério adiciona pontos ao score.
 * Score final: 0-100, onde maior = maior risco.
 */
const CRITERIOS = {
  SITUACAO_IRREGULAR:     { pontos: 25, descricao: 'Situação cadastral não-ativa' },
  EMPRESA_RECENTE:        { pontos: 5,  descricao: 'Empresa aberta há menos de 1 ano' },
  PEP_SOCIO:              { pontos: 15, descricao: 'Sócio identificado como PEP (por ocorrência)' },
  CEIS_REGISTRO:          { pontos: 30, descricao: 'Registro no CEIS (inidônea/suspensa)' },
  CNEP_REGISTRO:          { pontos: 25, descricao: 'Registro no CNEP (punida)' },
  CEPIM_REGISTRO:         { pontos: 20, descricao: 'Registro no CEPIM (impedida)' },
  LENIENCIA_ACORDO:       { pontos: 10, descricao: 'Acordo de leniência' },
  MUITOS_SOCIOS:          { pontos: 5,  descricao: 'Quadro societário com mais de 10 sócios' },
  SEM_CNAE:               { pontos: 3,  descricao: 'CNAE principal não informado' },
};

const RiskEngine = {
  /**
   * Calcula score de risco
   * @param {object} dados — resultados das consultas
   * @returns {object} { score, classificacao, detalhes, decisao }
   */
  calcular(dados) {
    let score = 0;
    const detalhes = [];
    const { empresa, socios, pep, ceis, cnep, cepim, leniencia } = dados;

    // Situação cadastral
    const situacao = (empresa.descricao_situacao_cadastral || '').toUpperCase();
    if (situacao && situacao !== 'ATIVA') {
      score += CRITERIOS.SITUACAO_IRREGULAR.pontos;
      detalhes.push({
        criterio: CRITERIOS.SITUACAO_IRREGULAR.descricao,
        pontos: CRITERIOS.SITUACAO_IRREGULAR.pontos,
        detalhe: `Situação: ${situacao}`
      });
    }

    // Empresa recente
    if (empresa.data_inicio_atividade) {
      const abertura = new Date(empresa.data_inicio_atividade);
      const umAnoAtras = new Date();
      umAnoAtras.setFullYear(umAnoAtras.getFullYear() - 1);
      if (abertura > umAnoAtras) {
        score += CRITERIOS.EMPRESA_RECENTE.pontos;
        detalhes.push({
          criterio: CRITERIOS.EMPRESA_RECENTE.descricao,
          pontos: CRITERIOS.EMPRESA_RECENTE.pontos,
          detalhe: `Abertura: ${empresa.data_inicio_atividade}`
        });
      }
    }

    // PEP
    if (Array.isArray(pep)) {
      const pepEncontrados = pep.filter(p => p.encontrado);
      pepEncontrados.forEach(p => {
        score += CRITERIOS.PEP_SOCIO.pontos;
        detalhes.push({
          criterio: CRITERIOS.PEP_SOCIO.descricao,
          pontos: CRITERIOS.PEP_SOCIO.pontos,
          detalhe: `Sócio: ${p.nome}`
        });
      });
    }

    // CEIS
    if (ceis && ceis.encontrado) {
      score += CRITERIOS.CEIS_REGISTRO.pontos;
      detalhes.push({
        criterio: CRITERIOS.CEIS_REGISTRO.descricao,
        pontos: CRITERIOS.CEIS_REGISTRO.pontos,
        detalhe: `${ceis.quantidade} registro(s)`
      });
    }

    // CNEP
    if (cnep && cnep.encontrado) {
      score += CRITERIOS.CNEP_REGISTRO.pontos;
      detalhes.push({
        criterio: CRITERIOS.CNEP_REGISTRO.descricao,
        pontos: CRITERIOS.CNEP_REGISTRO.pontos,
        detalhe: `${cnep.quantidade} registro(s)`
      });
    }

    // CEPIM
    if (cepim && cepim.encontrado) {
      score += CRITERIOS.CEPIM_REGISTRO.pontos;
      detalhes.push({
        criterio: CRITERIOS.CEPIM_REGISTRO.descricao,
        pontos: CRITERIOS.CEPIM_REGISTRO.pontos,
        detalhe: `${cepim.quantidade} registro(s)`
      });
    }

    // Leniência
    if (leniencia && leniencia.encontrado) {
      score += CRITERIOS.LENIENCIA_ACORDO.pontos;
      detalhes.push({
        criterio: CRITERIOS.LENIENCIA_ACORDO.descricao,
        pontos: CRITERIOS.LENIENCIA_ACORDO.pontos,
        detalhe: `${leniencia.quantidade} acordo(s)`
      });
    }

    // Muitos sócios
    if (Array.isArray(socios) && socios.length > 10) {
      score += CRITERIOS.MUITOS_SOCIOS.pontos;
      detalhes.push({
        criterio: CRITERIOS.MUITOS_SOCIOS.descricao,
        pontos: CRITERIOS.MUITOS_SOCIOS.pontos,
        detalhe: `${socios.length} sócios`
      });
    }

    // CNAE ausente
    if (!empresa.cnae_fiscal && !empresa.cnae_fiscal_descricao) {
      score += CRITERIOS.SEM_CNAE.pontos;
      detalhes.push({
        criterio: CRITERIOS.SEM_CNAE.descricao,
        pontos: CRITERIOS.SEM_CNAE.pontos,
        detalhe: 'CNAE principal não informado'
      });
    }

    // Cap em 100
    score = Math.min(score, 100);

    const classificacao = this.classificar(score);
    const decisao = this.decidir(score);

    return {
      score,
      classificacao,
      decisao,
      detalhes,
      criteriosUsados: Object.keys(CRITERIOS).length,
      preliminar: true,
      disclaimer: 'Pontuação preliminar calculada automaticamente. Critérios sujeitos a revisão pela área de Compliance.'
    };
  },

  /**
   * Classifica o nível de risco
   */
  classificar(score) {
    if (score <= 20) return { label: 'Baixo Risco', level: 'low', emoji: '🟢', color: 'var(--risk-low)' };
    if (score <= 45) return { label: 'Médio Risco', level: 'medium', emoji: '🟡', color: 'var(--risk-medium)' };
    if (score <= 70) return { label: 'Alto Risco', level: 'high', emoji: '🟠', color: 'var(--risk-high)' };
    return { label: 'Crítico', level: 'critical', emoji: '🔴', color: 'var(--risk-critical)' };
  },

  /**
   * Sugere decisão baseada no score
   */
  decidir(score) {
    if (score <= 20) return { texto: 'Seguir', icone: '✅', descricao: 'Nenhuma ocorrência significativa identificada.' };
    if (score <= 45) return { texto: 'Seguir com Ressalvas', icone: '⚠️', descricao: 'Existem informações que merecem atenção do Compliance.' };
    if (score <= 70) return { texto: 'Aprofundar Diligência', icone: '🔍', descricao: 'Ocorrências importantes que precisam ser investigadas.' };
    return { texto: 'Encaminhar para Avaliação', icone: '🚨', descricao: 'Elementos críticos encontrados. Recomenda-se avaliação especializada.' };
  },

  /**
   * Retorna tabela de critérios (para transparência)
   */
  getCriterios() {
    return { ...CRITERIOS };
  }
};

export default RiskEngine;
