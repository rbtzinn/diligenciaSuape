const crypto = require('crypto');
const { normalizeName } = require('../domain/normalization');

async function persistSnapshot(tx, diligenceId, rootCnpj, snapshot) {
  const entityIdByKey = new Map();
  for (const entity of snapshot.entities) {
    const stored = await tx.canonicalEntity.upsert({
      where: { canonicalKey: entity.key },
      update: {
        entityType: entity.type,
        name: entity.name,
        normalizedName: entity.normalizedName || normalizeName(entity.name),
        properties: entity.properties || {},
      },
      create: {
        id: crypto.randomUUID(),
        entityType: entity.type,
        canonicalKey: entity.key,
        name: entity.name,
        normalizedName: entity.normalizedName || normalizeName(entity.name),
        properties: entity.properties || {},
      },
    });
    entityIdByKey.set(entity.key, stored.id);

    const identifiers = entity.identifiers
      .filter((item) => item.value)
      .map((item) => ({
        id: crypto.randomUUID(),
        entityId: stored.id,
        identifierType: item.type,
        value: String(item.value),
        provider: item.provider,
        confidence: item.confidence ?? 100,
      }));
    if (identifiers.length > 0) await tx.egosEntityIdentifier.createMany({ data: identifiers, skipDuplicates: true });

    const aliases = entity.aliases
      .filter((item) => item.value)
      .map((item) => ({
        id: crypto.randomUUID(),
        entityId: stored.id,
        value: item.value,
        normalized: normalizeName(item.value),
        aliasType: item.type || 'name',
        provider: item.provider,
      }));
    if (aliases.length > 0) await tx.egosEntityAlias.createMany({ data: aliases, skipDuplicates: true });
  }

  const runId = crypto.randomUUID();
  const completedAt = new Date();
  await tx.egosRun.create({
    data: {
      id: runId,
      diligenceId,
      rootEntityId: entityIdByKey.get(snapshot.rootEntityKey) || null,
      status: 'completed',
      maxDepth: 2,
      metrics: snapshot.metrics,
      summary: {
        version: 'egos-1.0',
        rootCnpj,
        insights: snapshot.insights,
        generatedAt: completedAt.toISOString(),
      },
      completedAt,
    },
  });

  await tx.egosRunEntity.createMany({
    data: snapshot.entities.map((entity) => ({
      id: crypto.randomUUID(),
      runId,
      entityId: entityIdByKey.get(entity.key),
      depth: entity.depth ?? 0,
      role: entity.role || 'related',
      confidence: entity.confidence ?? 100,
    })),
  });

  const relationshipIdByKey = new Map();
  for (const relationship of snapshot.relationships) {
    const stored = await tx.canonicalRelationship.upsert({
      where: { canonicalKey: relationship.key },
      update: {
        label: relationship.label,
        properties: relationship.properties || {},
      },
      create: {
        id: crypto.randomUUID(),
        canonicalKey: relationship.key,
        sourceEntityId: entityIdByKey.get(relationship.sourceKey),
        targetEntityId: entityIdByKey.get(relationship.targetKey),
        relationshipType: relationship.type,
        label: relationship.label,
        properties: relationship.properties || {},
      },
    });
    relationshipIdByKey.set(relationship.key, stored.id);
  }

  if (snapshot.relationships.length > 0) {
    await tx.egosRunRelationship.createMany({
      data: snapshot.relationships.map((relationship) => ({
        id: crypto.randomUUID(),
        runId,
        relationshipId: relationshipIdByKey.get(relationship.key),
        status: relationship.status,
        confidence: relationship.confidence,
      })),
    });
  }

  const evidenceRows = snapshot.evidences.map((evidence) => ({
    id: crypto.randomUUID(),
    runId,
    entityId: evidence.entityKey ? entityIdByKey.get(evidence.entityKey) || null : null,
    relationshipId: evidence.relationshipKey ? relationshipIdByKey.get(evidence.relationshipKey) || null : null,
    provider: evidence.provider,
    sourceName: evidence.sourceName,
    sourceUrl: evidence.sourceUrl || null,
    query: evidence.query || null,
    identifier: evidence.identifier || null,
    excerpt: evidence.excerpt || null,
    confidence: evidence.confidence ?? null,
    rawReference: evidence.rawReference || null,
    retrievedAt: evidence.retrievedAt || new Date(),
  }));
  if (evidenceRows.length > 0) await tx.egosEvidence.createMany({ data: evidenceRows });

  const coverageRows = snapshot.coverage.map((entry) => ({
    id: crypto.randomUUID(),
    runId,
    axis: entry.axis,
    provider: entry.provider,
    status: entry.status,
    message: entry.message,
    resultCount: entry.resultCount || 0,
    consultedAt: entry.consultedAt || null,
    validUntil: entry.validUntil || null,
  }));
  if (coverageRows.length > 0) await tx.egosCoverage.createMany({ data: coverageRows });

  const findingRows = snapshot.findings.map((finding) => ({
    id: crypto.randomUUID(),
    runId,
    entityId: finding.entityKey ? entityIdByKey.get(finding.entityKey) || null : null,
    relationshipId: finding.relationshipKey ? relationshipIdByKey.get(finding.relationshipKey) || null : null,
    axis: finding.axis,
    status: finding.status,
    severity: finding.severity,
    title: finding.title,
    explanation: finding.explanation,
    confidence: finding.confidence ?? null,
    reviewStatus: finding.reviewStatus || 'pending',
  }));
  if (findingRows.length > 0) await tx.egosFinding.createMany({ data: findingRows });

  const resolutionRows = snapshot.resolutions.map((resolution) => ({
    id: crypto.randomUUID(),
    runId,
    sourceEntityId: entityIdByKey.get(resolution.sourceEntityKey),
    candidateEntityId: entityIdByKey.get(resolution.candidateEntityKey),
    score: resolution.score,
    status: resolution.status,
    signals: resolution.signals || [],
    reviewStatus: resolution.reviewStatus || 'pending',
  }));
  if (resolutionRows.length > 0) await tx.egosResolution.createMany({ data: resolutionRows });

  return {
    runId,
    version: 'egos-1.0',
    generatedAt: completedAt.toISOString(),
    metrics: snapshot.metrics,
    insights: snapshot.insights,
    entities: snapshot.entities.map((entity) => ({ ...entity, id: entityIdByKey.get(entity.key) })),
    relationships: snapshot.relationships.map((relationship) => ({
      ...relationship,
      id: relationshipIdByKey.get(relationship.key),
      sourceEntityId: entityIdByKey.get(relationship.sourceKey),
      targetEntityId: entityIdByKey.get(relationship.targetKey),
      sourceName: snapshot.entities.find((entity) => entity.key === relationship.sourceKey)?.name,
      targetName: snapshot.entities.find((entity) => entity.key === relationship.targetKey)?.name,
    })),
    evidences: evidenceRows,
    coverage: coverageRows,
    findings: findingRows,
    resolutions: resolutionRows,
  };
}

module.exports = { persistSnapshot };
