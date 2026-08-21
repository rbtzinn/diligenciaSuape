const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { EgosService } = require('../src/egos/core/egos.service');

const ROLLBACK_MARKER = 'EGOS_TEST_ROLLBACK';

test('persiste o EGOS completo no PostgreSQL sem deixar dados de teste', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const diligenceId = `test-egos-${crypto.randomUUID()}`;
  const companyId = crypto.randomUUID();
  const payload = {
    id: diligenceId,
    cnpj: '11222333000181',
    razaoSocial: 'EMPRESA CONTROLADA DE TESTE EGOS LTDA',
    dataAnalise: new Date().toISOString(),
    companySource: 'Provider de teste controlado',
    empresa: {
      cnpj: '11222333000181',
      razao_social: 'EMPRESA CONTROLADA DE TESTE EGOS LTDA',
      descricao_situacao_cadastral: 'ATIVA',
      municipio: 'IPOJUCA',
      uf: 'PE',
    },
    socios: [{ nome_socio: 'Pessoa Controlada de Teste', qualificacao_socio: 'Sócio-Administrador' }],
    ceis: { ok: true, fonte: 'CGU / CEIS', encontrado: false, quantidade: 0, registros: [] },
    cnep: { ok: true, fonte: 'CGU / CNEP', encontrado: false, quantidade: 0, registros: [] },
    pepResults: [{
      nome: 'Pessoa Controlada de Teste',
      ok: true,
      encontrado: true,
      quantidade: 2,
      registros: [{
        nome: 'Pessoa Controlada de Teste',
        orgao: 'Órgão Público de Teste',
        funcao: 'Função de Teste',
        inicio: '2024-01-01',
        fim: null,
      }, {
        nome: 'Pessoa Controlada de Teste',
        orgao: 'Órgão Público de Teste',
        funcao: 'Função de Teste',
        inicio: '2025-01-01',
        fim: null,
      }],
    }],
    adverseMedia: { ok: false, semChave: true, results: [], aviso: 'Provider não configurado no teste.' },
    processosDescobertos: [],
  };

  try {
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.company.create({
          data: {
            id: companyId,
            cnpj: payload.cnpj,
            corporateName: payload.razaoSocial,
          },
        });
        await tx.diligence.create({
          data: {
            id: diligenceId,
            companyId,
            recommendation: 'Teste controlado',
            companySnapshot: payload.empresa,
          },
        });

        const egos = await EgosService.buildAndPersist(tx, diligenceId, payload);
        assert.ok(egos.metrics.entities >= 2);
        assert.ok(egos.metrics.relationships >= 1);
        assert.ok(egos.metrics.evidences >= 2);

        const storedRun = await tx.egosRun.findUnique({
          where: { diligenceId },
          include: { entities: true, relationships: true, evidences: true, coverage: true, findings: true },
        });
        assert.ok(storedRun);
        assert.equal(storedRun.entities.length, egos.metrics.entities);
        assert.equal(storedRun.relationships.length, egos.metrics.relationships);
        assert.equal(storedRun.evidences.length, egos.metrics.evidences);
        assert.ok(storedRun.coverage.some((item) => item.axis === 'MEDIA' && item.status === 'UNAVAILABLE'));
        assert.ok(storedRun.coverage.some((item) => item.axis === 'INTERNAL_SUAPE' && item.status === 'CONSULTED'));

        throw new Error(ROLLBACK_MARKER);
      }),
      new RegExp(ROLLBACK_MARKER)
    );

    assert.equal(await prisma.diligence.count({ where: { id: diligenceId } }), 0);
    assert.equal(await prisma.company.count({ where: { id: companyId } }), 0);
  } finally {
    await prisma.$disconnect();
  }
});
