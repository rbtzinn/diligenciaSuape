// ==========================================================
// DILIGÊNCIA 360 — Serviço Portal da Transparência (CGU)
// Consultas oficiais de CEIS, CNEP e PEP com paginação completa
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');

const CGU_API_KEY = process.env.CGU_API_KEY || '';
const MAX_PAGES_SAFETY = 20; // Limite técnico de segurança (300 registros)
const PAGE_SIZE = 15;        // Tamanho de página praticado pela API da CGU
const BASE_URL = 'https://api.portaldatransparencia.gov.br/api-de-dados';

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
