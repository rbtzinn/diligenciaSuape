const { cleanText } = require('./report-theme');

const ENTITY_TYPE_LABELS = Object.freeze({
  Company: 'Empresa',
  Person: 'Pessoa',
  Address: 'Endereço',
  Sanction: 'Sanção',
  PublicOffice: 'Cargo público / PEP',
  CourtCase: 'Processo judicial',
  Document: 'Documento / publicação',
  Organization: 'Instituição',
  InvestmentFund: 'Fundo de investimento',
  InvestmentFundClass: 'Classe de fundo',
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function safeExternalUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function primitiveProperties(properties) {
  return Object.entries(properties || {})
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 10)
    .map(([key, value]) => ({ key, value: String(value) }));
}

function sourceDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function getEntityReportContext(diligence, entityId) {
  const egos = diligence?.egos || {};
  const entities = asArray(egos.entities);
  const relationships = asArray(egos.relationships);
  const evidences = asArray(egos.evidences);
  const findings = asArray(egos.findings);
  const selectedEntity = entities.find((entity) => entity.id === entityId);

  if (!selectedEntity) {
    throw new Error('A entidade selecionada não foi encontrada no snapshot desta diligência.');
  }

  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const directRelationships = relationships
    .filter((relationship) => (
      relationship.sourceEntityId === entityId || relationship.targetEntityId === entityId
    ))
    .map((relationship) => {
      const counterpartId = relationship.sourceEntityId === entityId
        ? relationship.targetEntityId
        : relationship.sourceEntityId;
      const relationshipEvidence = evidences.filter((evidence) => evidence.relationshipId === relationship.id);
      return {
        ...relationship,
        direction: relationship.sourceEntityId === entityId ? 'outgoing' : 'incoming',
        counterpart: entityById.get(counterpartId) || null,
        evidenceCount: relationshipEvidence.length,
      };
    })
    .sort((left, right) => {
      const statusDifference = String(left.status).toUpperCase() === 'CONFIRMED' ? -1 : 1;
      if (String(left.status).toUpperCase() !== String(right.status).toUpperCase()) return statusDifference;
      return String(left.counterpart?.name || '').localeCompare(String(right.counterpart?.name || ''), 'pt-BR');
    });

  const relationshipIds = new Set(directRelationships.map((relationship) => relationship.id));
  const selectedEvidences = evidences.filter((evidence) => (
    evidence.entityId === entityId
    || Boolean(evidence.relationshipId && relationshipIds.has(evidence.relationshipId))
  ));
  const selectedFindings = findings.filter((finding) => (
    finding.entityId === entityId
    || Boolean(finding.relationshipId && relationshipIds.has(finding.relationshipId))
  ));

  const normalizedEntityName = normalizeName(selectedEntity.name);
  const isRootEntity = selectedEntity.role === 'root' || Number(selectedEntity.depth || 0) === 0;
  const mediaResults = asArray(diligence?.adverseMedia?.results).filter((item) => {
    if (selectedEntity.type === 'Person') {
      return item.subjectType === 'person' && normalizeName(item.subjectName) === normalizedEntityName;
    }
    if (isRootEntity && item.subjectType !== 'person') return true;
    return normalizeName(item.subjectName) === normalizedEntityName;
  });

  const sourceMap = new Map();
  const addSource = (candidate) => {
    const url = safeExternalUrl(candidate.url);
    const key = url || `${candidate.kind}:${candidate.id}`;
    const existing = sourceMap.get(key);
    if (existing) {
      existing.kinds = [...new Set([...existing.kinds, candidate.kind])];
      if (!existing.excerpt && candidate.excerpt) existing.excerpt = candidate.excerpt;
      if (!existing.query && candidate.query) existing.query = candidate.query;
      if (!existing.retrievedAt && candidate.retrievedAt) existing.retrievedAt = candidate.retrievedAt;
      if (!existing.confidence && candidate.confidence) existing.confidence = candidate.confidence;
      return;
    }
    sourceMap.set(key, {
      ...candidate,
      url,
      domain: candidate.domain || sourceDomain(url),
      kinds: [candidate.kind],
    });
  };

  mediaResults.forEach((item) => addSource({
    id: item.id,
    kind: 'news',
    title: cleanText(item.title, 'Conteúdo público relacionado'),
    sourceName: cleanText(item.domain, 'Fonte pública'),
    domain: item.domain,
    url: item.url,
    excerpt: item.snippet,
    query: asArray(item.queriesMatched).join(' | '),
    retrievedAt: item.searchedAt || diligence.adverseMedia?.consultadoEm,
    status: item.status || 'candidate',
    confidence: item.matchStrength,
  }));

  selectedEvidences.forEach((evidence) => addSource({
    id: evidence.id,
    kind: 'evidence',
    title: cleanText(evidence.sourceName || evidence.provider, 'Evidência rastreável'),
    sourceName: cleanText(evidence.sourceName || evidence.provider, 'Fonte pública'),
    url: evidence.sourceUrl,
    excerpt: evidence.excerpt,
    query: evidence.query || evidence.identifier,
    retrievedAt: evidence.retrievedAt,
    status: 'evidence',
    confidence: evidence.confidence,
  }));

  directRelationships.forEach((relationship) => {
    const document = relationship.counterpart;
    if (document?.type !== 'Document') return;
    addSource({
      id: document.id,
      kind: 'document',
      title: cleanText(document.name, 'Documento relacionado'),
      sourceName: cleanText(document.properties?.domain || document.properties?.sourceName, 'Documento público'),
      url: document.properties?.url,
      excerpt: document.properties?.snippet || document.properties?.excerpt,
      retrievedAt: document.properties?.publishedAt || document.properties?.date,
      status: relationship.status,
      confidence: relationship.confidence,
    });
  });

  const sources = [...sourceMap.values()].sort((left, right) => {
    const leftPriority = left.kinds.includes('news') ? 0 : left.url ? 1 : 2;
    const rightPriority = right.kinds.includes('news') ? 0 : right.url ? 1 : 2;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return String(left.title).localeCompare(String(right.title), 'pt-BR');
  });

  return {
    entity: {
      ...selectedEntity,
      typeLabel: ENTITY_TYPE_LABELS[selectedEntity.type] || selectedEntity.type || 'Entidade',
      propertiesList: primitiveProperties(selectedEntity.properties),
    },
    relationships: directRelationships,
    findings: selectedFindings,
    evidences: selectedEvidences,
    mediaResults,
    sources,
    metrics: {
      relationships: directRelationships.length,
      relatedEntities: new Set(directRelationships.map((relationship) => relationship.counterpart?.id).filter(Boolean)).size,
      findings: selectedFindings.length,
      evidences: selectedEvidences.length,
      news: mediaResults.length,
      linkedSources: sources.filter((source) => Boolean(source.url)).length,
    },
  };
}

module.exports = {
  getEntityReportContext,
  normalizeName,
  safeExternalUrl,
};
