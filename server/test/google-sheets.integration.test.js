const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { setGoogleSheetsClientForTests } = require('../src/config/google-sheets');
const { DiligenceRepository } = require('../src/repositories/diligence.repository');
const { ReviewRepository } = require('../src/repositories/review.repository');
const { ReportRepository } = require('../src/repositories/report.repository');

function columnIndex(letters) {
  return String(letters).split('').reduce((total, letter) => (
    (total * 26) + letter.charCodeAt(0) - 64
  ), 0) - 1;
}

class FakeSheetsClient {
  constructor() {
    this.sheets = {
      Diligencias: [DiligenceRepository.INDEX_HEADERS],
      Payloads: [['diligence_id', 'versao', 'parte', 'total_partes', 'conteudo', 'payload_sha256', 'criado_em', 'ativo']],
      Auditoria: [['id', 'diligence_id', 'acao', 'entidade_tipo', 'entidade_id', 'status_anterior', 'status_novo', 'justificativa', 'usuario_uid', 'usuario_email', 'usuario_nome', 'criado_em', 'metadados_json']],
      Relatorios: [['id', 'diligence_id', 'versao', 'numero_relatorio', 'nome_arquivo', 'mime_type', 'hash_algoritmo', 'hash_valor', 'gerado_por_uid', 'gerado_por_email', 'gerado_por_nome', 'gerado_em']],
      Configuracao: [['chave', 'valor', 'descricao'], ['schema_version', 2, 'Teste']],
    };
  }

  isConfigured() {
    return true;
  }

  async healthCheck() {
    return true;
  }

  parse(range) {
    const [sheet, address] = range.split('!');
    const match = address.match(/^([A-Z]+)(\d*):([A-Z]+)(\d*)$/i);
    if (!match) throw new Error(`Faixa de teste inválida: ${range}`);
    const rows = this.sheets[sheet];
    if (!rows) throw new Error(`Aba de teste inexistente: ${sheet}`);
    return {
      sheet,
      rows,
      startColumn: columnIndex(match[1]),
      endColumn: columnIndex(match[3]),
      startRow: match[2] ? Number(match[2]) : 1,
      endRow: match[4] ? Number(match[4]) : rows.length,
      endColumnLetters: match[3],
    };
  }

  async getValues(range) {
    const parsed = this.parse(range);
    return parsed.rows
      .slice(parsed.startRow - 1, parsed.endRow)
      .map((row) => row.slice(parsed.startColumn, parsed.endColumn + 1));
  }

  async appendValues(range, values) {
    const parsed = this.parse(range);
    const start = parsed.rows.length + 1;
    values.forEach((row) => parsed.rows.push(structuredClone(row)));
    const end = parsed.rows.length;
    return {
      updates: {
        updatedRange: `'${parsed.sheet}'!A${start}:${parsed.endColumnLetters}${end}`,
      },
    };
  }

  async updateValues(range, values) {
    const parsed = this.parse(range);
    values.forEach((incoming, rowOffset) => {
      const targetIndex = parsed.startRow - 1 + rowOffset;
      const target = parsed.rows[targetIndex] || [];
      incoming.forEach((value, columnOffset) => {
        target[parsed.startColumn + columnOffset] = structuredClone(value);
      });
      parsed.rows[targetIndex] = target;
    });
    return { updatedRange: range };
  }
}

test('persiste, versiona, revisa e exclui logicamente no formato Google Sheets', async () => {
  const fake = new FakeSheetsClient();
  setGoogleSheetsClientForTests(fake);

  const id = `diligence-${crypto.randomUUID()}`;
  const findingId = crypto.randomUUID();
  const incompressibleText = crypto.randomBytes(80_000).toString('hex');
  const user = {
    id: 'firebase-user-1',
    firebaseUid: 'firebase-user-1',
    email: 'auditor@example.com',
    name: 'Auditor Teste',
  };
  const snapshot = {
    id,
    cnpj: '12.345.678/0001-90',
    razaoSocial: 'EMPRESA DE TESTE LTDA',
    nomeFantasia: 'EMPRESA TESTE',
    status: 'in_progress',
    dataAnalise: '2026-08-25T12:00:00.000Z',
    createdBy: user,
    empresa: { cnpj: '12345678000190', razao_social: 'EMPRESA DE TESTE LTDA' },
    risco: {
      score: 20,
      nivel: 'Atenção Moderada',
      decisao: 'Realizar Análise Complementar',
      decisaoDesc: 'Teste',
      detalhes: [],
    },
    timeline: [],
    egos: {
      findings: [{ id: findingId, reviewStatus: 'pending', title: 'Achado controlado' }],
      resolutions: [],
    },
    provaDeIntegridade: incompressibleText,
  };

  const saved = await DiligenceRepository.saveComplete(snapshot, {
    audit: { user, action: 'create', entityType: 'diligence', entityId: id, newStatus: 'in_progress' },
  });
  assert.equal(saved.persisted, true);
  assert.ok(fake.sheets.Payloads.length > 2, 'payload grande deve ser dividido em múltiplas células');

  const restored = await DiligenceRepository.findById(id);
  assert.equal(restored.provaDeIntegridade, incompressibleText);
  assert.equal(restored.razaoSocial, snapshot.razaoSocial);

  const list = await DiligenceRepository.listAll(10, { cnpj: '12345678000190' });
  assert.equal(list.length, 1);
  assert.equal(list[0].preliminaryScore, 20);

  await ReviewRepository.recordReview({
    diligenceId: id,
    user,
    entityType: 'egos_finding',
    entityId: findingId,
    action: 'validate',
    previousStatus: 'pending',
    newStatus: 'confirmed',
    justification: 'Evidência conferida no teste automatizado.',
  });
  assert.equal((await DiligenceRepository.findById(id)).egos.findings[0].reviewStatus, 'confirmed');

  const finalRisk = await ReviewRepository.overrideRisk({
    diligenceId: id,
    user,
    score: 65,
    level: 'Atenção Crítica',
    justification: 'Convergência controlada de sinais no teste.',
    reviewedBy: user.name,
  });
  assert.equal(finalRisk.score, 65);
  assert.equal((await DiligenceRepository.findById(id)).risco.manualOverride.automaticScore, 20);

  await ReportRepository.createReport({
    diligenceId: id,
    version: 1,
    reportNumber: 'DIL-2026-000001',
    fileName: 'teste.pdf',
    hashValue: 'abc123',
    generatedBy: user,
    generatedAt: new Date('2026-08-25T13:00:00.000Z'),
  });
  assert.equal((await ReportRepository.listByDiligenceId(id))[0].generatedBy.email, user.email);

  assert.ok(fake.sheets.Auditoria.length >= 4);
  assert.equal(await DiligenceRepository.delete(id, user), true);
  assert.equal(await DiligenceRepository.findById(id), null);
  assert.equal((await DiligenceRepository.findById(id, { includeDeleted: true })).id, id);
});
