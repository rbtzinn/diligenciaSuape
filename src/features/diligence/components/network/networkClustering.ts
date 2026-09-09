// ==========================================================
// DILIGÊNCIA 360 — Agrupamento do mapa denso
// ==========================================================
// A IMAGEM GEOSISTEMAS abre com 110 entidades e 295 ligações, e quase
// cem delas são órgãos que contrataram a empresa: universidades
// federais, ministérios, agências. Cada um é um nó legítimo, apurado
// do PNCP e do Portal da Transparência. Juntos, viram um leque em que
// não se lê nome nenhum — e o quadro societário, que é o que o
// analista foi ver, desaparece no meio.
//
// A saída não é esconder. É agrupar o que se repete: cem folhas
// iguais penduradas no mesmo nó, pela mesma relação, dizem uma coisa
// só — "esta empresa vende para cem órgãos". Isso cabe num nó com a
// contagem, e o detalhe fica a um toque.
//
// O que NUNCA é agrupado:
//
//  · a empresa investigada;
//  · o vínculo societário — sócio, administrador, representante. Foi
//    para vê-lo que o analista abriu o mapa; recolher seis sócios num
//    nó "6 pessoas" resolveria a poluição apagando o conteúdo. Isso o
//    teste flagrou, e é a regra que separa este agrupamento de um
//    simples "esconda o excesso";
//  · quem tem mais de uma ligação — nó que conecta dois ramos é
//    exatamente o achado que o mapa existe para mostrar;
//  · grupos pequenos, que não atrapalham e cujo nome cabe na tela.
// ==========================================================

import type { EgosEntity, EgosRelationship } from '../../types';
import { CORE_RELATIONSHIP_TYPES } from './networkUtils';

/** Abaixo disto o grupo não compensa: os nomes ainda cabem na tela. */
const MIN_GROUP_SIZE = 5;

export interface NetworkGroup {
  id: string;
  /** Nó a que o grupo está pendurado. */
  anchorId: string;
  entityType: string;
  relationshipType: string;
  relationshipLabel: string;
  /** Entidades representadas, na ordem em que aparecem no grupo. */
  members: EgosEntity[];
}

export interface ClusteredNetwork {
  entities: EgosEntity[];
  relationships: EgosRelationship[];
  /** Grupos formados, abertos ou não. */
  groups: NetworkGroup[];
  /** Quantas entidades foram recolhidas nos grupos ainda fechados. */
  collapsedCount: number;
}

/**
 * Plural escrito, não deduzido.
 *
 * Acrescentar "s" ao rótulo do tipo produzia "40 cargos público /
 * peps": os rótulos de `TYPE_LABELS` são compostos, e pluralizá-los
 * por regra quebra a concordância. Tipo que não estiver aqui cai em
 * "N entidades" — menos específico, mas nunca errado.
 */
const GROUP_PLURAL: Record<string, string> = {
  Company: 'empresas',
  Person: 'pessoas',
  Organization: 'órgãos e instituições',
  PublicOffice: 'cargos públicos',
  Document: 'publicações',
  CourtCase: 'processos judiciais',
  Sanction: 'sanções',
  Address: 'endereços',
  InvestmentFund: 'fundos de investimento',
  InvestmentFundClass: 'classes de fundo',
};

function pluralLabel(entityType: string, size: number): string {
  return `${size} ${GROUP_PLURAL[entityType] || 'entidades'}`;
}

/**
 * Recolhe folhas repetidas em nós de grupo.
 *
 * `expanded` traz os grupos que o usuário abriu; os membros deles
 * voltam ao mapa como nós próprios, e o grupo deixa de existir.
 */
export function clusterNetwork(
  entities: EgosEntity[],
  relationships: EgosRelationship[],
  rootId: string | undefined,
  expanded: ReadonlySet<string> = new Set(),
): ClusteredNetwork {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));

  // Grau de cada entidade neste recorte. Só conta ligação cujas duas
  // pontas estão presentes: aresta pendurada no vazio não é vínculo.
  const degree = new Map<string, number>();
  const validRelationships = relationships.filter(
    (relationship) => byId.has(relationship.sourceEntityId) && byId.has(relationship.targetEntityId),
  );
  for (const relationship of validRelationships) {
    degree.set(relationship.sourceEntityId, (degree.get(relationship.sourceEntityId) || 0) + 1);
    degree.set(relationship.targetEntityId, (degree.get(relationship.targetEntityId) || 0) + 1);
  }

  // Candidatos: folhas — grau 1 — juntadas por âncora, tipo de
  // entidade e tipo de relação. As três coisas precisam coincidir,
  // senão o grupo misturaria "contratou" com "é sócio".
  const buckets = new Map<string, { anchorId: string; relationship: EgosRelationship; members: EgosEntity[] }>();

  for (const relationship of validRelationships) {
    // Vínculo societário nunca vira grupo: é o conteúdo, não o ruído.
    if (CORE_RELATIONSHIP_TYPES.has(relationship.type)) continue;

    const source = byId.get(relationship.sourceEntityId)!;
    const target = byId.get(relationship.targetEntityId)!;

    const candidates: Array<[EgosEntity, EgosEntity]> = [
      [source, target],
      [target, source],
    ];

    for (const [leaf, anchor] of candidates) {
      if (leaf.id === rootId) continue;
      if ((degree.get(leaf.id) || 0) !== 1) continue;
      if (anchor.id === leaf.id) continue;

      const key = `${anchor.id}|${leaf.type}|${relationship.type}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.members.push(leaf);
      else buckets.set(key, { anchorId: anchor.id, relationship, members: [leaf] });
      break;
    }
  }

  const groups: NetworkGroup[] = [];
  const grouped = new Set<string>();

  for (const [key, bucket] of buckets) {
    if (bucket.members.length < MIN_GROUP_SIZE) continue;
    const members = [...bucket.members].sort((left, right) =>
      left.name.localeCompare(right.name, 'pt-BR'),
    );
    groups.push({
      id: `grupo:${key}`,
      anchorId: bucket.anchorId,
      entityType: members[0].type,
      relationshipType: bucket.relationship.type,
      relationshipLabel: bucket.relationship.label,
      members,
    });
    if (!expanded.has(`grupo:${key}`)) {
      members.forEach((member) => grouped.add(member.id));
    }
  }

  if (groups.length === 0) {
    return { entities, relationships, groups: [], collapsedCount: 0 };
  }

  const outEntities = entities.filter((entity) => !grouped.has(entity.id));
  const outRelationships = relationships.filter(
    (relationship) => !grouped.has(relationship.sourceEntityId) && !grouped.has(relationship.targetEntityId),
  );

  for (const group of groups) {
    if (expanded.has(group.id)) continue;
    const anchor = byId.get(group.anchorId);
    if (!anchor) continue;

    outEntities.push({
      id: group.id,
      key: group.id,
      type: group.entityType,
      name: pluralLabel(group.entityType, group.members.length),
      normalizedName: '',
      depth: Math.min(...group.members.map((member) => member.depth || 1)),
      role: 'group',
      confidence: 100,
      properties: {
        grupo: true,
        quantidade: group.members.length,
        vinculo: group.relationshipLabel,
        // Os nomes vão junto: o painel lista o que está recolhido sem
        // precisar de outra consulta, e o grupo nunca esconde de quem
        // se trata.
        integrantes: group.members.map((member) => member.name),
      },
    });

    outRelationships.push({
      id: `rel:${group.id}`,
      key: `rel:${group.id}`,
      sourceEntityId: group.id,
      targetEntityId: anchor.id,
      sourceName: '',
      targetName: anchor.name,
      type: group.relationshipType,
      label: group.relationshipLabel,
      status: 'CONFIRMED',
      confidence: 100,
      properties: { grupo: true, quantidade: group.members.length },
    });
  }

  return {
    entities: outEntities,
    relationships: outRelationships,
    groups,
    collapsedCount: grouped.size,
  };
}
