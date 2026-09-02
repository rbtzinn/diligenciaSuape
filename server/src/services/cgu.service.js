// ==========================================================
// DILIGÊNCIA 360 — Serviço Portal da Transparência (CGU)
// Consultas oficiais de CEIS, CNEP e PEP com paginação completa
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');

const CGU_API_KEY = process.env.CGU_API_KEY || '';
const MAX_PAGES_SAFETY = 20; // Limite técnico de segurança (300 registros)
const PAGE_SIZE = 15;        // Tamanho de página praticado pela API da CGU
const BASE_URL = 'https://api.portaldatransparencia.gov.br/api-de-dados';
const FEDERAL_RESOURCES_START_YEAR = 2014;
const FEDERAL_RESOURCES_MAX_YEARS = 15;

function parseBRDate(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    return new Date(y, m, d);
  }
  const iso = new Date(str);
  return isNaN(iso.getTime()) ? null : iso;
}

function isSanctionVigente(fimStr) {
  if (!fimStr || fimStr === 'Sem informação' || fimStr.toLowerCase().includes('indeterminado')) {
    return true;
  }
  const dtFim = parseBRDate(fimStr);
  if (!dtFim) return true;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return dtFim >= hoje;
}

/**
 * Percorre todas as páginas de um cadastro da CGU.
 * Devolve os registros crus e se a varredura parou no limite de segurança.
 */
async function fetchAllPages(path, params) {
  let pagina = 1;
  const rows = [];
  let consultaParcial = false;

  while (pagina <= MAX_PAGES_SAFETY) {
    const query = new URLSearchParams({ ...params, pagina: String(pagina) });
    const response = await safeFetch(`${BASE_URL}/${path}?${query}`, {
      headers: { 'chave-api-dados': CGU_API_KEY, Accept: 'application/json' },
    });

    if (!response.ok) throw new Error(`CGU retornou HTTP ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) break;

    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    if (pagina === MAX_PAGES_SAFETY) consultaParcial = true;
    pagina += 1;
  }

  return { rows, consultaParcial };
}

/** Campos comuns a CEIS e CNEP; o rótulo padrão da sanção difere entre eles. */
function mapSanctionRecord(x, defaultLabel) {
  const fim = x.dataFimSancao || '';
  return {
    id: x.id,
    sancionado: x.sancionado?.nome || x.pessoa?.nome || '',
    documentoSancionado: x.sancionado?.codigoFormatado
      || x.pessoa?.cnpjFormatado
      || x.pessoa?.cpfFormatado
      || '',
    orgao: x.orgaoSancionador?.nome || '',
    esfera: x.orgaoSancionador?.esfera || '',
    uf: x.orgaoSancionador?.siglaUf || '',
    sancao: x.tipoSancao?.descricaoPortal
      || x.tipoSancao?.descricaoResumida
      || (typeof x.tipoSancao === 'string' ? x.tipoSancao : defaultLabel),
    inicio: x.dataInicioSancao || '',
    fim: fim || 'Sem data de término informada',
    vigente: isSanctionVigente(fim),
    abrangencia: x.abrangenciaDefinidaDecisaoJudicial || 'Não informada',
    processo: x.numeroProcesso || '',
    fundamentacao: (x.fundamentacao || []).map((f) => f.descricao || f.codigo).join('\n')
      || (x.fundamentacao?.descricaoFundamentacao || ''),
    detalhamentoPublicacao: x.detalhamentoPublicacao || '',
  };
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function companyPortalUrl(cnpj) {
  return `https://portaldatransparencia.gov.br/pessoa-juridica/${onlyDigits(cnpj)}`;
}

function mapFederalContract(record, investigatedCnpj) {
  const supplierCnpj = onlyDigits(record?.fornecedor?.cnpjFormatado);
  return {
    origem: 'PORTAL_TRANSPARENCIA',
    id: record?.id,
    numeroContrato: record?.numero || '',
    numeroProcesso: record?.numeroProcesso || record?.compra?.numeroProcesso || '',
    numeroCompra: record?.compra?.numero || '',
    objeto: record?.objeto || record?.compra?.objeto || '',
    situacao: record?.situacaoContrato || '',
    modalidade: record?.modalidadeCompra || '',
    orgao: record?.unidadeGestora?.nome || record?.unidadeGestoraCompras?.nome || '',
    orgaoCodigo: record?.unidadeGestora?.codigo || '',
    orgaoCnpj: onlyDigits(record?.unidadeGestora?.orgaoVinculado?.cnpj),
    orgaoVinculado: record?.unidadeGestora?.orgaoVinculado?.nome || '',
    orgaoVinculadoCodigo: record?.unidadeGestora?.orgaoVinculado?.codigoSIAFI || '',
    orgaoSuperior: record?.unidadeGestora?.orgaoMaximo?.nome || '',
    fornecedorNome: record?.fornecedor?.nome || record?.fornecedor?.razaoSocialReceita || '',
    fornecedorCnpj: supplierCnpj,
    fornecedorCnpjFmt: record?.fornecedor?.cnpjFormatado || '',
    cnpjConfirmado: Boolean(supplierCnpj && supplierCnpj === onlyDigits(investigatedCnpj)),
    valorInicial: Number(record?.valorInicialCompra) || 0,
    valorFinal: Number(record?.valorFinalCompra) || 0,
    dataAssinatura: record?.dataAssinatura || '',
    dataPublicacao: record?.dataPublicacaoDOU || '',
    vigenciaInicio: record?.dataInicioVigencia || '',
    vigenciaFim: record?.dataFimVigencia || '',
    url: companyPortalUrl(investigatedCnpj),
  };
}

function summarizeResourceReceipts(rows, investigatedCnpj) {
  const cnpj = onlyDigits(investigatedCnpj);
  const matching = (Array.isArray(rows) ? rows : []).filter((row) => (
    !onlyDigits(row?.codigoPessoa) || onlyDigits(row.codigoPessoa) === cnpj
  ));
  const agencies = new Map();
  const years = new Map();
  let valorTotal = 0;

  for (const row of matching) {
    const value = Number(row?.valor) || 0;
    const year = String(row?.anoMes || '').slice(0, 4) || 'Não informado';
    const agencyKey = String(row?.codigoOrgao || row?.nomeOrgao || row?.codigoUG || 'nao-informado');
    const current = agencies.get(agencyKey) || {
      codigo: row?.codigoOrgao || '',
      nome: row?.nomeOrgao || row?.nomeUG || 'Órgão não informado',
      orgaoSuperiorCodigo: row?.codigoOrgaoSuperior || '',
      orgaoSuperior: row?.nomeOrgaoSuperior || '',
      valorTotal: 0,
      meses: new Set(),
      unidades: new Set(),
    };
    current.valorTotal += value;
    if (row?.anoMes) current.meses.add(String(row.anoMes));
    if (row?.nomeUG) current.unidades.add(String(row.nomeUG));
    agencies.set(agencyKey, current);
    years.set(year, (years.get(year) || 0) + value);
    valorTotal += value;
  }

  return {
    quantidadeRegistros: matching.length,
    valorTotal,
    orgaos: [...agencies.values()]
      .map((agency) => ({
        ...agency,
        meses: [...agency.meses].sort(),
        unidades: [...agency.unidades].sort(),
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal),
    anos: [...years.entries()]
      .map(([ano, valor]) => ({ ano, valor }))
      .sort((a, b) => a.ano.localeCompare(b.ano)),
  };
}

function annualPeriods(now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const currentMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
  const firstYear = Math.max(FEDERAL_RESOURCES_START_YEAR, currentYear - FEDERAL_RESOURCES_MAX_YEARS + 1);
  return Array.from({ length: currentYear - firstYear + 1 }, (_, index) => {
    const year = firstYear + index;
    return {
      year,
      start: `01/${year}`,
      end: year === currentYear ? `${currentMonth}/${year}` : `12/${year}`,
    };
  });
}

async function fetchFederalResourceReceipts(cnpj) {
  const periods = annualPeriods();
  const rows = [];
  const failedPeriods = [];
  let consultaParcial = false;

  // Três anos por vez mantêm a diligência rápida sem estourar a cota pública.
  for (let index = 0; index < periods.length; index += 3) {
    const batch = periods.slice(index, index + 3);
    const results = await Promise.all(batch.map(async (period) => {
      try {
        const result = await fetchAllPages('despesas/recursos-recebidos', {
          mesAnoInicio: period.start,
          mesAnoFim: period.end,
          codigoFavorecido: cnpj,
        });
        return { period, ...result };
      } catch (error) {
        return { period, error };
      }
    }));

    for (const result of results) {
      if (result.error) {
        consultaParcial = true;
        failedPeriods.push(String(result.period.year));
        continue;
      }
      rows.push(...result.rows);
      consultaParcial = consultaParcial || result.consultaParcial;
    }
  }

  return { rows, consultaParcial, failedPeriods, periods };
}

const CADASTROS = Object.freeze({
  CEIS: { path: 'ceis', label: 'Sanção registrada', fonte: 'Portal da Transparência (CGU / CEIS)' },
  CNEP: { path: 'cnep', label: 'Punição registrada', fonte: 'Portal da Transparência (CGU / CNEP)' },
});

function emptySanctionsResult(extra) {
  return {
    encontrado: false, quantidade: 0, vigentes: 0, historicas: 0, registros: [], ...extra,
  };
}

async function querySanctions(cadastro, params) {
  const config = CADASTROS[cadastro];
  if (!CGU_API_KEY) {
    return emptySanctionsResult({
      ok: false, semChave: true, aviso: 'Integração CGU não configurada.',
    });
  }

  try {
    const { rows, consultaParcial } = await fetchAllPages(config.path, params);
    const registros = rows.map((row) => mapSanctionRecord(row, config.label));
    const vigentes = registros.filter((r) => r.vigente).length;

    return {
      ok: true,
      fonte: config.fonte,
      consultadoEm: new Date().toISOString(),
      encontrado: registros.length > 0,
      quantidade: registros.length,
      vigentes,
      historicas: registros.length - vigentes,
      consultaParcial,
      aviso: consultaParcial
        ? 'Consulta parcial — existem registros adicionais não carregados.'
        : undefined,
      registros,
    };
  } catch (e) {
    console.error(`[CGU ${cadastro}] Erro na consulta:`, e.message);
    return emptySanctionsResult({ ok: false, status: 500, erro: e.message });
  }
}

const CguService = {
  isConfigured() {
    return !!CGU_API_KEY;
  },

  async getCEIS(rawCnpj) {
    const cnpj = String(rawCnpj).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return querySanctions('CEIS', { codigoSancionado: cnpj });
  },

  async getCNEP(rawCnpj) {
    const cnpj = String(rawCnpj).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return querySanctions('CNEP', { codigoSancionado: cnpj });
  },

  /** Contratos e pagamentos do Executivo Federal vinculados exatamente ao CNPJ. */
  async getFederalExposure(rawCnpj) {
    const cnpj = onlyDigits(rawCnpj);
    const consultadoEm = new Date().toISOString();
    const sourceUrl = companyPortalUrl(cnpj);
    if (cnpj.length !== 14) {
      return { ok: false, status: 400, erro: 'CNPJ inválido.', cnpj, contratos: [], recursos: null, consultadoEm };
    }
    if (!this.isConfigured()) {
      return {
        ok: false,
        semChave: true,
        erro: 'Integração CGU não configurada.',
        cnpj,
        contratos: [],
        recursos: null,
        consultadoEm,
      };
    }

    const failures = [];
    let contractsResult = { rows: [], consultaParcial: false };
    let resourcesResult = { rows: [], consultaParcial: false, failedPeriods: [], periods: annualPeriods() };

    try {
      contractsResult = await fetchAllPages('contratos/cpf-cnpj', { cpfCnpj: cnpj });
    } catch (error) {
      failures.push(`Contratos federais: ${error.message}`);
    }
    try {
      resourcesResult = await fetchFederalResourceReceipts(cnpj);
    } catch (error) {
      failures.push(`Recursos recebidos: ${error.message}`);
    }
    if (resourcesResult.periods?.length > 0
      && resourcesResult.failedPeriods?.length === resourcesResult.periods.length) {
      failures.push('Recursos recebidos: todos os períodos consultados falharam.');
    }

    const contracts = contractsResult.rows
      .map((row) => mapFederalContract(row, cnpj))
      .filter((contract) => contract.cnpjConfirmado);
    const resourceSummary = summarizeResourceReceipts(resourcesResult.rows, cnpj);
    const periods = resourcesResult.periods || annualPeriods();
    const consultaParcial = failures.length > 0
      || contractsResult.consultaParcial
      || resourcesResult.consultaParcial;

    return {
      ok: failures.length < 2,
      provider: 'Portal da Transparência do Governo Federal (CGU)',
      sourceUrl,
      consultadoEm,
      cnpjInvestigado: cnpj,
      consultaParcial,
      falhas: failures,
      contratos: contracts,
      recursos: {
        ...resourceSummary,
        periodoInicio: periods[0]?.start,
        periodoFim: periods[periods.length - 1]?.end,
        anosComFalha: resourcesResult.failedPeriods || [],
      },
      resumo: {
        contratosConfirmados: contracts.length,
        valorContratos: contracts.reduce((total, contract) => total + (contract.valorFinal || contract.valorInicial || 0), 0),
        recursosRecebidos: resourceSummary.valorTotal,
        orgaosContratantes: new Set(contracts.map((contract) => contract.orgaoCodigo || contract.orgao)).size,
        orgaosPagadores: resourceSummary.orgaos.length,
      },
      limitacao: `A consulta cobre o Executivo Federal. Os pagamentos foram pesquisados de ${periods[0]?.start} a ${periods[periods.length - 1]?.end}; estados, municípios e períodos anteriores não estão incluídos.`,
    };
  },

  /**
   * Busca nominal nos cadastros de sanção.
   *
   * O QSA público não expõe o CPF completo do sócio pessoa física — apenas
   * seis dígitos mascarados —, então não há como consultar por documento.
   * A busca é feita por nome e a desambiguação fica a cargo de quem chama,
   * cruzando o CPF mascarado que a própria CGU devolve.
   */
  async searchSanctionsByName(cadastro, rawName) {
    const nome = String(rawName || '').trim();
    if (!nome) {
      return emptySanctionsResult({ ok: false, status: 400, erro: 'Parâmetro nome obrigatório.' });
    }
    if (!CADASTROS[cadastro]) {
      return emptySanctionsResult({ ok: false, status: 400, erro: `Cadastro desconhecido: ${cadastro}.` });
    }
    return querySanctions(cadastro, { nomeSancionado: nome });
  },

  async getPEP(rawNome) {
    const nome = String(rawNome || '').trim();
    if (!nome) {
      return { ok: false, status: 400, erro: 'Parâmetro nome obrigatório' };
    }

    if (!this.isConfigured()) {
      return { ok: false, semChave: true, nome, encontrado: false, quantidade: 0, registros: [], aviso: 'Integração CGU não configurada.' };
    }

    try {
      const { rows, consultaParcial } = await fetchAllPages('peps', { nome });
      const registros = rows.map((x) => ({
        nome: (x.nome || '').trim(),
        cpf: x.cpf || '',
        siglaFuncao: (x.sigla_funcao || x.siglaFuncao || '').trim(),
        funcao: (x.descricao_funcao || x.descricaoFuncao || x.funcao || '').trim(),
        nivelFuncao: (x.nivel_funcao || x.nivelFuncao || '').trim(),
        codigoOrgao: x.cod_orgao || x.codigoOrgao || '',
        orgao: (x.nome_orgao || x.nomeOrgao || x.orgaoExercicio || '').trim(),
        inicio: x.dt_inicio_exercicio || x.dataInicioExercicio || '',
        fim: x.dt_fim_exercicio || x.dataFimExercicio || '',
        carencia: x.dt_fim_carencia || x.dataFimCarencia || '',
      }));

      return {
        ok: true,
        fonte: 'Portal da Transparência (CGU / PEP)',
        consultadoEm: new Date().toISOString(),
        nome,
        encontrado: registros.length > 0,
        quantidade: registros.length,
        consultaParcial,
        aviso: consultaParcial
          ? 'Consulta parcial — existem candidatos adicionais não carregados.'
          : undefined,
        registros,
      };
    } catch (e) {
      console.error('[CGU PEP] Erro na consulta nominal:', e.message);
      return { ok: false, status: 500, erro: e.message, nome, encontrado: false, quantidade: 0, registros: [] };
    }
  },
};

module.exports = CguService;
module.exports.mapFederalContract = mapFederalContract;
module.exports.summarizeResourceReceipts = summarizeResourceReceipts;
module.exports.annualPeriods = annualPeriods;
