// ==========================================================
// DILIGÊNCIA 360 — Repositório de Diligências (Diligence Repository)
// ==========================================================

const { getPrismaClient } = require('../config/database');
const { DiligenceMappers } = require('./diligence-mappers');
const { EgosService } = require('../egos/core/egos.service');
const crypto = require('crypto');

const memoryDiligences = new Map();

const DiligenceRepository = {
  async saveComplete(companyId, data) {
    const prisma = await getPrismaClient();
    const diligenceId = data.id || crypto.randomUUID();

    if (prisma) {
      return await prisma.$transaction(async (tx) => {
        const diligence = await tx.diligence.create({
          data: {
            id: diligenceId,
            companyId,
            createdById: data.createdById || null,
            reviewedById: data.reviewedById || null,
            status: data.status || 'in_progress',
            startedAt: data.dataAnalise ? new Date(data.dataAnalise) : new Date(),
            completedAt: data.status === 'completed' ? new Date() : null,
            preliminaryScore: data.risco?.score ?? 0,
            preliminaryLevel: data.risco?.nivel ?? 'Atenção Baixa',
            recommendation: data.risco?.decisao || 'Nenhum impedimento identificado',
            summary: data.risco?.decisaoDesc || '',
            companySnapshot: data.empresa || {},
          },
        });

        // 1. Sócios, PEP, Sanções e Mídia
        const shData = DiligenceMappers.mapShareholders(diligenceId, data.socios);
        if (shData.length > 0) await tx.diligenceShareholder.createMany({ data: shData });

        const pepData = DiligenceMappers.mapPepMatches(diligenceId, data.pepResults);
        if (pepData.length > 0) await tx.pepMatch.createMany({ data: pepData });

        const sancData = DiligenceMappers.mapSanctions(diligenceId, data.ceis, data.cnep);
        if (sancData.length > 0) await tx.sanction.createMany({ data: sancData });

        const mediaData = DiligenceMappers.mapAdverseMedia(diligenceId, data.adverseMedia);
        if (mediaData.length > 0) await tx.adverseMediaResult.createMany({ data: mediaData });

        // 2. Processos Judiciais e Descobertas
        if (Array.isArray(data.processosDescobertos)) {
          for (const disc of data.processosDescobertos) {
            const primarySource = disc.primarySource || disc.sources?.[0];
            let procId = null;
            if (disc.dataJud) {
              const upserted = await tx.judicialProcess.upsert({
                where: { processNumber: disc.processNumber },
                update: {
                  formattedNumber: disc.formattedProcessNumber,
                  className: disc.dataJud.classe,
                  courtName: disc.dataJud.orgaoJulgador?.nome,
                  filingDate: disc.dataJud.dataAjuizamento,
                  lastDatajudUpdate: disc.dataJud.ultimaAtualizacao,
                  rawData: disc.dataJud,
                },
                create: {
                  id: crypto.randomUUID(),
                  processNumber: disc.processNumber,
                  formattedNumber: disc.formattedProcessNumber,
                  tribunal: disc.tribunal,
                  degree: disc.dataJud.grau || 'G1',
                  className: disc.dataJud.classe,
                  courtName: disc.dataJud.orgaoJulgador?.nome,
                  filingDate: disc.dataJud.dataAjuizamento,
                  lastDatajudUpdate: disc.dataJud.ultimaAtualizacao,
                  rawData: disc.dataJud,
                },
              });
              procId = upserted.id;
            }

            await tx.processDiscovery.create({
              data: {
                id: crypto.randomUUID(),
                diligenceId,
                judicialProcessId: procId,
                processNumber: disc.processNumber,
                formattedProcessNumber: disc.formattedProcessNumber,
                tribunal: disc.tribunal,
                sourceType: primarySource?.type || 'manual',
                sourceName: primarySource?.name || 'Origem',
                sourceUrl: primarySource?.url || null,
                excerpt: primarySource?.excerpt || null,
                status: disc.status || 'candidate',
              },
            });
          }
        }

        // 3. Indicador de Risco e Trilha
        if (data.risco) {
          await tx.riskAssessment.create({
            data: {
              id: crypto.randomUUID(),
              diligenceId,
              score: data.risco.score,
              level: data.risco.nivel,
              decision: data.risco.decisao,
              decisionDesc: data.risco.decisaoDesc,
              methodologyVersion: 'v1.0',
              breakdown: data.risco.detalhes || [],
            },
          });
        }

        if (Array.isArray(data.timeline)) {
          await tx.auditEvent.createMany({
            data: data.timeline.map((evt) => ({
              id: crypto.randomUUID(),
              diligenceId,
              userId: evt.userId || data.createdById || null,
              eventType: evt.tipo || 'info',
              message: evt.txt || '',
              createdAt: evt.time ? new Date(evt.time) : new Date(),
            })),
          });
        }

        // 4. EGOS — normalização canônica, relações, evidências e cobertura
        const egos = await EgosService.buildAndPersist(tx, diligenceId, data);

        return { ...diligence, egos, persisted: true };
      });
    }

    const storedDiligence = {
      ...data,
      id: diligenceId,
      companyId,
      persisted: false,
      aviso: 'Banco de dados PostgreSQL indisponível. Dossiê salvo temporariamente em memória.',
      createdAt: new Date(),
    };
    memoryDiligences.set(diligenceId, storedDiligence);
    return storedDiligence;
  },

  async findById(id) {
    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.diligence.findUnique({
        where: { id },
        include: {
          company: true,
          createdBy: { select: { id: true, name: true, email: true, role: true } },
          reviewedBy: { select: { id: true, name: true, email: true, role: true } },
          shareholders: true,
          pepMatches: true,
          sanctions: true,
          adverseMedia: true,
          discoveries: { include: { judicialProcess: true } },
          evidences: true,
          riskAssessment: true,
          reviewActions: { include: { user: { select: { id: true, name: true } } }, orderBy: { reviewedAt: 'desc' } },
          auditEvents: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
          egosRun: {
            include: {
              entities: {
                include: {
                  entity: { include: { identifiers: true, aliases: true } },
                },
              },
              relationships: {
                include: {
                  relationship: { include: { sourceEntity: true, targetEntity: true } },
                },
              },
              evidences: true,
              coverage: true,
              findings: true,
              resolutions: { include: { sourceEntity: true, candidateEntity: true } },
            },
          },
        },
      });
    }
    return memoryDiligences.get(id) || null;
  },

  async listAll(limit = 100, filters = {}) {
    const prisma = await getPrismaClient();
    if (prisma) {
      const where = {};
      if (filters.status) where.status = filters.status;
      if (filters.responsibleId) where.createdById = filters.responsibleId;
      if (filters.reviewerId) where.reviewedById = filters.reviewerId;
      if (filters.level) where.preliminaryLevel = filters.level;
      if (filters.cnpj) {
        where.company = { cnpj: filters.cnpj.replace(/\D/g, '') };
      }

      return await prisma.diligence.findMany({
        where,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          company: true,
          createdBy: { select: { id: true, name: true, role: true } },
          reviewedBy: { select: { id: true, name: true, role: true } },
          riskAssessment: true,
        },
      });
    }
    return Array.from(memoryDiligences.values())
      .sort((a, b) => new Date(b.dataAnalise).getTime() - new Date(a.dataAnalise).getTime())
      .slice(0, limit);
  },

  async updateDiligence(id, data) {
    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.diligence.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
      });
    }

    const current = memoryDiligences.get(id);
    if (!current) return null;
    const updated = { ...current, ...data, updatedAt: new Date() };
    memoryDiligences.set(id, updated);
    return updated;
  },

  async delete(id) {
    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.diligence.delete({
        where: { id },
      });
    }

    memoryDiligences.delete(id);
    return true;
  },
};

module.exports = { DiligenceRepository };
