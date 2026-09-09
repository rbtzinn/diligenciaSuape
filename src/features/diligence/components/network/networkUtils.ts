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
  MENCIONADA_EM: 'Menções validadas pelo analista',
  INTERESSADA_EM: 'Interesse processual validado',
  CONTRATADA_POR: 'Contratos validados pelo analista',
  SANCIONADA_POR: 'Sanções validadas pelo analista',
  RESPONSABILIZADA_EM: 'Responsabilizações validadas',
  SOCIA_DE: 'Participações societárias validadas',
  ADMINISTRADA_POR: 'Administração validada',
  CITADA_COM: 'Citações conjuntas validadas',
  DOCUMENTO_RELACIONADO: 'Documentos relacionados validados',
};

/**
 * Rótulo curto da ligação, para escrever sobre o traço do mapa.
 *
 * `RELATION_TYPE_LABELS` é uma legenda de filtro: lê bem numa lista
 * ("Sócios e acionistas"), mas dentro do grafo vira uma etiqueta de
 * 26 caracteres que não cabe no vão entre dois cartões — o mapa
 * mostrava seis cópias de "Integra o quadro…" empilhadas em torno da
 * empresa investigada, todas cortadas no mesmo ponto.
 *
 * Aqui cada tipo tem a forma mais curta que ainda diz o que é. O
 * rótulo por extenso continua no inspetor, onde há largura para ele.
 */
export const SHORT_RELATION_LABELS: Record<string, string> = {
  DIRECTOR_OF: 'Administra',
  RESPONSIBLE_DIRECTOR_OF: 'Diretor',
  SHAREHOLDER_OF: 'Sócio',
  QSA_MEMBER_OF: 'Sócio (por nome)',
  LEGAL_REPRESENTATIVE_OF: 'Representa',
  ADMINISTERS_FUND: 'Administra fundo',
  MANAGES_FUND: 'Gere fundo',
  AUDITS_FUND: 'Audita fundo',
  CUSTODIAN_OF: 'Custodia',
  CONTROLS_FUND: 'Controla fundo',
  CONTRACTED_BY: 'Contratada',
  CONTRATADA_POR: 'Contratada',
  RECEIVED_PUBLIC_RESOURCES_FROM: 'Recebeu recursos',
  NAMED_AS_INTERESTED_IN_EXTERNAL_CONTROL: 'Interessada',
  INTERESSADA_EM: 'Interessada',
  SANCIONADA_POR: 'Sancionada',
  RESPONSABILIZADA_EM: 'Responsabilizada',
  SOCIA_DE: 'Sócia',
  ADMINISTRADA_POR: 'Administrada',
  CO_MENTIONED_WITH: 'Citada junto',
  CITADA_COM: 'Citada junto',
  MENCIONADA_EM: 'Mencionada',
  MENTIONED_IN: 'Mencionada',
  MENTIONED_IN_OFFICIAL_GAZETTE: 'Diário oficial',
  POSSIBLE_PERSON_OCCURRENCE: 'Possível ocorrência',
  EVIDENCED_BY: 'Evidência',
  DOCUMENTO_RELACIONADO: 'Documento',
};

/**
 * A mesma ligação lida do outro lado.
 *
 * `SHORT_RELATION_LABELS` descreve o papel de quem é a origem: em
 * "Ana —SHAREHOLDER_OF→ Construtora", "Sócio" é o papel da Ana. Ao
 * explorar a partir da Ana, porém, quem ganha o cartão é a
 * Construtora — e escrever "Sócio" nele inverteria quem participa de
 * quem. Num mapa de diligência isso não é imprecisão de estilo: é
 * dizer o contrário do que o registro público diz.
 *
 * Só os vínculos que a exploração por ramos mostra precisam de
 * inverso; para os demais, o rótulo direto continua valendo.
 */
const INVERSE_RELATION_LABELS: Record<string, string> = {
  DIRECTOR_OF: 'Administrada',
  RESPONSIBLE_DIRECTOR_OF: 'Sob direção',
  SHAREHOLDER_OF: 'Participação',
  QSA_MEMBER_OF: 'Participação (por nome)',
  LEGAL_REPRESENTATIVE_OF: 'Representada',
  ADMINISTERS_FUND: 'Fundo administrado',
  MANAGES_FUND: 'Fundo sob gestão',
  AUDITS_FUND: 'Fundo auditado',
  CUSTODIAN_OF: 'Sob custódia',
  CONTROLS_FUND: 'Fundo controlado',
  CONTRACTED_BY: 'Contratante',
  CONTRATADA_POR: 'Contratante',
  RECEIVED_PUBLIC_RESOURCES_FROM: 'Repassou recursos',
  NAMED_AS_INTERESTED_IN_EXTERNAL_CONTROL: 'Aponta como interessada',
  SOCIA_DE: 'Participação',
  ADMINISTRADA_POR: 'Administra',
};

/**
 * Uma etiqueta curta o bastante para caber sobre o traço da ligação.
 *
 * `inverted` diz que a ligação está sendo lida do lado do destino —
 * é o caso do cartão de um vizinho que é o alvo da relação.
 */
export function shortRelationLabel(relationship: EgosRelationship, inverted = false): string {
  const mapped = inverted
    ? INVERSE_RELATION_LABELS[relationship.type] || SHORT_RELATION_LABELS[relationship.type]
    : SHORT_RELATION_LABELS[relationship.type];
  if (mapped) return mapped;
  const label = String(relationship.label || '').trim();
  if (!label) return '';
  // Corta na fronteira de palavra: cortar no caractere produzia
  // "Integra o quadr…", que é ruído, não informação.
  if (label.length <= 18) return label;
  const cut = label.slice(0, 18);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 8 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

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

export const CORE_RELATIONSHIP_TYPES = new Set([
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

/**
 * Rótulo em português para cada propriedade exibida no painel da rede.
 *
 * O grafo carrega chaves em inglês vindas dos adaptadores. Sem tradução, a tela
 * mostrava o nome do campo quebrado em palavras — "graph Source", "joined At" —,
 * que não significa nada para quem lê o dossiê.
 */
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
    publicorganizationcode: 'Código do órgão',
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
    qualification: 'Qualificação',
    joinedat: 'Entrada na sociedade',
    endedat: 'Saída da sociedade',
    graphsource: 'Fonte do grafo',
    graphid: 'Identificador no grafo',
    identitybasis: 'Base da identificação',
    tradename: 'Nome fantasia',
    legalnature: 'Natureza jurídica',
    mainactivity: 'Atividade principal',
    registrationstatus: 'Situação cadastral',
    municipality: 'Município',
    state: 'UF',
    country: 'País',
    postalcode: 'CEP',
    territory: 'Território',
    organization: 'Órgão',
    parentorganization: 'Órgão superior',
    authority: 'Autoridade',
    provider: 'Provedor',
    providersources: 'Fontes consultadas',
    datasetsourcename: 'Base de origem',
    historicaldataset: 'Base histórica',
    url: 'Endereço',
    sourceurl: 'Endereço da fonte',
    domain: 'Domínio',
    publishedat: 'Publicado em',
    matchstrength: 'Força da correspondência',
    matchscore: 'Índice de compatibilidade',
    matchbasis: 'Base da correspondência',
    matchedterms: 'Termos encontrados',
    namematchonly: 'Correspondência apenas por nome',
    identitystatus: 'Situação da identidade',
    requireshumanreview: 'Exige revisão humana',
    projectedlocally: 'Projetado localmente',
    internal: 'Base interna',
    active: 'Ativo',
    disclaimer: 'Ressalva',
    candidatename: 'Nome do candidato',
    subjectname: 'Sujeito pesquisado',
    subjecttype: 'Tipo de sujeito',
    interestedname: 'Interessado no processo',
    comentioncount: 'Coocorrências',
    queriesmatched: 'Consultas que retornaram',
    questionnairerefs: 'Questões relacionadas',
    questionnairecandidate: 'Candidato do questionário',
    recordtype: 'Tipo de registro',
    category: 'Categoria',
    categories: 'Categorias',
    classname: 'Classe processual',
    processnumber: 'Número do processo',
    processurl: 'Página do processo',
    tribunal: 'Tribunal',
    judgmentdate: 'Data do julgamento',
    decisionnumber: 'Número da decisão',
    decisionurl: 'Documento da decisão',
    outcome: 'Resultado',
    modality: 'Modalidade',
    exercise: 'Exercício',
    legalbasis: 'Fundamentação legal',
    outcomebelongstoproceeding: 'Resultado pertence ao processo',
    discoverystatus: 'Situação da descoberta',
    contractnumber: 'Número do contrato',
    contractsmentioned: 'Contratos citados',
    signedat: 'Assinatura',
    openedat: 'Abertura',
    periodstart: 'Início do período',
    periodend: 'Fim do período',
    startsat: 'Início',
    endsat: 'Fim',
    validfrom: 'Válido a partir de',
    validuntil: 'Válido até',
    sanction: 'Sanção',
    sanctionactive: 'Sanção vigente',
    sanctionstart: 'Início da sanção',
    sanctionend: 'Fim da sanção',
    sanctioningbody: 'Órgão sancionador',
    offshoretype: 'Tipo de estrutura offshore',
    icijid: 'Identificador ICIJ',
    edition: 'Edição',
    description: 'Descrição',
    object: 'Objeto',
    value: 'Valor',
  };
  const normalized = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (known[normalized]) return known[normalized];

  // Chave nova ainda não traduzida: separa o camelCase e capitaliza, para virar
  // "Fonte Do Grafo" em vez de "graph Source". Continua sendo sinal de que falta
  // um rótulo no dicionário acima.
  const separado = key.replace(/([A-Z])/g, ' ').replace(/[_-]+/g, ' ').trim();
  return separado.charAt(0).toUpperCase() + separado.slice(1);
}

/**
 * Valor legível. Booleano cru aparecia como "false" na tela do dossiê.
 */
export function humanizePropertyValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.map((item) => String(item)).join('; ');
  return String(value);
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
    || String(entity.role || '').toUpperCase() === 'ROOT'
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
