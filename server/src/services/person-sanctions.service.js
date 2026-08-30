// ==========================================================
// DILIGÊNCIA 360 — Sanções de sócios pessoa física
//
// O CEIS e o CNEP incluem pessoas físicas, mas o QSA público não traz o
// CPF completo do sócio — só seis dígitos mascarados. Por isso a consulta
// é nominal, e cada retorno vira um CANDIDATO, nunca uma confirmação:
// a identidade só se sustenta com o CPF mascarado coincidente, e mesmo
// aí o índice máximo continua abaixo da certeza.
// ==========================================================

const CguService = require('./cgu.service');
const { comparePerson } = require('../egos/entity-resolution/entity-resolution.service');
const { normalizeName } = require('../egos/domain/normalization');

const CADASTROS = ['CEIS', 'CNEP'];

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Sócio pessoa física: documento mascarado ou ausente, nunca um CNPJ de 14 dígitos. */
function isNaturalPerson(shareholder) {
  const raw = String(shareholder?.cnpj_cpf_do_socio || '');
  const digits = raw.replace(/\D/g, '');
  if (raw.includes('*')) return true;
  return digits.length !== 14;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next;
      next += 1;
      output[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return output;
}

/**
 * Deriva o status de cobertura a partir do que cada cadastro respondeu.
 * Distingue "consultado e nada encontrado" de "não deu para consultar".
 */
function coverageFrom(queries) {
  if (queries.length === 0) return { status: 'NOT_APPLICABLE', message: 'Nenhum sócio pessoa física no quadro societário.' };
  const failed = queries.filter((q) => !q.ok);
  if (failed.length === queries.length) {
    const semChave = failed.every((q) => q.semChave);
    return {
      status: 'UNAVAILABLE',
      message: semChave
        ? 'Integração CGU não configurada; nenhum sócio pôde ser rastreado.'
        : 'A fonte não respondeu para nenhum dos sócios pesquisados.',
    };
  }
  if (failed.length > 0 || queries.some((q) => q.consultaParcial)) {
    return {
      status: 'PARTIAL',
      message: `${queries.length - failed.length} de ${queries.length} consulta(s) concluída(s); o restante não pôde ser verificado.`,
    };
  }
  return { status: 'CONSULTED', message: 'Todos os sócios pessoa física foram pesquisados nos dois cadastros.' };
}

const PersonSanctionsService = {
  /**
   * @param {Array} shareholders quadro societário vindo da Receita
   * @returns candidatos por pessoa, com índice de compatibilidade e cobertura
   */
  async screen(shareholders = [], options = {}) {
    // Cliente injetável: os testes exercitam a resolução de identidade sem rede,
    // como já é feito na expansão societária por pessoa.
    const client = options.client || CguService;
    const maxPeople = clampInteger(
      options.maxPeople ?? process.env.PERSON_SANCTIONS_MAX_PEOPLE, 20, 1, 40,
    );
    const concurrency = clampInteger(
      options.concurrency ?? process.env.PERSON_SANCTIONS_CONCURRENCY, 3, 1, 5,
    );

    const people = (Array.isArray(shareholders) ? shareholders : [])
      .filter((s) => s && String(s.nome_socio || '').trim() && isNaturalPerson(s));

    // Um mesmo nome pode aparecer em mais de uma qualificação no QSA.
    const unique = [...new Map(people.map((p) => [normalizeName(p.nome_socio), p])).values()];
    const searched = unique.slice(0, maxPeople);
    const consultedAt = new Date().toISOString();

    const queries = [];
    const results = await mapWithConcurrency(searched, concurrency, async (person) => {
      const perCadastro = await Promise.all(CADASTROS.map(async (cadastro) => {
        const response = await client.searchSanctionsByName(cadastro, person.nome_socio);
        queries.push({ ok: response.ok, semChave: response.semChave, consultaParcial: response.consultaParcial });
        return { cadastro, response };
      }));

      const candidates = [];
      for (const { cadastro, response } of perCadastro) {
        if (!response.ok) continue;
        for (const record of response.registros || []) {
          const resolution = comparePerson(
            { name: person.nome_socio, maskedCpf: person.cnpj_cpf_do_socio },
            { name: record.sancionado, maskedCpf: record.documentoSancionado, organization: record.orgao },
          );
          // Abaixo de 40 a coincidência é fraca demais para ocupar a atenção
          // de quem revisa; o limite é o mesmo já usado no cruzamento de PEP.
          if (resolution.score < 40) continue;
          candidates.push({
            cadastro,
            sancionado: record.sancionado,
            documentoSancionado: record.documentoSancionado,
            orgao: record.orgao,
            sancao: record.sancao,
            inicio: record.inicio,
            fim: record.fim,
            vigente: record.vigente,
            processo: record.processo,
            fonte: response.fonte,
            score: resolution.score,
            status: resolution.status,
            signals: resolution.signals,
            requiresHumanReview: true,
            identityConfirmed: false,
          });
        }
      }
      candidates.sort((a, b) => b.score - a.score);

      return {
        nome: person.nome_socio,
        qualificacao: person.qualificacao_socio || '',
        maskedCpf: person.cnpj_cpf_do_socio || null,
        consultado: perCadastro.some(({ response }) => response.ok),
        cadastrosIndisponiveis: perCadastro.filter(({ response }) => !response.ok).map(({ cadastro }) => cadastro),
        candidatos: candidates,
      };
    });

    const coverage = coverageFrom(queries);
    const strong = results.reduce((acc, r) => acc + r.candidatos.filter((c) => c.score >= 90).length, 0);
    const total = results.reduce((acc, r) => acc + r.candidatos.length, 0);

    return {
      ok: coverage.status !== 'UNAVAILABLE',
      provider: 'Portal da Transparência (CGU / CEIS e CNEP) — busca nominal',
      consultadoEm: consultedAt,
      peopleInQsa: people.length,
      peopleSearched: searched.length,
      peopleTruncated: unique.length > searched.length,
      totalCandidates: total,
      strongCandidates: strong,
      coverageStatus: coverage.status,
      aviso: coverage.message,
      limitacao: 'O QSA público não expõe o CPF completo do sócio, então a busca é nominal. '
        + 'Nenhum resultado confirma identidade: homônimos são frequentes e a validação documental é obrigatória.',
      resultados: results,
    };
  },
};

module.exports = { PersonSanctionsService, isNaturalPerson, coverageFrom };
