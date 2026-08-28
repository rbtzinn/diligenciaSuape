// ==========================================================
// DILIGÊNCIA 360 — Projeção documental da rede
// Reconstrói nós de fontes para snapshots antigos/incompletos
// ==========================================================

import type {
  AdverseMediaResult,
  AdverseMediaSummary,
  EgosEntity,
  EgosEvidenceItem,
  EgosRelationship,
} from '../../types';

export interface NetworkDocumentProjection {
  entities: EgosEntity[];
  relationships: EgosRelationship[];
  evidences: EgosEvidenceItem[];
  documentCount: number;
}

const TRACKING_QUERY_PARAMETERS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

function normalizeIdentity(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeIdentifier(value: unknown) {
  return String(value || '').replace(/[^a-zA-Z0-9*]/g, '').toUpperCase();
}

function entityIdentifiers(entity: EgosEntity) {
  const identifiers = (entity.identifiers || []).map((identifier) => normalizeIdentifier(identifier.value));
  [entity.properties?.maskedCpf, entity.properties?.cpf, entity.properties?.document]
    .map(normalizeIdentifier)
    .filter(Boolean)
    .forEach((identifier) => identifiers.push(identifier));
  return new Set(identifiers.filter(Boolean));
}

export function canonicalDocumentUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';
    [...url.searchParams.keys()].forEach((key) => {
      if (key.toLowerCase().startsWith('utm_') || TRACKING_QUERY_PARAMETERS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    });
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return '';
  }
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function uniqueStableId(prefix: string, seed: string, occupiedIds: Set<string>) {
  const base = `${prefix}${stableHash(seed)}`;
  let candidate = base;
  let suffix = 2;
  while (occupiedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  occupiedIds.add(candidate);
  return candidate;
}

function documentTitleKey(name: unknown, source: unknown) {
  const normalizedName = normalizeIdentity(name);
  if (!normalizedName) return '';
  return `${normalizeIdentity(source)}|${normalizedName}`;
}

function connectionKey(leftId: string, rightId: string) {
  return leftId < rightId ? `${leftId}|${rightId}` : `${rightId}|${leftId}`;
}

function mediaConfidence(item: AdverseMediaResult) {
  if (item.matchStrength === 'high') return 85;
  if (item.matchStrength === 'medium') return 65;
  return 40;
}

function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function projectNetworkDocuments(
  baseEntities: readonly EgosEntity[],
  baseRelationships: readonly EgosRelationship[],
  baseEvidences: readonly EgosEvidenceItem[],
  adverseMedia?: AdverseMediaSummary,
  targetCompanyName = ''
): NetworkDocumentProjection {
  const allMediaResults = Array.isArray(adverseMedia?.results) ? adverseMedia.results : [];
  const mediaIdentity = (item: AdverseMediaResult) => {
    const url = canonicalDocumentUrl(item.url);
    if (url) return `url:${url}`;
    const title = documentTitleKey(item.title, item.domain);
    return title ? `title:${title}` : `id:${item.id}`;
  };
  const activeMediaIdentities = new Set(
    allMediaResults.filter((item) => item.status !== 'discarded').map(mediaIdentity)
  );
  const discardedMediaIdentities = new Set(
    allMediaResults
      .filter((item) => item.status === 'discarded')
      .map(mediaIdentity)
      .filter((identity) => !activeMediaIdentities.has(identity))
  );
  const excludedDocumentIds = new Set(
    baseEntities
      .filter((entity) => entity.type === 'Document')
      .filter((entity) => {
        const url = canonicalDocumentUrl(entity.properties?.url);
        const title = documentTitleKey(
          entity.name,
          entity.properties?.domain || entity.properties?.sourceName
        );
        const adverseMediaId = String(entity.properties?.adverseMediaId || '');
        const identity = url
          ? `url:${url}`
          : title
            ? `title:${title}`
            : adverseMediaId
              ? `id:${adverseMediaId}`
              : '';
        return Boolean(identity && discardedMediaIdentities.has(identity));
      })
      .map((entity) => entity.id)
  );
  const excludedRelationshipIds = new Set(
    baseRelationships
      .filter((relationship) => (
        excludedDocumentIds.has(relationship.sourceEntityId)
        || excludedDocumentIds.has(relationship.targetEntityId)
      ))
      .map((relationship) => relationship.id)
  );
  const retainedBaseEvidences = baseEvidences.filter((evidence) => (
    !(evidence.entityId && excludedDocumentIds.has(evidence.entityId))
    && !(evidence.relationshipId && excludedRelationshipIds.has(evidence.relationshipId))
  ));
  const entities = baseEntities.filter((entity) => !excludedDocumentIds.has(entity.id));
  const relationships = baseRelationships.filter((relationship) => !excludedRelationshipIds.has(relationship.id));
  const evidences = [...retainedBaseEvidences];
  const entityIds = new Set(entities.map((entity) => entity.id));
  const relationshipIds = new Set(relationships.map((relationship) => relationship.id));
  const evidenceIds = new Set(evidences.map((evidence) => evidence.id));
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const relationshipById = new Map(relationships.map((relationship) => [relationship.id, relationship]));
  const peopleByName = new Map<string, EgosEntity[]>();
  const documentsByUrl = new Map<string, EgosEntity>();
  const documentsByTitle = new Map<string, EgosEntity>();

  entities.forEach((entity) => {
    if (entity.type === 'Person') {
      const name = normalizeIdentity(entity.name);
      if (name) peopleByName.set(name, [...(peopleByName.get(name) || []), entity]);
    }
    if (entity.type !== 'Document') return;
    const url = canonicalDocumentUrl(entity.properties?.url);
    if (url && !documentsByUrl.has(url)) documentsByUrl.set(url, entity);
    const titleKey = documentTitleKey(
      entity.name,
      entity.properties?.domain || entity.properties?.sourceName
    );
    if (titleKey && !documentsByTitle.has(titleKey)) documentsByTitle.set(titleKey, entity);
  });

  const normalizedTarget = normalizeIdentity(targetCompanyName);
  const rootEntity = entities.find((entity) => String(entity.role).toUpperCase() === 'ROOT')
    || entities.find((entity) => normalizeIdentity(entity.name) === normalizedTarget)
    || entities.find((entity) => entity.depth === 0)
    || entities[0];

  if (!rootEntity) {
    return {
      entities,
      relationships,
      evidences,
      documentCount: entities.filter((entity) => entity.type === 'Document').length,
    };
  }

  const relationshipByConnection = new Map<string, EgosRelationship>();
  relationships.forEach((relationship) => {
    const key = connectionKey(relationship.sourceEntityId, relationship.targetEntityId);
    if (!relationshipByConnection.has(key)) relationshipByConnection.set(key, relationship);
  });

  const evidenceTargetsByUrl = new Set<string>();
  const indexEvidence = (evidence: EgosEvidenceItem) => {
    const url = canonicalDocumentUrl(evidence.sourceUrl);
    if (!url) return;
    if (evidence.entityId) evidenceTargetsByUrl.add(`${url}|entity:${evidence.entityId}`);
    if (evidence.relationshipId) evidenceTargetsByUrl.add(`${url}|relationship:${evidence.relationshipId}`);
  };
  evidences.forEach(indexEvidence);

  const registerDocument = (document: EgosEntity) => {
    entities.push(document);
    entityById.set(document.id, document);
    const url = canonicalDocumentUrl(document.properties?.url);
    if (url) documentsByUrl.set(url, document);
    const titleKey = documentTitleKey(
      document.name,
      document.properties?.domain || document.properties?.sourceName
    );
    if (titleKey) documentsByTitle.set(titleKey, document);
  };

  const ensureConnection = (
    sourceEntity: EgosEntity,
    document: EgosEntity,
    definition: Pick<EgosRelationship, 'type' | 'label' | 'status' | 'confidence' | 'properties'>,
    seed: string
  ) => {
    const key = connectionKey(sourceEntity.id, document.id);
    const existing = relationshipByConnection.get(key);
    if (existing) return existing;
    const id = uniqueStableId('network-document-relation:', seed, relationshipIds);
    const relationship: EgosRelationship = {
      id,
      key: `network:document:relation:${stableHash(seed)}`,
      sourceEntityId: sourceEntity.id,
      targetEntityId: document.id,
      sourceName: sourceEntity.name,
      targetName: document.name,
      ...definition,
    };
    relationships.push(relationship);
    relationshipById.set(id, relationship);
    relationshipByConnection.set(key, relationship);
    return relationship;
  };

  const ensureDocumentEvidence = (
    source: Pick<EgosEvidenceItem, 'provider' | 'sourceName' | 'sourceUrl' | 'query' | 'identifier' | 'excerpt' | 'confidence' | 'retrievedAt'>,
    document: EgosEntity,
    relationship: EgosRelationship,
    seed: string
  ) => {
    const url = canonicalDocumentUrl(source.sourceUrl);
    if (!url) return;
    const relationshipTarget = `${url}|relationship:${relationship.id}`;
    if (evidenceTargetsByUrl.has(relationshipTarget)) return;
    const evidence: EgosEvidenceItem = {
      id: uniqueStableId('network-document-evidence:', seed, evidenceIds),
      entityId: document.id,
      relationshipId: relationship.id,
      provider: source.provider,
      sourceName: source.sourceName,
      sourceUrl: url,
      query: source.query,
      identifier: source.identifier,
      excerpt: source.excerpt,
      confidence: source.confidence,
      retrievedAt: source.retrievedAt,
    };
    evidences.push(evidence);
    indexEvidence(evidence);
  };

  const mediaResults = allMediaResults.filter((item) => item.status !== 'discarded');

  mediaResults.forEach((item) => {
    const url = canonicalDocumentUrl(item.url);
    const titleKey = documentTitleKey(item.title, item.domain);
    let document = (url ? documentsByUrl.get(url) : undefined)
      || (titleKey ? documentsByTitle.get(titleKey) : undefined);
    if (!document && !url) return;

    const seed = url || `${item.id}|${item.domain}|${item.title}`;
    const confidence = mediaConfidence(item);
    if (!document) {
      document = {
        id: uniqueStableId('network-document:', seed, entityIds),
        key: `network:document:web:${stableHash(seed)}`,
        type: 'Document',
        name: item.title || item.domain || 'Publicação na web',
        normalizedName: normalizeIdentity(item.title),
        properties: {
          url,
          domain: item.domain || domainFromUrl(url),
          sourceName: item.domain || domainFromUrl(url),
          publishedAt: item.publishedAt || null,
          snippet: item.snippet || null,
          categories: item.categories || [],
          matchedTerms: item.matchedTerms || [],
          riskRelevant: item.riskRelevant !== false,
          providerSources: item.providerSources || [],
          relatedSubjects: item.relatedSubjects || [],
          matchStrength: item.matchStrength,
          subjectType: item.subjectType || 'company',
          subjectName: item.subjectName || targetCompanyName,
          adverseMediaId: item.id,
          projectedFromAdverseMedia: true,
        },
        depth: 1,
        role: item.subjectType === 'person' ? 'person_occurrence_candidate' : 'media_mention',
        confidence,
      };
      registerDocument(document);
    }

    const relatedSubjects = item.relatedSubjects?.length
      ? item.relatedSubjects
      : [{
          subjectType: item.subjectType || 'company',
          subjectName: item.subjectName || targetCompanyName,
          subjectQualification: item.subjectQualification,
          subjectDocument: item.subjectDocument,
          matchStrength: item.matchStrength,
        }];

    relatedSubjects.forEach((subject, subjectIndex) => {
      const isPersonResult = subject.subjectType === 'person';
      const personCandidates = isPersonResult
        ? peopleByName.get(normalizeIdentity(subject.subjectName)) || []
        : [];
      const subjectIdentifier = normalizeIdentifier(subject.subjectDocument);
      const identifierMatches = subjectIdentifier
        ? personCandidates.filter((candidate) => entityIdentifiers(candidate).has(subjectIdentifier))
        : [];
      const personSubject = personCandidates.length === 1
        ? personCandidates[0]
        : identifierMatches.length === 1
          ? identifierMatches[0]
          : undefined;
      const sourceEntity = personSubject || rootEntity;
      const associationConfidence = subject.matchStrength === 'high'
        ? 85
        : subject.matchStrength === 'medium' ? 65 : confidence;
      const associationSeed = item.id + '|' + document.id + '|' + sourceEntity.id + '|' + subjectIndex;
      const relationship = ensureConnection(sourceEntity, document, {
        type: isPersonResult ? 'POSSIBLE_PERSON_OCCURRENCE' : 'MENTIONED_IN',
        label: isPersonResult
          ? 'Possível menção pública associada ao nome'
          : 'Mencionada em publicação',
        status: 'CANDIDATE',
        confidence: associationConfidence,
        properties: {
          queriesMatched: item.queriesMatched || [],
          provider: 'MEDIA_SEARCH',
          providerSources: item.providerSources || [],
          subjectType: subject.subjectType,
          subjectName: subject.subjectName,
          unresolvedSubject: isPersonResult && !personSubject,
          requiresHumanReview: true,
          projectedFromAdverseMedia: true,
        },
      }, associationSeed);

      ensureDocumentEvidence({
        provider: (item.providerSources || []).join(' + ') || 'MEDIA_SEARCH',
        sourceName: item.domain || domainFromUrl(url) || 'Publicação na web',
        sourceUrl: url,
        query: (item.queriesMatched || []).join(' | ') || subject.subjectName || targetCompanyName,
        identifier: item.url || item.id,
        excerpt: item.snippet || null,
        confidence: associationConfidence,
        retrievedAt: item.searchedAt || adverseMedia?.consultadoEm || '',
      }, document, relationship, associationSeed);
    });
  });

  retainedBaseEvidences.forEach((evidence) => {
    const url = canonicalDocumentUrl(evidence.sourceUrl);
    if (!url) return;

    let document = documentsByUrl.get(url);
    if (!document) {
      const sourceName = evidence.sourceName || evidence.provider || domainFromUrl(url) || 'Fonte documental';
      const seed = `${url}|evidence`;
      document = {
        id: uniqueStableId('network-document:', seed, entityIds),
        key: `network:document:evidence:${stableHash(seed)}`,
        type: 'Document',
        name: sourceName,
        normalizedName: normalizeIdentity(sourceName),
        properties: {
          url,
          domain: domainFromUrl(url),
          sourceName,
          provider: evidence.provider,
          excerpt: evidence.excerpt || null,
          retrievedAt: evidence.retrievedAt,
          projectedFromEvidence: true,
        },
        depth: 1,
        role: 'evidence_source',
        confidence: evidence.confidence ?? 100,
      };
      registerDocument(document);
    }

    const anchors = new Map<string, EgosEntity>();
    const directEntity = evidence.entityId ? entityById.get(evidence.entityId) : undefined;
    if (directEntity && directEntity.type !== 'Document') anchors.set(directEntity.id, directEntity);

    const supportedRelationship = evidence.relationshipId
      ? relationshipById.get(evidence.relationshipId)
      : undefined;
    if (supportedRelationship) {
      [supportedRelationship.sourceEntityId, supportedRelationship.targetEntityId].forEach((entityId) => {
        const entity = entityById.get(entityId);
        if (entity && entity.type !== 'Document') anchors.set(entity.id, entity);
      });
    }
    if (anchors.size === 0) anchors.set(rootEntity.id, rootEntity);

    const relationshipStatus = supportedRelationship?.status || 'CONFIRMED';
    const relationshipConfidence = supportedRelationship?.confidence ?? evidence.confidence ?? 100;

    anchors.forEach((anchor) => {
      const relationship = ensureConnection(anchor, document, {
        type: 'EVIDENCED_BY',
        label: 'Evidenciada por documento',
        status: relationshipStatus,
        confidence: relationshipConfidence,
        properties: {
          provider: evidence.provider,
          supportedRelationshipId: evidence.relationshipId || null,
          supportedRelationshipStatus: supportedRelationship?.status || null,
          projectedFromEvidence: true,
        },
      }, `${anchor.id}|${document.id}|evidence`);

      ensureDocumentEvidence(evidence, document, relationship, `${evidence.id}|${anchor.id}|evidence`);
    });
  });

  return {
    entities,
    relationships,
    evidences,
    documentCount: entities.filter((entity) => entity.type === 'Document').length,
  };
}
