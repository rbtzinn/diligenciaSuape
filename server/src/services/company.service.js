// ==========================================================
// DILIGÊNCIA 360 — Serviço Cadastral Empresarial
// Consulta BrasilAPI com fallback transparente para ReceitaWS
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');
const { PersonCorporateNetworkService } = require('./person-corporate-network.service');

const personCorporateNetworkService = new PersonCorporateNetworkService();

const CompanyService = {
  async getCompanyByCNPJ(rawCnpj) {
    const cnpj = String(rawCnpj).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (cnpj.length < 14) {
      return { ok: false, status: 400, erro: 'CNPJ inválido (deve conter 14 posições)' };
    }

    // 1. Tentativa Principal: BrasilAPI
    try {
      const r = await safeFetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (r.ok) {
        const data = await r.json();
        return {
          ok: true,
          status: 200,
          fonte: 'BrasilAPI',
          consultadoEm: new Date().toISOString(),
          data,
        };
      }
    } catch (e) {
      console.warn('[BrasilAPI] Instabilidade detectada, acionando fallback ReceitaWS:', e.message);
    }

    // 2. Tentativa Contingencial (Fallback): ReceitaWS
    try {
      const r2 = await safeFetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
      if (r2.ok) {
        const rw = await r2.json();
        if (rw.status === 'ERROR') {
          return { ok: false, status: 404, erro: rw.message || 'CNPJ não localizado na base' };
        }

        // Normalização de campos para compatibilidade com o frontend
        const normalized = {
          cnpj: rw.cnpj?.replace(/[^a-zA-Z0-9]/g, '') || cnpj,
          razao_social: rw.nome || '',
          nome_fantasia: rw.fantasia || '',
          descricao_situacao_cadastral: rw.situacao || '',
          data_situacao_cadastral: rw.data_situacao || '',
          data_inicio_atividade: rw.abertura || '',
          natureza_juridica: rw.natureza_juridica || '',
          porte: rw.porte || '',
          cnae_fiscal: rw.atividade_principal?.[0]?.code || '',
          cnae_fiscal_descricao: rw.atividade_principal?.[0]?.text || '',
          logradouro: rw.logradouro || '',
          numero: rw.numero || '',
          complemento: rw.complemento || '',
          bairro: rw.bairro || '',
          municipio: rw.municipio || '',
          uf: rw.uf || '',
          cep: rw.cep?.replace(/\D/g, '') || '',
          email: rw.email || '',
          ddd_telefone_1: rw.telefone || '',
          capital_social: rw.capital_social || 0,
          qsa: (rw.qsa || []).map((s) => ({
            nome_socio: s.nome || '',
            qualificacao_socio: s.qual || '',
            cnpj_cpf_do_socio: '',
            data_entrada_sociedade: '',
          })),
        };

        return {
          ok: true,
          status: 200,
          fonte: 'ReceitaWS (fallback)',
          consultadoEm: new Date().toISOString(),
          data: normalized,
        };
      }

      return { ok: false, status: r2.status, erro: `Erro na consulta cadastral: HTTP ${r2.status}` };
    } catch (e) {
      return { ok: false, status: 500, erro: `Falha ao consultar CNPJ nas fontes públicas: ${e.message}` };
    }
  },

  async expandCorporateNetwork(rootCompany, { maxDepth = 2, maxCompanies = 20, maxPeople = 10 } = {}) {
    const rootCnpj = String(rootCompany?.cnpj || '').replace(/\D/g, '');
    if (rootCnpj.length !== 14) return { ok: false, status: 400, erro: 'CNPJ raiz inválido.', companies: [], relationships: [] };

    // A expansão por pessoa é independente da expansão por CNPJ e começa cedo
    // para evitar acrescentar uma cascata sequencial ao tempo total da rota.
    const personExpansionPromise = personCorporateNetworkService.expand(rootCompany, {
      maxPeople,
      maxCompanies,
    });
    const seen = new Map([[rootCnpj, { cnpj: rootCnpj, company: rootCompany, depth: 0 }]]);
    const queue = [{ cnpj: rootCnpj, company: rootCompany, depth: 0 }];
    const companies = [];
    const relationships = [];
    const failures = [];

    while (queue.length > 0 && companies.length < maxCompanies) {
      const current = queue.shift();
      if (current.depth >= maxDepth) continue;
      const shareholders = Array.isArray(current.company?.qsa) ? current.company.qsa : [];
      for (const shareholder of shareholders) {
        const relatedCnpj = String(shareholder.cnpj_cpf_do_socio || '').replace(/\D/g, '');
        if (relatedCnpj.length !== 14) continue;

        let related = seen.get(relatedCnpj);
        if (!related && companies.length < maxCompanies) {
          const response = await CompanyService.getCompanyByCNPJ(relatedCnpj);
          if (!response.ok || !response.data) {
            failures.push({ sourceCnpj: current.cnpj, status: response.status || 503 });
            continue;
          }
          related = { cnpj: relatedCnpj, company: response.data, depth: current.depth + 1, source: response.fonte, consultedAt: response.consultadoEm };
          seen.set(relatedCnpj, related);
          companies.push(related);
          queue.push(related);
        }
        if (related) {
          relationships.push({
            sourceCnpj: relatedCnpj,
            targetCnpj: current.cnpj,
            qualification: shareholder.qualificacao_socio || 'Integrante do QSA',
            joinedAt: shareholder.data_entrada_sociedade || null,
            depth: current.depth + 1,
            provider: related.source || 'BrasilAPI / Receita Federal',
            consultedAt: related.consultedAt || new Date().toISOString(),
          });
        }
      }
    }

    const rawPersonExpansion = await personExpansionPromise;
    const allowedPersonCompanies = new Set([rootCnpj, ...companies.map((item) => item.cnpj)]);

    if (rawPersonExpansion.ok) {
      for (const item of rawPersonExpansion.companies || []) {
        if (allowedPersonCompanies.has(item.cnpj) || companies.length >= maxCompanies) continue;
        const related = {
          cnpj: item.cnpj,
          company: {
            cnpj: item.cnpj,
            razao_social: item.name,
            nome_fantasia: '',
            qsa: [],
          },
          depth: item.depth || 2,
          source: rawPersonExpansion.provider,
          consultedAt: rawPersonExpansion.consultadoEm,
        };
        companies.push(related);
        seen.set(item.cnpj, related);
        allowedPersonCompanies.add(item.cnpj);
      }
    }

    const personExpansion = {
      ...rawPersonExpansion,
      companies: (rawPersonExpansion.companies || []).filter((item) => allowedPersonCompanies.has(item.cnpj)),
      memberships: (rawPersonExpansion.memberships || []).filter((item) => allowedPersonCompanies.has(item.companyCnpj)),
    };
    const personFailures = Number(personExpansion.failures || 0) + (personExpansion.ok ? 0 : 1);

    return {
      ok: true,
      status: 200,
      provider: personExpansion.ok
        ? 'BrasilAPI / Receita Federal + Minha Receita (grafo RFB)'
        : 'BrasilAPI / Receita Federal',
      rootCnpj,
      maxDepth,
      maxCompanies,
      companies,
      relationships,
      personExpansion,
      failures: failures.length + personFailures,
      consultaParcial: failures.length > 0 || queue.length > 0 || personExpansion.consultaParcial || !personExpansion.ok,
      consultadoEm: new Date().toISOString(),
    };
  },
};

module.exports = CompanyService;
