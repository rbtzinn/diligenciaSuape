const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PersonCorporateNetworkService,
  cleanMaskedCpf,
} = require('../src/services/person-corporate-network.service');
const { detectCoMentionedSubjects } = require('../src/services/adverse-media.service');
const { EgosGraphBuilder } = require('../src/egos/core/egos-graph-builder');
const { adaptReceita } = require('../src/egos/adapters/receita.adapter');
const { adaptExternalResults } = require('../src/egos/adapters/external-results.adapter');

const ROOT_CNPJ = '20867216000166';
const RELATED_CNPJ = '22723786000108';
const PERSON_ID = '50be9b48ac44166ded5073418137f4e8';
const PERSON_NAME = 'ANTONIO FERNANDO DE OLIVEIRA NERI';

function graphRow(cnpj, companyName) {
  return {
    cnpj,
    razao_social: companyName,
    id: PERSON_ID,
    nome: PERSON_NAME,
    cpf: '***241594**',
  };
}

test('expande outras empresas pelo identificador derivado de nome e CPF mascarado', async () => {
  const responses = new Map([
    [`https://grafo.test/${ROOT_CNPJ}`, [graphRow(ROOT_CNPJ, 'NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA')]],
    [`https://grafo.test/${PERSON_ID}`, [
      graphRow(ROOT_CNPJ, 'NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA'),
      graphRow(RELATED_CNPJ, 'RE9ONLINE SERVICOS SOLUCOES WEB LTDA'),
    ]],
  ]);
  const fetcher = async (url) => {
    const payload = responses.get(url);
    return new Response(JSON.stringify(payload || []), {
      status: payload ? 200 : 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const service = new PersonCorporateNetworkService({ baseUrl: 'https://grafo.test', fetcher });
  const result = await service.expand({ cnpj: ROOT_CNPJ }, { maxPeople: 5, maxCompanies: 5 });

  assert.equal(result.ok, true);
  assert.equal(result.people.length, 1);
  assert.equal(result.people[0].maskedCpf, '***241594**');
  assert.deepEqual(result.companies.map((item) => item.cnpj), [RELATED_CNPJ]);
  assert.equal(result.memberships.some((item) => item.companyCnpj === RELATED_CNPJ), true);
  assert.equal(JSON.stringify(result).includes('241594'), true);
  assert.equal(JSON.stringify(result).includes('12324159400'), false);
});

test('descarta CPF completo mesmo se uma fonte externa o devolver por engano', () => {
  assert.equal(cleanMaskedCpf('123.241.594-00'), '');
  assert.equal(cleanMaskedCpf('***.241.594-**'), '***241594**');
});

test('detecta somente co-menções exatas entre entidades conhecidas', () => {
  const subjects = detectCoMentionedSubjects(
    {
      cnpj: ROOT_CNPJ,
      razaoSocial: 'NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA',
      nomeFantasia: 'NERI LOCACOES E SERVICOS',
    },
    [
      { nome_socio: PERSON_NAME, cnpj_cpf_do_socio: '***241594**' },
      { nome_socio: 'MARIA SOUZA PEREIRA', cnpj_cpf_do_socio: '***111222**' },
    ],
    `A NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA informou que ${PERSON_NAME} assinou o documento.`,
  );

  assert.deepEqual(subjects.map((item) => item.subjectType), ['company', 'person']);
  assert.equal(subjects.some((item) => item.subjectName === 'MARIA SOUZA PEREIRA'), false);
});

test('EGOS materializa empresa adicional como hipótese rastreável do QSA público', () => {
  const payload = {
    id: 'diligence-person-network',
    cnpj: ROOT_CNPJ,
    razaoSocial: 'NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA',
    dataAnalise: '2026-08-28T12:00:00.000Z',
    companySource: 'BrasilAPI',
    empresa: {
      cnpj: ROOT_CNPJ,
      razao_social: 'NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA',
      descricao_situacao_cadastral: 'ATIVA',
    },
    socios: [{
      nome_socio: PERSON_NAME,
      qualificacao_socio: 'Sócio-Administrador',
      cnpj_cpf_do_socio: '***241594**',
    }],
    pepResults: [],
    processosDescobertos: [],
    corporateNetwork: {
      ok: true,
      provider: 'BrasilAPI + Minha Receita',
      rootCnpj: ROOT_CNPJ,
      maxDepth: 2,
      companies: [{
        cnpj: RELATED_CNPJ,
        company: { cnpj: RELATED_CNPJ, razao_social: 'RE9ONLINE SERVICOS SOLUCOES WEB LTDA' },
        depth: 2,
        source: 'Minha Receita',
      }],
      relationships: [],
      consultaParcial: false,
      consultadoEm: '2026-08-28T12:00:00.000Z',
      personExpansion: {
        ok: true,
        provider: 'Minha Receita — grafo societário (dados RFB)',
        people: [{ id: PERSON_ID, name: PERSON_NAME, maskedCpf: '***241594**' }],
        peopleExpanded: 1,
        memberships: [
          {
            personId: PERSON_ID,
            personName: PERSON_NAME,
            maskedCpf: '***241594**',
            companyCnpj: ROOT_CNPJ,
            companyName: 'NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA',
            isRootCompany: true,
            confidence: 85,
          },
          {
            personId: PERSON_ID,
            personName: PERSON_NAME,
            maskedCpf: '***241594**',
            companyCnpj: RELATED_CNPJ,
            companyName: 'RE9ONLINE SERVICOS SOLUCOES WEB LTDA',
            isRootCompany: false,
            confidence: 85,
            matchBasis: 'EXACT_NAME_AND_MASKED_CPF_HASH',
            sourceUrl: `https://grafo.test/${PERSON_ID}`,
          },
        ],
        consultadoEm: '2026-08-28T12:00:00.000Z',
      },
    },
  };
  const builder = new EgosGraphBuilder({ diligenceId: payload.id, rootCnpj: payload.cnpj });
  const context = adaptReceita(builder, payload);
  adaptExternalResults(builder, context, payload);
  const snapshot = builder.toSnapshot();
  const relationship = snapshot.relationships.find((item) => item.type === 'QSA_MEMBER_OF');

  assert.ok(relationship);
  assert.equal(relationship.status, 'PROBABLE');
  assert.equal(relationship.targetKey, `company:cnpj:${RELATED_CNPJ}`);
  assert.equal(snapshot.evidences.some((item) => item.relationshipKey === relationship.key && item.sourceUrl), true);
  assert.equal(snapshot.coverage.find((item) => item.axis === 'PERSON_CORPORATE_LINKS').status, 'CONSULTED');
});

test('EGOS cria aresta direta quando duas entidades aparecem na mesma publicação', () => {
  const payload = {
    id: 'diligence-co-mention',
    cnpj: ROOT_CNPJ,
    razaoSocial: 'NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA',
    dataAnalise: '2026-08-28T12:00:00.000Z',
    empresa: { cnpj: ROOT_CNPJ, razao_social: 'NERI LOCACOES DE MAQUINAS E EQUIPAMENTOS LTDA', descricao_situacao_cadastral: 'ATIVA' },
    socios: [
      { nome_socio: PERSON_NAME, qualificacao_socio: 'Administrador', cnpj_cpf_do_socio: '***241594**' },
      { nome_socio: 'MARIA SOUZA PEREIRA', qualificacao_socio: 'Sócia', cnpj_cpf_do_socio: '***111222**' },
    ],
    pepResults: [],
    processosDescobertos: [],
    adverseMedia: {
      ok: true,
      peopleSearched: 2,
      results: [{
        title: 'Duas pessoas citadas na mesma publicação',
        url: 'https://example.test/co-mencao',
        domain: 'example.test',
        snippet: `${PERSON_NAME} e MARIA SOUZA PEREIRA participaram do mesmo evento público.`,
        subjectType: 'person',
        subjectName: PERSON_NAME,
        matchStrength: 'medium',
        matchedTerms: [],
        categories: [],
        queriesMatched: ['consulta nominal'],
        personMatch: { fullName: true },
        coMentionedSubjects: [
          { subjectType: 'person', subjectName: PERSON_NAME, confidence: 65, matchBasis: ['EXACT_NAME'] },
          { subjectType: 'person', subjectName: 'MARIA SOUZA PEREIRA', confidence: 65, matchBasis: ['EXACT_NAME'] },
        ],
      }],
    },
  };
  const builder = new EgosGraphBuilder({ diligenceId: payload.id, rootCnpj: payload.cnpj });
  const context = adaptReceita(builder, payload);
  adaptExternalResults(builder, context, payload);
  const snapshot = builder.toSnapshot();
  const coMention = snapshot.relationships.find((item) => item.type === 'CO_MENTIONED_WITH');

  assert.ok(coMention);
  assert.equal(coMention.status, 'CANDIDATE');
  assert.equal(snapshot.evidences.some((item) => item.relationshipKey === coMention.key && item.sourceUrl === 'https://example.test/co-mencao'), true);
});
