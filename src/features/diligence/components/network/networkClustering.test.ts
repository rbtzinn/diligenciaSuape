import { describe, expect, it } from 'vitest';
import { clusterNetwork } from './networkClustering';
import type { EgosEntity, EgosRelationship } from '../../types';

function entity(id: string, type: string, name = id, depth = 1): EgosEntity {
  return {
    id,
    key: id,
    type,
    name,
    normalizedName: name.toLowerCase(),
    properties: {},
    depth,
    role: '',
    confidence: 100,
  };
}

function relationship(id: string, source: string, target: string, type = 'CONTRACTED_BY'): EgosRelationship {
  return {
    id,
    key: id,
    sourceEntityId: source,
    targetEntityId: target,
    type,
    label: type === 'CONTRACTED_BY' ? 'Contratada por' : 'Integra o quadro societário',
    status: 'CONFIRMED',
    confidence: 100,
    properties: {},
  };
}

/** Empresa investigada com `orgaos` clientes e `socios` no quadro. */
function network(orgaos: number, socios: number) {
  const entities: EgosEntity[] = [entity('raiz', 'Company', 'EMPRESA INVESTIGADA', 0)];
  const relationships: EgosRelationship[] = [];

  for (let index = 0; index < orgaos; index += 1) {
    entities.push(entity(`org${index}`, 'Organization', `ORGAO ${index}`));
    relationships.push(relationship(`r-org${index}`, 'raiz', `org${index}`, 'CONTRACTED_BY'));
  }
  for (let index = 0; index < socios; index += 1) {
    entities.push(entity(`p${index}`, 'Person', `PESSOA ${index}`));
    relationships.push(relationship(`r-p${index}`, `p${index}`, 'raiz', 'SHAREHOLDER_OF'));
  }
  return { entities, relationships };
}

describe('clusterNetwork', () => {
  it('não mexe num mapa que já cabe na tela', () => {
    const { entities, relationships } = network(2, 3);
    const result = clusterNetwork(entities, relationships, 'raiz');
    expect(result.groups).toHaveLength(0);
    expect(result.entities).toHaveLength(entities.length);
    expect(result.collapsedCount).toBe(0);
  });

  // O caso que motivou o módulo: cem órgãos contratantes afogando seis
  // sócios. Depois do agrupamento, o quadro societário volta a ser
  // visível.
  it('recolhe as folhas repetidas e preserva o quadro societário', () => {
    const { entities, relationships } = network(100, 6);
    const result = clusterNetwork(entities, relationships, 'raiz');

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].members).toHaveLength(100);
    expect(result.collapsedCount).toBe(100);

    // raiz + 6 sócios + 1 nó de grupo
    expect(result.entities).toHaveLength(8);
    const pessoas = result.entities.filter((item) => item.type === 'Person');
    expect(pessoas).toHaveLength(6);
  });

  it('nomeia o grupo com a quantidade e guarda quem está dentro', () => {
    const { entities, relationships } = network(40, 2);
    const result = clusterNetwork(entities, relationships, 'raiz');
    const grupo = result.entities.find((item) => item.properties.grupo);

    expect(grupo?.name).toBe('40 órgãos e instituições');
    expect(grupo?.properties.quantidade).toBe(40);
    expect((grupo?.properties.integrantes as string[]).length).toBe(40);
  });

  // Nó que liga dois ramos é o achado que o mapa existe para mostrar.
  // Recolhê-lo por parecer folha seria apagar a única coisa que
  // importava ali.
  it('nunca agrupa quem tem mais de uma ligação', () => {
    const { entities, relationships } = network(20, 1);
    // Um dos órgãos também se liga a uma segunda empresa.
    entities.push(entity('outra', 'Company', 'OUTRA EMPRESA'));
    relationships.push(relationship('r-ponte', 'org3', 'outra', 'CONTRACTED_BY'));

    const result = clusterNetwork(entities, relationships, 'raiz');
    const ids = result.entities.map((item) => item.id);
    expect(ids).toContain('org3');
    expect(ids).toContain('outra');
  });

  it('nunca agrupa a empresa investigada', () => {
    const { entities, relationships } = network(30, 0);
    const result = clusterNetwork(entities, relationships, 'raiz');
    expect(result.entities.some((item) => item.id === 'raiz')).toBe(true);
  });

  // A regra que separa este agrupamento de "esconda o excesso": o
  // quadro societário é o que o analista foi ver, e continua nó a nó
  // por mais numeroso que seja.
  it('nunca agrupa vínculo societário, por mais sócios que existam', () => {
    const { entities, relationships } = network(0, 30);
    const result = clusterNetwork(entities, relationships, 'raiz');

    expect(result.groups).toHaveLength(0);
    expect(result.entities.filter((item) => item.type === 'Person')).toHaveLength(30);
  });

  // Contrato e menção não podem cair no mesmo saco: o rótulo do grupo
  // diria uma relação que metade dos membros não tem.
  it('separa grupos por tipo de vínculo', () => {
    const entities: EgosEntity[] = [entity('raiz', 'Company', 'RAIZ', 0)];
    const relationships: EgosRelationship[] = [];
    for (let index = 0; index < 8; index += 1) {
      entities.push(entity(`c${index}`, 'Organization', `CLIENTE ${index}`));
      relationships.push(relationship(`rc${index}`, 'raiz', `c${index}`, 'CONTRACTED_BY'));
      entities.push(entity(`m${index}`, 'Document', `PUBLICACAO ${index}`));
      relationships.push(relationship(`rm${index}`, 'raiz', `m${index}`, 'MENTIONED_IN'));
    }

    const result = clusterNetwork(entities, relationships, 'raiz');
    expect(result.groups).toHaveLength(2);
    const tipos = result.groups.map((group) => group.relationshipType).sort();
    expect(tipos).toEqual(['CONTRACTED_BY', 'MENTIONED_IN']);
  });

  it('abrir um grupo devolve os membros ao mapa', () => {
    const { entities, relationships } = network(30, 2);
    const fechado = clusterNetwork(entities, relationships, 'raiz');
    const grupoId = fechado.groups[0].id;

    const aberto = clusterNetwork(entities, relationships, 'raiz', new Set([grupoId]));
    expect(aberto.collapsedCount).toBe(0);
    expect(aberto.entities.filter((item) => item.type === 'Organization')).toHaveLength(30);
    expect(aberto.entities.some((item) => item.properties.grupo)).toBe(false);
  });

  // Aresta cuja outra ponta ficou fora do recorte não é vínculo
  // visível, e não pode inflar o grau de ninguém.
  it('ignora ligação com ponta fora do recorte ao contar o grau', () => {
    const { entities, relationships } = network(20, 0);
    relationships.push(relationship('r-fantasma', 'org1', 'inexistente', 'CONTRACTED_BY'));

    const result = clusterNetwork(entities, relationships, 'raiz');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].members).toHaveLength(20);
  });
});
