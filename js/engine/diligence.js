// ============================================
// DILIGÊNCIA 360 — Motor de Diligência
// Orquestra consultas REAIS para um CNPJ.
// Zero dados simulados.
// ============================================

import ApiClient from '../api/client.js';
import RiskEngine from './risk.js';
import Analyzer from './analyzer.js';
import Storage from '../utils/storage.js';
import CNPJ from '../utils/cnpj.js';

const STEPS = [
  { id: 'cadastro',   label: 'Consultando cadastro empresarial',    icon: '🏢' },
  { id: 'socios',     label: 'Identificando sócios e administradores', icon: '👥' },
  { id: 'pep',        label: 'Verificando Pessoas Expostas Politicamente', icon: '🏛️' },
  { id: 'ceis',       label: 'Consultando CEIS (Inidôneas/Suspensas)', icon: '🚫' },
  { id: 'cnep',       label: 'Consultando CNEP (Empresas Punidas)',    icon: '⚖️' },
  { id: 'cepim',      label: 'Consultando CEPIM (Impedidas)',         icon: '🔒' },
  { id: 'leniencia',  label: 'Consultando Acordos de Leniência',      icon: '📋' },
  { id: 'risco',      label: 'Calculando indicadores de risco',       icon: '📊' },
  { id: 'analise',    label: 'Gerando análise automatizada',          icon: '🔍' },
];

const DiligenceEngine = {
  async executar(cnpj, onStep = () => {}) {
    const id = Storage.generateId();
    const startTime = new Date().toISOString();
    const timeline = [];
    const evidencias = []; // Rastreabilidade de cada consulta

    const log = (texto, tipo = 'info') => {
      timeline.push({ time: new Date().toISOString(), texto, tipo });
    };

    const registrarEvidencia = (resultado) => {
      evidencias.push({
        consulta: resultado.tipo,
        fonte: resultado.fonte,
        dataConsulta: resultado.dataConsulta,
        status: resultado.status,
        resultado: resultado.encontrado ? `${resultado.quantidade} registro(s)` : (resultado.erro || 'Nenhuma ocorrência'),
        sucesso: resultado.sucesso
      });
    };

    log('Diligência iniciada.');

    // 1. Cadastro empresarial
    onStep('cadastro', 'loading');
    const empresaRes = await ApiClient.consultarEmpresa(cnpj);
    registrarEvidencia({ ...empresaRes, tipo: 'cadastro' });

    if (!empresaRes.sucesso) {
      onStep('cadastro', 'error', empresaRes.erro);
      log(`Erro ao consultar cadastro: ${empresaRes.erro}`, 'error');
      return { success: false, error: empresaRes.erro };
    }
    onStep('cadastro', 'done');
    log('Cadastro empresarial consultado.');

    const empresa = empresaRes.dados;

    // 2. Sócios (vêm junto do cadastro na BrasilAPI)
    onStep('socios', 'loading');
    const socios = empresa.qsa || [];
    onStep('socios', 'done', `${socios.length} sócio(s)`);
    log(`${socios.length} sócio(s) identificado(s).`);

    // 3. PEP — consulta real para cada sócio
    onStep('pep', 'loading');
    const pepResults = [];
    for (const socio of socios) {
      const nome = socio.nome_socio;
      if (nome) {
        const pepRes = await ApiClient.consultarPEP(nome);
        pepResults.push({ nome, ...pepRes });
        registrarEvidencia({ ...pepRes, tipo: `pep (${nome})` });
        await this._delay(350); // Respeitar rate limit CGU
      }
    }
    const pepCount = pepResults.filter(p => p.encontrado).length;
    onStep('pep', 'done', pepCount > 0 ? `${pepCount} ocorrência(s)` : 'Nenhuma');
    log(pepCount > 0 ? `PEP: ${pepCount} possível(is) ocorrência(s).` : 'PEP: Nenhuma ocorrência.', pepCount > 0 ? 'warning' : 'info');

    // 4. CEIS
    onStep('ceis', 'loading');
    const ceis = await ApiClient.consultarCEIS(cnpj);
    registrarEvidencia(ceis);
    if (!ceis.sucesso && !ceis.semChave) {
      onStep('ceis', 'error', 'Consulta indisponível');
      log(`CEIS: Consulta indisponível — ${ceis.erro}`, 'error');
    } else {
      onStep('ceis', 'done', ceis.encontrado ? `${ceis.quantidade} registro(s)` : 'Nenhuma');
      log(ceis.encontrado ? `CEIS: ${ceis.quantidade} registro(s).` : 'CEIS: Nenhuma ocorrência.', ceis.encontrado ? 'warning' : 'info');
    }

    // 5. CNEP
    onStep('cnep', 'loading');
    const cnep = await ApiClient.consultarCNEP(cnpj);
    registrarEvidencia(cnep);
    if (!cnep.sucesso && !cnep.semChave) {
      onStep('cnep', 'error', 'Consulta indisponível');
      log(`CNEP: Consulta indisponível — ${cnep.erro}`, 'error');
    } else {
      onStep('cnep', 'done', cnep.encontrado ? `${cnep.quantidade} registro(s)` : 'Nenhuma');
      log(cnep.encontrado ? `CNEP: ${cnep.quantidade} registro(s).` : 'CNEP: Nenhuma ocorrência.', cnep.encontrado ? 'warning' : 'info');
    }

    // 6. CEPIM
    onStep('cepim', 'loading');
    const cepim = await ApiClient.consultarCEPIM(cnpj);
    registrarEvidencia(cepim);
    if (!cepim.sucesso && !cepim.semChave) {
      onStep('cepim', 'error', 'Consulta indisponível');
    } else {
      onStep('cepim', 'done', cepim.encontrado ? `${cepim.quantidade} registro(s)` : 'Nenhuma');
    }
    log(cepim.encontrado ? `CEPIM: ${cepim.quantidade} registro(s).` : 'CEPIM: Nenhuma ocorrência.', cepim.encontrado ? 'warning' : 'info');

    // 7. Leniência
    onStep('leniencia', 'loading');
    const leniencia = await ApiClient.consultarLeniencia(cnpj);
    registrarEvidencia(leniencia);
    if (!leniencia.sucesso && !leniencia.semChave) {
      onStep('leniencia', 'error', 'Consulta indisponível');
    } else {
      onStep('leniencia', 'done', leniencia.encontrado ? `${leniencia.quantidade}` : 'Nenhum');
    }
    log(leniencia.encontrado ? `Leniência: ${leniencia.quantidade} acordo(s).` : 'Leniência: Nenhum acordo.', leniencia.encontrado ? 'warning' : 'info');

    // 8. Motor de risco
    onStep('risco', 'loading');
    const resultados = { empresa, socios, pep: pepResults, ceis, cnep, cepim, leniencia };
    const risco = RiskEngine.calcular(resultados);
    onStep('risco', 'done', `Score: ${risco.score}/100`);
    log(`Score de risco preliminar: ${risco.score}/100 — ${risco.classificacao.label}`, risco.score > 45 ? 'warning' : 'info');

    // 9. Análise automatizada
    onStep('analise', 'loading');
    const analise = Analyzer.analisar(resultados, risco);
    onStep('analise', 'done');
    log('Análise automatizada concluída.');
    log('Diligência concluída.');

    const diligence = {
      id,
      cnpj: CNPJ.clean(cnpj),
      cnpjFormatado: CNPJ.format(cnpj),
      razaoSocial: empresa.razao_social || '',
      nomeFantasia: empresa.nome_fantasia || '',
      dataAnalise: startTime,

      empresa, socios, pep: pepResults, ceis, cnep, cepim, leniencia,
      risco, analise, timeline, evidencias,

      versao: 'MVP 1.0',
      tipoAnalise: 'automatizada',
      disclaimer: 'Análise automatizada baseada em regras. Não substitui avaliação humana do Compliance.'
    };

    Storage.saveDiligence(diligence);
    return { success: true, diligence };
  },

  getSteps() { return [...STEPS]; },
  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }
};

export default DiligenceEngine;
