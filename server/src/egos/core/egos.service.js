const crypto = require('crypto');
const { EgosGraphBuilder } = require('./egos-graph-builder');
const { adaptReceita } = require('../adapters/receita.adapter');
const { adaptCgu } = require('../adapters/cgu.adapter');
const { adaptExternalResults } = require('../adapters/external-results.adapter');
const { adaptInternalSuape } = require('../adapters/internal-suape/internal-suape.adapter');
const { syncEvidenceCenterToEgos } = require('../../services/evidence-center.service');

function materializeSnapshot(snapshot) {
  const runId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  const entityIdByKey = new Map(
    snapshot.entities.map((entity) => [entity.key, crypto.randomUUID()])
  );
  const relationshipIdByKey = new Map(
    snapshot.relationships.map((relationship) => [relationship.key, crypto.randomUUID()])
  );

  return {
    runId,
    version: 'egos-2.0-snapshot',
    generatedAt,
    metrics: snapshot.metrics,
    insights: snapshot.insights,
    entities: snapshot.entities.map((entity) => ({
      ...entity,
      id: entityIdByKey.get(entity.key),
    })),
    relationships: snapshot.relationships.map((relationship) => ({
      ...relationship,
      id: relationshipIdByKey.get(relationship.key),
      sourceEntityId: entityIdByKey.get(relationship.sourceKey),
      targetEntityId: entityIdByKey.get(relationship.targetKey),
      sourceName: snapshot.entities.find((entity) => entity.key === relationship.sourceKey)?.name,
      targetName: snapshot.entities.find((entity) => entity.key === relationship.targetKey)?.name,
    })),
    evidences: snapshot.evidences.map((evidence) => ({
      ...evidence,
      id: crypto.randomUUID(),
      entityId: evidence.entityKey ? entityIdByKey.get(evidence.entityKey) : undefined,
      relationshipId: evidence.relationshipKey ? relationshipIdByKey.get(evidence.relationshipKey) : undefined,
      retrievedAt: evidence.retrievedAt?.toISOString?.() || String(evidence.retrievedAt || generatedAt),
    })),
    coverage: snapshot.coverage.map((entry) => ({
      ...entry,
      id: crypto.randomUUID(),
      consultedAt: entry.consultedAt?.toISOString?.() || entry.consultedAt || undefined,
      validUntil: entry.validUntil?.toISOString?.() || entry.validUntil || undefined,
    })),
    findings: snapshot.findings.map((finding) => ({
      ...finding,
      id: crypto.randomUUID(),
      entityId: finding.entityKey ? entityIdByKey.get(finding.entityKey) : undefined,
      relationshipId: finding.relationshipKey ? relationshipIdByKey.get(finding.relationshipKey) : undefined,
    })),
    resolutions: snapshot.resolutions.map((resolution) => ({
      ...resolution,
      id: crypto.randomUUID(),
      sourceEntityId: entityIdByKey.get(resolution.sourceEntityKey),
      candidateEntityId: entityIdByKey.get(resolution.candidateEntityKey),
      sourceName: snapshot.entities.find((entity) => entity.key === resolution.sourceEntityKey)?.name,
      candidateName: snapshot.entities.find((entity) => entity.key === resolution.candidateEntityKey)?.name,
    })),
  };
}

const EgosService = {
  async build(diligenceId, payload) {
    const builder = new EgosGraphBuilder({
      diligenceId,
      rootCnpj: payload.cnpj,
      startedAt: payload.dataAnalise ? new Date(payload.dataAnalise) : new Date(),
    });

    const context = adaptReceita(builder, payload);
    adaptCgu(builder, context, payload);
    adaptExternalResults(builder, context, payload);
    await adaptInternalSuape(
      builder,
      context,
      null,
      process.env.INTERNAL_SUAPE_ORGANIZATION || 'SUAPE'
    );

    const resolutionCount = builder.resolutions.length;
    builder.addCoverage({
      axis: 'ENTITY_RESOLUTION',
      provider: 'EGOS_ENTITY_RESOLUTION',
      status: resolutionCount > 0 ? 'CONSULTED' : 'NOT_APPLICABLE',
      message: resolutionCount > 0
        ? `${resolutionCount} candidato(s) foram pontuados por regras explicáveis.`
        : 'Nenhum candidato de identidade exigiu comparação nesta execução.',
      resultCount: resolutionCount,
      consultedAt: new Date(),
    });

    builder.addCoverage({
      axis: 'RELATIONSHIPS',
      provider: 'EGOS_GRAPH',
      status: 'CONSULTED',
      message: `${builder.entities.size} entidade(s) e ${builder.relationships.size} relação(ões) foram estruturadas com proveniência.`,
      resultCount: builder.relationships.size,
      consultedAt: new Date(),
    });
    builder.addInsight(`${builder.relationships.size} relação(ões) possuem evidência rastreável nesta diligência.`);

    const projectedSnapshot = {
      ...payload,
      id: diligenceId,
      egos: materializeSnapshot(builder.toSnapshot()),
    };
    syncEvidenceCenterToEgos(projectedSnapshot);
    return projectedSnapshot.egos;
  },

  async buildAndPersist(_tx, diligenceId, payload) {
    return await this.build(diligenceId, payload);
  },
};

module.exports = { EgosService };
