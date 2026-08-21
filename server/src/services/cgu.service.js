// ==========================================================
// DILIGÊNCIA 360 — Serviço Portal da Transparência (CGU)
// Consultas oficiais de CEIS, CNEP e PEP com paginação completa
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');

const CGU_API_KEY = process.env.CGU_API_KEY || '';
const MAX_PAGES_SAFETY = 20; // Limite técnico de segurança (300 registros)

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

const CguService = {
  isConfigured() {
    return !!CGU_API_KEY;
  },

  async getCEIS(rawCnpj) {
    if (!this.isConfigured()) {
      return { ok: false, semChave: true, encontrado: false, quantidade: 0, vigentes: 0, registros: [], aviso: 'Integração CGU não configurada.' };
    }

    const cnpj = String(rawCnpj).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    let pagina = 1;
    let allRegistros = [];
    let consultaParcial = false;

    try {
      while (pagina <= MAX_PAGES_SAFETY) {
        const r = await safeFetch(
          `https://api.portaldatransparencia.gov.br/api-de-dados/ceis?codigoSancionado=${cnpj}&pagina=${pagina}`,
          { headers: { 'chave-api-dados': CGU_API_KEY, Accept: 'application/json' } }
        );

        if (!r.ok) throw new Error(`CGU retornou HTTP ${r.status}`);

        const data = await r.json();
        if (!Array.isArray(data) || data.length === 0) break;

        const pageRegistros = data.map((x) => {
          const fim = x.dataFimSancao || '';
          return {
            id: x.id,
            sancionado: x.sancionado?.nome || x.pessoa?.nome || '',
            documentoSancionado: x.sancionado?.codigoFormatado || x.pessoa?.cnpjFormatado || x.pessoa?.cpfFormatado || '',
            orgao: x.orgaoSancionador?.nome || '',
            esfera: x.orgaoSancionador?.esfera || '',
            uf: x.orgaoSancionador?.siglaUf || '',
            sancao: x.tipoSancao?.descricaoPortal || x.tipoSancao?.descricaoResumida || (typeof x.tipoSancao === 'string' ? x.tipoSancao : 'Sanção registrada'),
            inicio: x.dataInicioSancao || '',
            fim: fim || 'Sem data de término informada',
            vigente: isSanctionVigente(fim),
            abrangencia: x.abrangenciaDefinidaDecisaoJudicial || 'Não informada',
            processo: x.numeroProcesso || '',
            fundamentacao: (x.fundamentacao || []).map((f) => f.descricao || f.codigo).join('\n') || (x.fundamentacao?.descricaoFundamentacao || ''),
            detalhamentoPublicacao: x.detalhamentoPublicacao || '',
          };
        });

        allRegistros = allRegistros.concat(pageRegistros);
        if (data.length < 15) break;

        if (pagina === MAX_PAGES_SAFETY && data.length === 15) {
          consultaParcial = true;
        }
        pagina++;
      }

      const vigentesCount = allRegistros.filter((r) => r.vigente).length;

      return {
        ok: true,
        fonte: 'Portal da Transparência (CGU / CEIS)',
        consultadoEm: new Date().toISOString(),
        encontrado: allRegistros.length > 0,
        quantidade: allRegistros.length,
        vigentes: vigentesCount,
        historicas: allRegistros.length - vigentesCount,
        consultaParcial,
        aviso: consultaParcial ? 'Consulta parcial — existem registros adicionais não carregados.' : undefined,
        registros: allRegistros,
      };
    } catch (e) {
      console.error('[CGU CEIS] Erro na consulta:', e.message);
      return { ok: false, status: 500, erro: e.message, encontrado: false, quantidade: 0, vigentes: 0, registros: [] };
    }
  },

  async getCNEP(rawCnpj) {
    if (!this.isConfigured()) {
      return { ok: false, semChave: true, encontrado: false, quantidade: 0, vigentes: 0, registros: [], aviso: 'Integração CGU não configurada.' };
    }

    const cnpj = String(rawCnpj).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    let pagina = 1;
    let allRegistros = [];
    let consultaParcial = false;

    try {
      while (pagina <= MAX_PAGES_SAFETY) {
        const r = await safeFetch(
          `https://api.portaldatransparencia.gov.br/api-de-dados/cnep?codigoSancionado=${cnpj}&pagina=${pagina}`,
          { headers: { 'chave-api-dados': CGU_API_KEY, Accept: 'application/json' } }
        );

        if (!r.ok) throw new Error(`CGU retornou HTTP ${r.status}`);

        const data = await r.json();
        if (!Array.isArray(data) || data.length === 0) break;

        const pageRegistros = data.map((x) => {
          const fim = x.dataFimSancao || '';
          return {
            id: x.id,
            sancionado: x.sancionado?.nome || x.pessoa?.nome || '',
            documentoSancionado: x.sancionado?.codigoFormatado || x.pessoa?.cnpjFormatado || x.pessoa?.cpfFormatado || '',
            orgao: x.orgaoSancionador?.nome || '',
            esfera: x.orgaoSancionador?.esfera || '',
            uf: x.orgaoSancionador?.siglaUf || '',
            sancao: x.tipoSancao?.descricaoPortal || x.tipoSancao?.descricaoResumida || (typeof x.tipoSancao === 'string' ? x.tipoSancao : 'Punição registrada'),
            inicio: x.dataInicioSancao || '',
            fim: fim || 'Sem data de término informada',
            vigente: isSanctionVigente(fim),
            abrangencia: x.abrangenciaDefinidaDecisaoJudicial || 'Não informada',
            valorMulta: x.valorMulta || '0,00',
            processo: x.numeroProcesso || '',
            fundamentacao: (x.fundamentacao || []).map((f) => f.descricao || f.codigo).join('\n') || '',
            detalhamentoPublicacao: x.detalhamentoPublicacao || '',
          };
        });

        allRegistros = allRegistros.concat(pageRegistros);
        if (data.length < 15) break;

        if (pagina === MAX_PAGES_SAFETY && data.length === 15) {
          consultaParcial = true;
        }
        pagina++;
      }

      const vigentesCount = allRegistros.filter((r) => r.vigente).length;

      return {
        ok: true,
        fonte: 'Portal da Transparência (CGU / CNEP)',
        consultadoEm: new Date().toISOString(),
        encontrado: allRegistros.length > 0,
        quantidade: allRegistros.length,
        vigentes: vigentesCount,
        historicas: allRegistros.length - vigentesCount,
        consultaParcial,
        aviso: consultaParcial ? 'Consulta parcial — existem registros adicionais não carregados.' : undefined,
        registros: allRegistros,
      };
    } catch (e) {
      console.error('[CGU CNEP] Erro na consulta:', e.message);
      return { ok: false, status: 500, erro: e.message, encontrado: false, quantidade: 0, vigentes: 0, registros: [] };
    }
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
      const r = await safeFetch(
        `https://api.portaldatransparencia.gov.br/api-de-dados/peps?nome=${encodeURIComponent(nome)}&pagina=1`,
        { headers: { 'chave-api-dados': CGU_API_KEY, Accept: 'application/json' } }
      );

      if (!r.ok) throw new Error(`CGU retornou HTTP ${r.status}`);

      const data = await r.json();
      const registros = (Array.isArray(data) ? data : []).map((x) => ({
        nome: (x.nome || '').trim(),
        cpf: x.cpf || '',
        funcao: (x.descricao_funcao || x.funcao || '').trim(),
        orgao: (x.nome_orgao || x.orgaoExercicio || '').trim(),
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
        registros,
      };
    } catch (e) {
      console.error('[CGU PEP] Erro na consulta nominal:', e.message);
      return { ok: false, status: 500, erro: e.message, nome, encontrado: false, quantidade: 0, registros: [] };
    }
  },
};

module.exports = CguService;
