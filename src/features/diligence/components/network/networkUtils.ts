// ==========================================================
// DILIGÊNCIA 360 — Utilitários e Algoritmos da Rede Imersiva
// ==========================================================

import type {
  EgosEntity,
  EgosEvidenceItem,
  EgosFinding,
  EgosRelationship,
  EgosSnapshot,
} from '../../types';
import type { FilterState, NetworkSelection, RouteItem, RouteSummary } from './types';

export const TYPE_LABELS: Record<string, string> = {
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
};

export const RELATION_TYPE_LABELS: Record<string, string> = {
  EVIDENCED_BY: 'Evidências documentais',
  MENTIONED_IN: 'Menções em publicações',
  MENTIONED_IN_OFFICIAL_GAZETTE: 'Menções em diário oficial',
  POSSIBLE_PERSON_OCCURRENCE: 'Possíveis ocorrências nominais',
  ADMINISTERS_FUND: 'Administração do fundo',
  MANAGES_FUND: 'Gestão do fundo',
  AUDITS_FUND: 'Auditoria do fundo',
  CUSTODIAN_OF: 'Custódia do fundo',
  CONTROLS_FUND: 'Controladoria do fundo',
  RESPONSIBLE_DIRECTOR_OF: 'Diretor responsável',
  DIRECTOR_OF: 'Diretores e administradores',
  SHAREHOLDER_OF: 'Sócios e acionistas',
  LEGAL_REPRESENTATIVE_OF: 'Representantes legais',
  QSA_MEMBER_OF: 'Vínculos por nome e CPF mascarado',
  CO_MENTIONED_WITH: 'Co-menções em fontes públicas',
  CONTRACTED_BY: 'Contratos públicos confirmados',
  RECEIVED_PUBLIC_RESOURCES_FROM: 'Pagamentos públicos confirmados',
  NAMED_AS_INTERESTED_IN_EXTERNAL_CONTROL: 'Processos de controle externo',
};

export const CHAIN_ENTITY_ORDER: Record<string, number> = {
  Company: 0,
  InvestmentFund: 1,
  InvestmentFundClass: 2,
  Person: 3,
  Organization: 4,
  PublicOffice: 5,
  Address: 6,
  CourtCase: 7,
  Sanction: 8,
  Document: 9,
};

export const CONFIRMED_STATUSES = new Set(['CONFIRMED', 'VALIDATED', 'VERIFIED']);

export const KINSHIP_RELATIONSHIPS = new Set([
  'KINSHIP',
  'FAMILY_RELATIONSHIP',
  'RELATED_TO',
  'PARENT_OF',
  'CHILD_OF',
  'SPOUSE_OF',
  'SIBLING_OF',
  'DEPENDENT_OF',
]);

const CORE_RELATIONAL_ENTITY_TYPES = new Set([
  'Company',
  'Person',
  'InvestmentFund',
  'InvestmentFundClass',
  'Organization',
  'CourtCase',
]);

const CORE_RELATIONSHIP_TYPES = new Set([
  'ADMINISTERS_FUND',
  'MANAGES_FUND',
  'AUDITS_FUND',
  'CUSTODIAN_OF',
  'CONTROLS_FUND',
  'RESPONSIBLE_DIRECTOR_OF',
  'DIRECTOR_OF',
  'SHAREHOLDER_OF',
  'LEGAL_REPRESENTATIVE_OF',
  'QSA_MEMBER_OF',
  'CONTRACTED_BY',
  'RECEIVED_PUBLIC_RESOURCES_FROM',
  'NAMED_AS_INTERESTED_IN_EXTERNAL_CONTROL',
]);

export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function confidencePercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(Math.min(100, value <= 1 ? value * 100 : value));
}

export function isConfirmed(status: string) {
  return CONFIRMED_STATUSES.has(status.toUpperCase());
}

export function relationshipWeight(status: string) {
  if (isConfirmed(status)) return 1;
  return status.toUpperCase().includes('PROBABLE') ? 3 : 5;
}

export function formatGeneratedAt(value?: string) {
  if (!value) return 'Data de coleta não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data de coleta não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function humanizeProperty(key: string) {
  const known: Record<string, string> = {
    cnpj: 'CNPJ',
    cpf: 'CPF',
    role: 'Papel',
    position: 'Cargo',
    source: 'Fonte',
    status: 'Situação',
    date: 'Data',
    searchedname: 'Nome pesquisado',
    maskedcpf: 'CPF mascarado',
    publicrole: 'Função pública',
    roleabbreviation: 'Sigla da função',
    rolelevel: 'Nível da função',
    publicorganization: 'Órgão público',
    publicservicestart: 'Início do exercício',
    publicserviceend: 'Fim do exercício',
    pepcoolingoffend: 'Fim da carência PEP',
    employmenttype: 'Tipo de vínculo',
    referenceperiod: 'Competência',
    sourcesheet: 'Base interna',
    identityconfirmed: 'Identidade confirmada',
    cvmfundcode: 'Código CVM',
    fundtype: 'Tipo de fundo',
    administrationtype: 'Tipo de administração',
    anbimaid: 'Código Anbima',
  };
  const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return known[normalized] || key.replace(/([A-Z])/g, ' $1').trim();
}

export function touches(relationship: EgosRelationship, entityId: string) {
  return relationship.sourceEntityId === entityId || relationship.targetEntityId === entityId;
}

export function otherEntityId(relationship: EgosRelationship, entityId: string) {
  return relationship.sourceEntityId === entityId
    ? relationship.targetEntityId
    : relationship.sourceEntityId;
}

export function entityEvidence(egos: EgosSnapshot, entityId: string): EgosEvidenceItem[] {
  const direct = egos.evidences.filter((evidence) => evidence.entityId === entityId);
  const incidentIds = new Set(
    egos.relationships
      .filter((relationship) => touches(relationship, entityId))
      .map((relationship) => relationship.id)
  );
  const incident = egos.evidences.filter(
    (evidence) => evidence.relationshipId && incidentIds.has(evidence.relationshipId)
  );
  return [...direct, ...incident].filter(
    (item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index
  );
}

export function relationshipEvidence(egos: EgosSnapshot, relationshipId: string): EgosEvidenceItem[] {
  return egos.evidences.filter((evidence) => evidence.relationshipId === relationshipId);
}

export function findingsForSelection(egos: EgosSnapshot, selection: NetworkSelection): EgosFinding[] {
  if (selection.kind === 'node') {
    return egos.findings.filter((finding) => finding.entityId === selection.id);
  }
  const relationship = egos.relationships.find((item) => item.id === selection.id);
  if (!relationship) return [];
  return egos.findings.filter((finding) => (
    finding.relationshipId === relationship.id
    || finding.entityId === relationship.sourceEntityId
    || finding.entityId === relationship.targetEntityId
  ));
}

export function isPepCandidate(entity?: EgosEntity) {
  if (!entity) return false;
  return entity.type === 'PublicOffice'
    || Boolean(entity.properties?.publicRole || entity.properties?.publicOrganization || entity.properties?.pepCoolingOffEnd);
}

export function isInternalSuapeCandidate(entity?: EgosEntity) {
  if (!entity) return false;
  const sourceSheet = String(entity.properties?.sourceSheet || '').toLowerCase();
  const source = String(entity.properties?.source || '').toLowerCase();
  return sourceSheet.includes('suape') || source.includes('suape') || source.includes('folha');
}

export function visibleEntity(entity: EgosEntity, filters: FilterState) {
  if (!filters.showDocuments && !isCoreRelationalEntity(entity)) return false;
  if (filters.depth === '1' && entity.depth > 1) return false;
  if (filters.depth === '2' && entity.depth > 2) return false;
  return true;
}

export function isCoreRelationalEntity(entity: EgosEntity) {
  return CORE_RELATIONAL_ENTITY_TYPES.has(entity.type);
}

export interface FocusGraphProjection {
  entities: EgosEntity[];
  relationships: EgosRelationship[];
  totalNeighbors: number;
  visibleNeighbors: number;
}

export function projectFocusGraph(
  entities: EgosEntity[],
  relationships: EgosRelationship[],
  focusEntityId: string | undefined,
  neighborLimit: number
): FocusGraphProjection {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const focusEntity = focusEntityId ? entityById.get(focusEntityId) : undefined;
  if (!focusEntity) {
    return { entities: [], relationships: [], totalNeighbors: 0, visibleNeighbors: 0 };
  }

  const candidates = relationships
    .filter((relationship) => touches(relationship, focusEntity.id))
    .filter((relationship) => relationshipMatchesFilter(relationship, 'core'))
    .map((relationship) => {
      const neighborId = otherEntityId(relationship, focusEntity.id);
      return { relationship, neighbor: entityById.get(neighborId) };
    })
    .filter((item): item is { relationship: EgosRelationship; neighbor: EgosEntity } => (
      Boolean(item.neighbor && isCoreRelationalEntity(item.neighbor))
    ))
    .sort((left, right) => {
      const statusDifference = Number(isConfirmed(right.relationship.status))
        - Number(isConfirmed(left.relationship.status));
      if (statusDifference !== 0) return statusDifference;
      const confidenceDifference = (right.relationship.confidence || 0)
        - (left.relationship.confidence || 0);
      if (confidenceDifference !== 0) return confidenceDifference;
      return left.neighbor.name.localeCompare(right.neighbor.name, 'pt-BR');
    });

  const uniqueConnections: Array<{ relationship: EgosRelationship; neighbor: EgosEntity }> = [];
  const seenNeighbors = new Set<string>();
  candidates.forEach((candidate) => {
    if (seenNeighbors.has(candidate.neighbor.id)) return;
    seenNeighbors.add(candidate.neighbor.id);
    uniqueConnections.push(candidate);
  });

  const visibleConnections = uniqueConnections.slice(0, Math.max(1, neighborLimit));
  const visibleNeighborIds = new Set(visibleConnections.map((item) => item.neighbor.id));
  const visibleRelationships = relationships
    .filter((relationship) => touches(relationship, focusEntity.id))
    .filter((relationship) => relationshipMatchesFilter(relationship, 'core'))
    .filter((relationship) => visibleNeighborIds.has(otherEntityId(relationship, focusEntity.id)));

  return {
    entities: [focusEntity, ...visibleConnections.map((item) => item.neighbor)],
    relationships: visibleRelationships,
    totalNeighbors: uniqueConnections.length,
    visibleNeighbors: visibleConnections.length,
  };
}

export function relationshipMatchesFilter(relationship: EgosRelationship, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'confirmed') return isConfirmed(relationship.status);
  if (filter === 'core') return CORE_RELATIONSHIP_TYPES.has(relationship.type);
  return relationship.type === filter;
}

export function filterGraphEntities(
  entities: EgosEntity[],
  relationships: EgosRelationship[],
  filters: FilterState,
  rootEntityId?: string
) {
  const candidates = entities.filter((entity) => visibleEntity(entity, filters));
  if (filters.relation === 'all') return candidates;

  const candidateIds = new Set(candidates.map((entity) => entity.id));
  const connectedIds = new Set<string>();
  if (rootEntityId) connectedIds.add(rootEntityId);
  relationships
    .filter((relationship) => relationshipMatchesFilter(relationship, filters.relation))
    .filter((relationship) => (
      candidateIds.has(relationship.sourceEntityId)
      && candidateIds.has(relationship.targetEntityId)
    ))
    .forEach((relationship) => {
      connectedIds.add(relationship.sourceEntityId);
      connectedIds.add(relationship.targetEntityId);
    });

  return candidates.filter((entity) => (
    connectedIds.has(entity.id)
    || entity.id === rootEntityId
    || entity.role.toUpperCase() === 'ROOT'
  ));
}

export function findOptimalRoute(
  root: EgosEntity,
  target: EgosEntity,
  entities: EgosEntity[],
  relationships: EgosRelationship[],
  evidences: EgosEvidenceItem[]
): RouteSummary | null {
  if (root.id === target.id) {
    return {
      targetId: target.id,
      targetName: target.name,
      hops: 0,
      confidence: confidencePercent(target.confidence),
      confirmed: true,
      evidenceCount: 0,
      nodeIds: [root.id],
      edgeIds: [],
      items: [{ id: root.id, kind: 'node', label: root.name }],
    };
  }

  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const routeCanUse = (entityId: string) => {
    const entity = entityById.get(entityId);
    return entity?.type !== 'Document' || entityId === target.id;
  };
  const adjacency = new Map<string, Array<{ relationship: EgosRelationship; nextId: string }>>();
  entities.forEach((entity) => adjacency.set(entity.id, []));
  relationships.forEach((relationship) => {
    if (!routeCanUse(relationship.sourceEntityId) || !routeCanUse(relationship.targetEntityId)) return;
    adjacency.get(relationship.sourceEntityId)?.push({ relationship, nextId: relationship.targetEntityId });
    adjacency.get(relationship.targetEntityId)?.push({ relationship, nextId: relationship.sourceEntityId });
  });

  const distances = new Map<string, number>();
  const previous = new Map<string, { nodeId: string; relationship: EgosRelationship }>();
  const unvisited = new Set<string>();

  entities.forEach((entity) => {
    distances.set(entity.id, entity.id === root.id ? 0 : Number.POSITIVE_INFINITY);
    unvisited.add(entity.id);
  });

  while (unvisited.size > 0) {
    let currentId: string | null = null;
    let shortest = Number.POSITIVE_INFINITY;
    unvisited.forEach((id) => {
      const distance = distances.get(id) ?? Number.POSITIVE_INFINITY;
      if (distance < shortest) {
        shortest = distance;
        currentId = id;
      }
    });

    if (!currentId || shortest === Number.POSITIVE_INFINITY) break;
    if (currentId === target.id) break;

    unvisited.delete(currentId);
    const neighbors = adjacency.get(currentId) || [];
    for (const neighbor of neighbors) {
      if (!unvisited.has(neighbor.nextId)) continue;
      const weight = relationshipWeight(neighbor.relationship.status);
      const tentative = shortest + weight;
      if (tentative < (distances.get(neighbor.nextId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.nextId, tentative);
        previous.set(neighbor.nextId, { nodeId: currentId, relationship: neighbor.relationship });
      }
    }
  }

  if (!previous.has(target.id)) return null;

  const nodeIds: string[] = [target.id];
  const edgeIds: string[] = [];
  const items: RouteItem[] = [{ id: target.id, kind: 'node', label: target.name }];
  let crawlId = target.id;
  let allConfirmed = true;

  while (crawlId !== root.id) {
    const step = previous.get(crawlId);
    if (!step) return null;
    edgeIds.unshift(step.relationship.id);
    nodeIds.unshift(step.nodeId);
    if (!isConfirmed(step.relationship.status)) allConfirmed = false;
    const nodeEntity = entities.find((entity) => entity.id === step.nodeId);
    items.unshift(
      { id: step.relationship.id, kind: 'edge', label: step.relationship.label },
      { id: step.nodeId, kind: 'node', label: nodeEntity?.name || 'Entidade' }
    );
    crawlId = step.nodeId;
  }

  const evidenceCount = edgeIds.reduce((total, id) => {
    return total + evidences.filter((evidence) => evidence.relationshipId === id).length;
  }, 0);

  return {
    targetId: target.id,
    targetName: target.name,
    hops: edgeIds.length,
    confidence: confidencePercent(target.confidence),
    confirmed: allConfirmed,
    evidenceCount,
    nodeIds,
    edgeIds,
    items,
  };
}
