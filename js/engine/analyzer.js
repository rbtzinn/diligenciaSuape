// ============================================
// DILIGÊNCIA 360 — Análise Automatizada
//
// IMPORTANTE: Esta camada NÃO simula um LLM.
// É análise automatizada baseada em regras.
// Estruturada para futura conexão com LLM real.
// ============================================

/**
 * Interface preparada para futura integração com LLM:
 *
 * Para conectar um LLM real, implemente:
 *   Analyzer.setProvider('llm')
 *   Analyzer.llmEndpoint = '/api/llm/analyze'
 *
 * O LLM receberá os mesmos dados e deverá retornar
 * o mesmo formato de resposta.
 */

const Analyzer = {
  // 'rules' = análise por regras | 'llm' = futuro LLM real
  _provider: 'rules',

  setProvider(provider) {
    this._provider = provider;
  },

  /**
   * Gera análise completa dos resultados
   * @param {object} dados — resultados das consultas
   * @param {object} risco — resultado do motor de risco
   * @returns {object} análise estruturada
   */
  analisar(dados, risco) {
    if (this._provider === 'llm') {
      // Futuro: chamada ao endpoint LLM
      // return this._analisarComLLM(dados, risco);
    }
    return this._analisarComRegras(dados, risco);
  },

  /**
   * Análise automatizada por regras
   */
  _analisarComRegras(dados, risco) {
    const { empresa, socios, pep, ceis, cnep, cepim, leniencia } = dados;
    const alertas = [];
    const observacoes = [];
    const resumo = [];

    // --- Alertas ---
    if (ceis && ceis.encontrado) {
      alertas.push({
        tipo: 'critical',
        titulo: 'Empresa consta no CEIS',
        texto: `Encontrado(s) ${ceis.quantidade} registro(s) no Cadastro de Empresas Inidôneas e Suspensas.`,
        acao: 'Verificar detalhes da sanção e período de vigência.'
      });
    }

    if (cnep && cnep.encontrado) {
      alertas.push({
        tipo: 'critical',
        titulo: 'Empresa consta no CNEP',
        texto: `Encontrado(s) ${cnep.quantidade} registro(s) no Cadastro Nacional de Empresas Punidas.`,
        acao: 'Avaliar natureza da punição e impacto na contratação.'
      });
    }

    if (cepim && cepim.encontrado) {
      alertas.push({
        tipo: 'high',
        titulo: 'Empresa consta no CEPIM',
        texto: `Encontrado(s) ${cepim.quantidade} registro(s) no Cadastro de Entidades Impedidas.`,
        acao: 'Verificar motivo do impedimento.'
      });
    }

    const pepEncontrados = (pep || []).filter(p => p.encontrado);
    if (pepEncontrados.length > 0) {
      pepEncontrados.forEach(p => {
        alertas.push({
          tipo: 'medium',
          titulo: `Possível PEP: ${p.nome}`,
          texto: 'Sócio identificado como possível Pessoa Exposta Politicamente.',
          acao: 'Avaliar se a condição de PEP é relevante para a relação comercial. PEP não significa irregularidade.'
        });
      });
    }

    const situacao = (empresa.descricao_situacao_cadastral || '').toUpperCase();
    if (situacao && situacao !== 'ATIVA') {
      alertas.push({
        tipo: 'high',
        titulo: 'Situação cadastral irregular',
        texto: `Situação cadastral: ${situacao}.`,
        acao: 'Verificar se a empresa está apta para contratação.'
      });
    }

    if (leniencia && leniencia.encontrado) {
      alertas.push({
        tipo: 'medium',
        titulo: 'Acordo de Leniência',
        texto: `Encontrado(s) ${leniencia.quantidade} acordo(s) de leniência.`,
        acao: 'Avaliar termos do acordo e implicações para a relação institucional.'
      });
    }

    // --- Observações ---
    if (Array.isArray(socios) && socios.length === 0) {
      observacoes.push('Nenhum sócio identificado na base consultada.');
    }

    if (empresa.data_inicio_atividade) {
      const abertura = new Date(empresa.data_inicio_atividade);
      const anosAtividade = Math.floor((Date.now() - abertura) / (365.25 * 24 * 60 * 60 * 1000));
      if (anosAtividade < 1) {
        observacoes.push(`Empresa aberta recentemente (${empresa.data_inicio_atividade}).`);
      } else {
        observacoes.push(`Empresa em atividade há ${anosAtividade} ano(s).`);
      }
    }

    if (ceis && ceis.semChave) {
      observacoes.push('Consulta CEIS indisponível: chave do Portal da Transparência não configurada.');
    }

    if (pepEncontrados.length === 0 && (pep || []).length > 0) {
      observacoes.push('Nenhum sócio identificado como PEP nas bases consultadas.');
    }

    // --- Resumo ---
    resumo.push(`Empresa: ${empresa.razao_social || 'N/I'}`);
    resumo.push(`Situação: ${situacao || 'N/I'}`);
    resumo.push(`Sócios identificados: ${(socios || []).length}`);
    resumo.push(`PEP: ${pepEncontrados.length > 0 ? pepEncontrados.length + ' possível(is)' : 'Nenhuma ocorrência'}`);
    resumo.push(`CEIS: ${ceis && ceis.encontrado ? ceis.quantidade + ' registro(s)' : 'Nenhuma ocorrência'}`);
    resumo.push(`CNEP: ${cnep && cnep.encontrado ? cnep.quantidade + ' registro(s)' : 'Nenhuma ocorrência'}`);
    resumo.push(`CEPIM: ${cepim && cepim.encontrado ? cepim.quantidade + ' registro(s)' : 'Nenhuma ocorrência'}`);
    resumo.push(`Leniência: ${leniencia && leniencia.encontrado ? leniencia.quantidade + ' acordo(s)' : 'Nenhum acordo'}`);
    resumo.push(`Score de risco: ${risco.score}/100 — ${risco.classificacao.label}`);
    resumo.push(`Decisão sugerida: ${risco.decisao.texto}`);

    return {
      provider: this._provider,
      tipoAnalise: 'Análise automatizada baseada em regras',
      disclaimer: 'Esta análise foi gerada automaticamente por regras predefinidas. Não constitui parecer de Compliance e não substitui a avaliação humana.',
      alertas,
      observacoes,
      resumo,
      totalAlertas: alertas.length,
      alertasCriticos: alertas.filter(a => a.tipo === 'critical').length,
      // Preparado para futuro LLM
      llmDisponivel: false
    };
  },

  /**
   * Futuro: análise com LLM real
   * Mantido como placeholder para integração
   */
  async _analisarComLLM(dados, risco) {
    // TODO: Implementar quando LLM estiver disponível
    // const response = await fetch('/api/llm/analyze', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ dados, risco })
    // });
    // return response.json();
    return this._analisarComRegras(dados, risco);
  }
};

export default Analyzer;
