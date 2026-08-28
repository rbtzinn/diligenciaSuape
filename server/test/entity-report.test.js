const test = require('node:test');
const assert = require('node:assert/strict');

const { getEntityReportContext } = require('../src/services/report/entity-report-context');
const { ReportGenerator } = require('../src/services/report/report-generator');
const { sourceCardLayout } = require('../src/services/report/entity-report-sections');
const PDFDocument = require('pdfkit');

function sampleDiligence() {
  return {
    id: 'diligence-entity-report',
    cnpj: '12345678000190',
    razaoSocial: 'EMPRESA PORTUÁRIA DE TESTE LTDA',
    dataAnalise: '2026-08-26T12:00:00.000Z',
    adverseMedia: {
      consultadoEm: '2026-08-26T12:10:00.000Z',
      results: [
        {
          id: 'news-person-1',
          title: 'Pessoa selecionada aparece em conteúdo público',
          url: 'https://example.test/noticias/pessoa-selecionada',
          domain: 'example.test',
          snippet: 'Trecho contextual que exige conferência humana na fonte original.',
          subjectType: 'person',
          subjectName: 'Maria da Silva',
          queriesMatched: ['"Maria da Silva" empresa'],
          status: 'candidate',
          matchStrength: 'medium',
          searchedAt: '2026-08-26T12:10:00.000Z',
        },
        {
          id: 'news-other-person',
          title: 'Conteúdo de outra pessoa',
          url: 'https://example.test/noticias/outra-pessoa',
          domain: 'example.test',
          snippet: 'Este conteúdo não pode entrar no recorte.',
          subjectType: 'person',
          subjectName: 'João de Souza',
          queriesMatched: [],
          status: 'candidate',
          matchStrength: 'low',
        },
      ],
    },
    egos: {
      entities: [
        { id: 'company-1', type: 'Company', name: 'EMPRESA PORTUÁRIA DE TESTE LTDA', role: 'root', depth: 0, confidence: 100, properties: { cnpj: '12345678000190' } },
        { id: 'person-1', type: 'Person', name: 'Maria da Silva', role: 'qsa_member', depth: 1, confidence: 0.92, properties: { qualification: 'Administradora' } },
        { id: 'person-2', type: 'Person', name: 'João de Souza', role: 'qsa_member', depth: 1, confidence: 0.8, properties: {} },
        { id: 'document-1', type: 'Document', name: 'Publicação relacionada', role: 'media_result', depth: 2, confidence: 0.72, properties: { url: 'https://example.test/documentos/publicacao' } },
      ],
      relationships: [
        { id: 'relationship-1', sourceEntityId: 'person-1', targetEntityId: 'company-1', label: 'Administradora de', type: 'OFFICER_OF', status: 'CONFIRMED', confidence: 95, properties: {} },
        { id: 'relationship-2', sourceEntityId: 'person-1', targetEntityId: 'document-1', label: 'Mencionada em', type: 'POSSIBLE_PERSON_OCCURRENCE', status: 'REVIEW', confidence: 65, properties: {} },
        { id: 'relationship-3', sourceEntityId: 'person-2', targetEntityId: 'company-1', label: 'Sócio de', type: 'SHAREHOLDER_OF', status: 'CONFIRMED', confidence: 90, properties: {} },
      ],
      evidences: [
        { id: 'evidence-person', entityId: 'person-1', provider: 'RECEITA', sourceName: 'Receita Federal', sourceUrl: 'https://example.test/fontes/cadastro', excerpt: 'Nome preservado no quadro societário.', retrievedAt: '2026-08-26T12:00:00.000Z' },
        { id: 'evidence-relationship', relationshipId: 'relationship-2', provider: 'WEB', sourceName: 'Pesquisa pública', sourceUrl: 'https://example.test/documentos/publicacao', excerpt: 'Menção nominal ainda não validada.', retrievedAt: '2026-08-26T12:10:00.000Z' },
        { id: 'evidence-other', entityId: 'person-2', provider: 'WEB', sourceName: 'Outra fonte', sourceUrl: 'https://example.test/fontes/outra-pessoa', excerpt: 'Não pertence ao recorte.', retrievedAt: '2026-08-26T12:10:00.000Z' },
      ],
      findings: [
        { id: 'finding-person', entityId: 'person-1', title: 'Validar identidade', explanation: 'A correspondência nominal exige conferência.', status: 'REVIEW' },
        { id: 'finding-other', entityId: 'person-2', title: 'Outro achado', explanation: 'Não pertence ao recorte.', status: 'REVIEW' },
      ],
    },
  };
}

test('relatório contextual inclui somente evidências, notícias e vínculos da entidade selecionada', () => {
  const context = getEntityReportContext(sampleDiligence(), 'person-1');

  assert.equal(context.entity.name, 'Maria da Silva');
  assert.equal(context.relationships.length, 2);
  assert.deepEqual(context.evidences.map((item) => item.id).sort(), ['evidence-person', 'evidence-relationship']);
  assert.deepEqual(context.mediaResults.map((item) => item.id), ['news-person-1']);
  assert.deepEqual(context.findings.map((item) => item.id), ['finding-person']);
  assert.equal(context.sources.some((item) => item.url?.includes('outra-pessoa')), false);
  assert.equal(context.metrics.linkedSources, 3);
});

test('PDF da entidade contém páginas e hyperlinks externos clicáveis', async () => {
  const diligence = sampleDiligence();
  const context = getEntityReportContext(diligence, 'person-1');
  const { buffer, hashValue } = await ReportGenerator.generateEntityBuffer(
    diligence,
    'DIL-2026-000001-ENT',
    context
  );
  const rawPdf = buffer.toString('latin1');

  assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
  assert.ok(buffer.length > 8_000);
  assert.match(hashValue, /^[a-f0-9]{64}$/);
  assert.match(rawPdf, /\/Subtype \/Link/);
  assert.match(rawPdf, /\/URI \(https:\/\/example\.test\/noticias\/pessoa-selecionada\)/);
});

test('cartão de fonte reserva espaço entre trecho da notícia e hyperlink', () => {
  const doc = new PDFDocument({ autoFirstPage: false });
  const layout = sourceCardLayout(doc, {
    title: 'gustavonegreiros.com.br',
    sourceName: 'gustavonegreiros.com.br',
    domain: 'news.google.com',
    excerpt: '“A reorganização do modelo operativo” adotado pelo Banco Master, diz PF - gustavonegreiros.com.br',
    url: 'https://news.google.com/articles/teste',
  });

  assert.ok(layout.excerptHeight > 0);
  assert.ok(layout.footerY >= layout.excerptY + layout.excerptHeight + 10);
  assert.ok(layout.height >= layout.footerY + 18);
  doc.end();
});
