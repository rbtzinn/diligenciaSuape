import { CNPJ } from '../../../lib/cnpj';
import type {
  DiligenceItem,
  EgosCoverageItem,
  EgosEntity,
  EgosEvidenceItem,
  EgosFinding,
  EgosRelationship,
  EgosSnapshot,
} from '../types';

const ADMIN_QUALIFICATIONS = /ADMINISTR|DIRETOR|PRESIDENTE|GESTOR|REPRESENTANTE/;

function normalizeName(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function stableId(prefix: string, key: string) {
  return `${prefix}:${stableHash(key)}`;
}

function confidenceFromRisk(value?: 'alta' | 'media' | 'baixa') {
  if (value === 'alta') return 90;
  if (value === 'media') return 70;
  if (value === 'baixa') return 45;
  return 70;
}

function findingSeverity(points: number): EgosFinding['severity'] {
  const absolutePoints = Math.abs(points);
  if (absolutePoints >= 20) return 'HIGH';
  if (absolutePoints >= 10) return 'MEDIUM';
  if (absolutePoints > 0) return 'LOW';
  return 'INFORMATIONAL';
}

/**
 * Mantém o mapa útil quando a API de persistência não consegue materializar o
 * snapshot EGOS. A projeção usa somente dados já coletados pela diligência e
 * preserva o snapshot oficial sempre que ele existir.
 */
export function ensureEgosSnapshot(diligence: DiligenceItem): EgosSnapshot {
  if (diligence.egos?.entities?.length) return diligence.egos;

  const generatedAt = diligence.companyConsultedAt || diligence.dataAnalise || new Date().toISOString();
  const rootCnpj = CNPJ.clean(diligence.cnpj || diligence.empresa?.cnpj || '');
  const rootKey = `company:cnpj:${rootCnpj}`;
  const sourceName = diligence.companySource || 'Cadastro público de CNPJ';

  const entitiesByKey = new Map<string, EgosEntity>();
  const relationshipsByKey = new Map<string, EgosRelationship>();
  const evidences: EgosEvidenceItem[] = [];
  const coverage: EgosCoverageItem[] = [];
  const findings: EgosFinding[] = [];
  const personKeyByName = new Map<string, string>();

  const registerEntity = (definition: Omit<EgosEntity, 'id'>) => {
    const current = entitiesByKey.get(definition.key);
    const entity: EgosEntity = {
      ...definition,
      id: current?.id || stableId('fallback-entity', definition.key),
      depth: Math.min(current?.depth ?? definition.depth, definition.depth),
      role: current?.role.toUpperCase() === 'ROOT' ? current.role : definition.role,
      confidence: Math.max(current?.confidence || 0, definition.confidence),
      properties: { ...(current?.properties || {}), ...(definition.properties || {}) },
      identifiers: [...(current?.identifiers || []), ...(definition.identifiers || [])]
        .filter((item, index, list) => list.findIndex((candidate) => (
          candidate.value === item.value
          && (candidate.type || candidate.identifierType) === (item.type || item.identifierType)
        )) === index),
    };
    entitiesByKey.set(definition.key, entity);
    if (entity.type === 'Person' && entity.normalizedName) {
      personKeyByName.set(entity.normalizedName, entity.key);
    }
    return entity;
  };

  const registerRelationship = (
    definition: Omit<EgosRelationship, 'id' | 'sourceEntityId' | 'targetEntityId'> & {
      sourceKey: string;
      targetKey: string;
    }
  ) => {
    const { sourceKey, targetKey, ...relationshipDefinition } = definition;
    const source = entitiesByKey.get(sourceKey);
    const target = entitiesByKey.get(targetKey);
    if (!source || !target) return undefined;
    const relationship: EgosRelationship = {
      ...relationshipDefinition,
      id: stableId('fallback-relationship', definition.key),
      sourceEntityId: source.id,
      targetEntityId: target.id,
      sourceName: source.name,
      targetName: target.name,
    };
    relationshipsByKey.set(definition.key, relationship);
    return relationship;
  };

  const registerEvidence = (seed: string, source: Omit<EgosEvidenceItem, 'id'>) => {
    evidences.push({ ...source, id: stableId('fallback-evidence', seed) });
  };

  const root = registerEntity({
    key: rootKey,
    type: 'Company',
    name: diligence.empresa?.razao_social || diligence.razaoSocial || 'Empresa analisada',
    normalizedName: normalizeName(diligence.empresa?.razao_social || diligence.razaoSocial),
    role: 'root',
    depth: 0,
    confidence: 100,
    properties: {
      cnpj: rootCnpj,
      tradeName: diligence.empresa?.nome_fantasia || diligence.nomeFantasia || null,
      registrationStatus: diligence.empresa?.descricao_situacao_cadastral || null,
      legalNature: diligence.empresa?.natureza_juridica || null,
      mainActivity: diligence.empresa?.cnae_fiscal_descricao || null,
      openedAt: diligence.empresa?.data_inicio_atividade || null,
      municipality: diligence.empresa?.municipio || null,
      state: diligence.empresa?.uf || null,
      projectedLocally: true,
    },
    identifiers: rootCnpj
      ? [{ type: 'CNPJ', value: rootCnpj, provider: sourceName, confidence: 100 }]
      : [],
  });

  registerEvidence(`${root.key}|registry`, {
    entityId: root.id,
    provider: 'PUBLIC_CNPJ_REGISTRY',
    sourceName,
    sourceUrl: rootCnpj ? `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(rootCnpj)}` : null,
    query: rootCnpj || null,
    identifier: rootCnpj || null,
    excerpt: `${root.name} — situação cadastral: ${diligence.empresa?.descricao_situacao_cadastral || 'não informada'}.`,
    confidence: 100,
    retrievedAt: generatedAt,
  });
  coverage.push({
    id: stableId('fallback-coverage', `${root.key}|registry`),
    axis: 'CADASTRO',
    provider: 'PUBLIC_CNPJ_REGISTRY',
    status: 'CONSULTED',
    message: 'Cadastro empresarial localizado e projetado no mapa.',
    resultCount: 1,
    consultedAt: generatedAt,
  });

  const shareholders = Array.isArray(diligence.socios) ? diligence.socios : [];
  shareholders.forEach((shareholder, index) => {
    const name = shareholder.nome_socio?.trim();
    if (!name) return;
    const qualification = shareholder.qualificacao_socio || 'Integrante do QSA';
    const document = CNPJ.clean(shareholder.cnpj_cpf_do_socio || '');
    const isCompany = document.length === 14 && !String(shareholder.cnpj_cpf_do_socio || '').includes('*');
    const key = isCompany
      ? `company:cnpj:${document}`
      : `person:qsa:${rootCnpj}:${stableHash(`${normalizeName(name)}|${qualification}|${document}|${index}`)}`;
    const entity = registerEntity({
      key,
      type: isCompany ? 'Company' : 'Person',
      name,
      normalizedName: normalizeName(name),
      role: 'qsa_member',
      depth: 1,
      confidence: 100,
      properties: {
        qualification,
        joinedAt: shareholder.data_entrada_sociedade || null,
        endedAt: shareholder.data_saida_sociedade || null,
        country: shareholder.pais || null,
        maskedCpf: !isCompany ? shareholder.cnpj_cpf_do_socio || null : null,
        projectedLocally: true,
      },
      identifiers: document
        ? [{
            type: isCompany ? 'CNPJ' : 'MASKED_CPF',
            value: document,
            provider: sourceName,
            confidence: isCompany ? 100 : 65,
          }]
        : [],
    });
    const isAdministrator = ADMIN_QUALIFICATIONS.test(qualification.toUpperCase());
    const relationshipKey = `rel:qsa:${key}:${rootKey}:${isAdministrator ? 'director' : 'shareholder'}`;
    const relationship = registerRelationship({
      key: relationshipKey,
      sourceKey: key,
      targetKey: rootKey,
      type: isAdministrator ? 'DIRECTOR_OF' : 'SHAREHOLDER_OF',
      label: isAdministrator ? 'Administra' : 'Integra o quadro societário',
      status: 'CONFIRMED',
      confidence: 100,
      properties: {
        qualification,
        joinedAt: shareholder.data_entrada_sociedade || null,
        endedAt: shareholder.data_saida_sociedade || null,
        provider: sourceName,
        projectedLocally: true,
      },
    });
    if (relationship) {
      registerEvidence(`${relationshipKey}|qsa`, {
        entityId: entity.id,
        relationshipId: relationship.id,
        provider: 'PUBLIC_QSA_REGISTRY',
        sourceName,
        sourceUrl: rootCnpj ? `https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(rootCnpj)}` : null,
        query: rootCnpj || null,
        identifier: document || name,
        excerpt: `${name} consta no quadro societário como “${qualification}”.`,
        confidence: 100,
        retrievedAt: generatedAt,
      });
    }
  });
  coverage.push({
    id: stableId('fallback-coverage', `${root.key}|qsa`),
    axis: 'QSA',
    provider: 'PUBLIC_QSA_REGISTRY',
    status: 'CONSULTED',
    message: shareholders.length
      ? `${shareholders.length} integrante(s) do quadro societário foram projetados no mapa.`
      : 'A fonte respondeu sem integrantes do quadro societário.',
    resultCount: shareholders.length,
    consultedAt: generatedAt,
  });

  const corporateNetwork = diligence.corporateNetwork;
  (corporateNetwork?.companies || []).forEach((item) => {
    const cnpj = CNPJ.clean(item.cnpj || item.company?.cnpj || '');
    if (cnpj.length !== 14) return;
    registerEntity({
      key: `company:cnpj:${cnpj}`,
      type: 'Company',
      name: item.company?.razao_social || `Empresa ${CNPJ.format(cnpj)}`,
      normalizedName: normalizeName(item.company?.razao_social),
      role: cnpj === rootCnpj ? 'root' : 'related_company',
      depth: cnpj === rootCnpj ? 0 : (item.depth || 2),
      confidence: 100,
      properties: {
        cnpj,
        tradeName: item.company?.nome_fantasia || null,
        registrationStatus: item.company?.descricao_situacao_cadastral || null,
        municipality: item.company?.municipio || null,
        state: item.company?.uf || null,
        projectedLocally: true,
      },
      identifiers: [{ type: 'CNPJ', value: cnpj, provider: item.source || corporateNetwork?.provider, confidence: 100 }],
    });
  });

  (corporateNetwork?.relationships || []).forEach((item, index) => {
    const sourceCnpj = CNPJ.clean(item.sourceCnpj || '');
    const targetCnpj = CNPJ.clean(item.targetCnpj || '');
    const relationshipKey = `rel:corporate:${sourceCnpj}:${targetCnpj}:${index}`;
    const relationship = registerRelationship({
      key: relationshipKey,
      sourceKey: `company:cnpj:${sourceCnpj}`,
      targetKey: targetCnpj === rootCnpj ? rootKey : `company:cnpj:${targetCnpj}`,
      type: 'SHAREHOLDER_OF',
      label: 'Integra o quadro societário',
      status: 'CONFIRMED',
      confidence: 100,
      properties: {
        qualification: item.qualification || null,
        joinedAt: item.joinedAt || null,
        provider: item.provider || corporateNetwork?.provider,
        projectedLocally: true,
      },
    });
    if (!relationship) return;
    registerEvidence(`${relationshipKey}|corporate`, {
      relationshipId: relationship.id,
      provider: 'CORPORATE_NETWORK',
      sourceName: item.provider || corporateNetwork?.provider || 'Fonte cadastral pública',
      query: targetCnpj || null,
      identifier: sourceCnpj || null,
      excerpt: `O CNPJ ${CNPJ.format(sourceCnpj)} consta no quadro societário de ${CNPJ.format(targetCnpj)}.`,
      confidence: 100,
      retrievedAt: item.consultedAt || corporateNetwork?.consultadoEm || generatedAt,
    });
  });

  const personExpansion = corporateNetwork?.personExpansion;
  (personExpansion?.people || []).forEach((person) => {
    if (!person.id || !person.name) return;
    const normalizedPersonName = normalizeName(person.name);
    const key = personKeyByName.get(normalizedPersonName) || `person:public-graph:${person.id}`;
    registerEntity({
      key,
      type: 'Person',
      name: person.name,
      normalizedName: normalizedPersonName,
      role: entitiesByKey.get(key)?.role || 'qsa_member_graph',
      depth: entitiesByKey.get(key)?.depth ?? 1,
      confidence: person.maskedCpf ? 85 : 70,
      properties: {
        graphSource: personExpansion?.provider || 'Grafo societário público',
        graphId: person.id,
        maskedCpf: person.maskedCpf || null,
        identityBasis: person.maskedCpf ? 'Nome exato + CPF mascarado' : 'Nome exato',
        identityConfirmed: false,
        projectedLocally: true,
      },
      identifiers: [
        ...(person.maskedCpf
          ? [{ type: 'MASKED_CPF', value: person.maskedCpf, provider: 'PUBLIC_COMPANY_GRAPH', confidence: 65 }]
          : []),
        { type: 'PUBLIC_GRAPH_ID', value: person.id, provider: 'PUBLIC_COMPANY_GRAPH', confidence: 85 },
      ],
    });
  });

  (personExpansion?.memberships || []).forEach((membership, index) => {
    const normalizedPersonName = normalizeName(membership.personName);
    const personKey = personKeyByName.get(normalizedPersonName) || `person:public-graph:${membership.personId}`;
    if (!entitiesByKey.has(personKey)) {
      registerEntity({
        key: personKey,
        type: 'Person',
        name: membership.personName,
        normalizedName: normalizedPersonName,
        role: 'qsa_member_graph',
        depth: 1,
        confidence: membership.confidence || 70,
        properties: {
          maskedCpf: membership.maskedCpf || null,
          identityConfirmed: false,
          projectedLocally: true,
        },
        identifiers: membership.maskedCpf
          ? [{ type: 'MASKED_CPF', value: membership.maskedCpf, provider: 'PUBLIC_COMPANY_GRAPH', confidence: 65 }]
          : [],
      });
    }
    const companyCnpj = CNPJ.clean(membership.companyCnpj || '');
    if (companyCnpj.length !== 14) return;
    const targetKey = membership.isRootCompany ? rootKey : `company:cnpj:${companyCnpj}`;
    if (!entitiesByKey.has(targetKey)) {
      registerEntity({
        key: targetKey,
        type: 'Company',
        name: membership.companyName || `Empresa ${CNPJ.format(companyCnpj)}`,
        normalizedName: normalizeName(membership.companyName),
        role: membership.isRootCompany ? 'root' : 'person_related_company',
        depth: membership.isRootCompany ? 0 : (membership.depth || 2),
        confidence: membership.confidence || 85,
        properties: { cnpj: companyCnpj, source: personExpansion?.provider, projectedLocally: true },
        identifiers: [{ type: 'CNPJ', value: companyCnpj, provider: 'PUBLIC_COMPANY_GRAPH', confidence: 100 }],
      });
    }
    const personEntity = entitiesByKey.get(personKey);
    const companyEntity = entitiesByKey.get(targetKey);
    const alreadyLinked = [...relationshipsByKey.values()].some((relationship) => (
      (relationship.sourceEntityId === personEntity?.id && relationship.targetEntityId === companyEntity?.id)
      || (relationship.sourceEntityId === companyEntity?.id && relationship.targetEntityId === personEntity?.id)
    ));
    if (membership.isRootCompany && alreadyLinked) return;
    const relationshipKey = `rel:public-qsa:${membership.personId}:${companyCnpj}:${index}`;
    const relationship = registerRelationship({
      key: relationshipKey,
      sourceKey: personKey,
      targetKey,
      type: 'QSA_MEMBER_OF',
      label: 'Consta no QSA público',
      status: 'PROBABLE',
      confidence: membership.confidence || 85,
      properties: {
        provider: 'PUBLIC_COMPANY_GRAPH',
        maskedCpf: membership.maskedCpf || null,
        matchBasis: membership.matchBasis,
        requiresHumanReview: true,
        identityConfirmed: false,
        disclaimer: 'O elo usa nome e CPF mascarado; valide a identidade antes de concluir que se trata da mesma pessoa.',
        projectedLocally: true,
      },
    });
    if (!relationship) return;
    registerEvidence(`${relationshipKey}|public-graph`, {
      relationshipId: relationship.id,
      provider: 'PUBLIC_COMPANY_GRAPH',
      sourceName: personExpansion?.provider || 'Grafo societário público',
      sourceUrl: membership.sourceUrl || null,
      query: rootCnpj || null,
      identifier: membership.maskedCpf || membership.personId,
      excerpt: `${membership.personName} aparece no quadro societário de ${membership.companyName}. A correspondência exige validação humana.`,
      confidence: membership.confidence || 85,
      retrievedAt: personExpansion?.consultadoEm || generatedAt,
    });
  });

  const fundNetwork = diligence.fundNetwork;
  const canonicalFundKey = (key: string) => key === `company:cnpj:${rootCnpj}` ? rootKey : key;
  if (fundNetwork?.ok && fundNetwork.applicable) {
    (fundNetwork.entities || []).forEach((entity) => {
      if (!entity.key || !entity.name) return;
      const key = canonicalFundKey(entity.key);
      registerEntity({
        key,
        type: entity.type || 'Company',
        name: entity.name,
        normalizedName: normalizeName(entity.name),
        role: key === rootKey ? 'root' : (entity.role || 'fund_related_entity'),
        depth: key === rootKey ? 0 : (entity.depth ?? 1),
        confidence: entity.confidence ?? 100,
        properties: { ...(entity.properties || {}), projectedLocally: true },
        identifiers: entity.identifiers || [],
      });
    });
    (fundNetwork.relationships || []).forEach((relationship) => {
      registerRelationship({
        key: relationship.key,
        sourceKey: canonicalFundKey(relationship.sourceKey),
        targetKey: canonicalFundKey(relationship.targetKey),
        type: relationship.type,
        label: relationship.label,
        status: relationship.status || 'CONFIRMED',
        confidence: relationship.confidence ?? 100,
        properties: { ...(relationship.properties || {}), projectedLocally: true },
      });
    });
    (fundNetwork.evidences || []).forEach((evidence, index) => {
      const entity = evidence.entityKey ? entitiesByKey.get(canonicalFundKey(evidence.entityKey)) : undefined;
      const relationship = evidence.relationshipKey ? relationshipsByKey.get(evidence.relationshipKey) : undefined;
      if (!entity && !relationship) return;
      registerEvidence(`fund|${evidence.relationshipKey || evidence.entityKey}|${index}`, {
        entityId: entity?.id,
        relationshipId: relationship?.id,
        provider: evidence.provider || 'CVM_FUND_REGISTRY',
        sourceName: evidence.sourceName || fundNetwork.provider,
        sourceUrl: evidence.sourceUrl || fundNetwork.sourceUrl || null,
        query: evidence.query || rootCnpj || null,
        identifier: evidence.identifier || null,
        excerpt: evidence.excerpt || null,
        confidence: evidence.confidence ?? 100,
        retrievedAt: evidence.retrievedAt || fundNetwork.consultadoEm || generatedAt,
      });
    });
  }

  const registerPublicOrganization = (
    name: string | undefined,
    provider: string,
    code?: string,
    cnpj?: string,
    parent?: string,
  ) => {
    const cleanCnpj = CNPJ.clean(cnpj || '');
    const key = code
      ? `organization:siafi:${code}`
      : cleanCnpj
        ? `organization:cnpj:${cleanCnpj}`
        : `organization:public:${stableHash(normalizeName(name))}`;
    registerEntity({
      key,
      type: 'Organization',
      name: name || 'Órgão público não informado',
      normalizedName: normalizeName(name),
      role: 'public_contracting_body',
      depth: 1,
      confidence: 100,
      properties: { provider, publicOrganization: true, parentOrganization: parent || null, projectedLocally: true },
      identifiers: [
        ...(cleanCnpj ? [{ type: 'CNPJ', value: cleanCnpj, provider, confidence: 100 }] : []),
        ...(code ? [{ type: 'SIAFI', value: code, provider, confidence: 100 }] : []),
      ],
    });
    return key;
  };

  const registerPublicContract = (
    provider: string,
    contract: {
      id?: number;
      numeroControlePncp?: string;
      numeroContrato?: string;
      numeroProcesso?: string;
      objeto?: string;
      orgao?: string;
      orgaoCodigo?: string;
      orgaoCnpj?: string;
      orgaoVinculado?: string;
      orgaoVinculadoCodigo?: string;
      orgaoSuperior?: string;
      valorGlobal?: number | null;
      valorFinal?: number;
      valorInicial?: number | null;
      dataAssinatura?: string;
      vigenciaInicio?: string;
      vigenciaFim?: string;
      url?: string | null;
    },
    consultedAt?: string,
  ) => {
    const organizationKey = registerPublicOrganization(
      contract.orgaoVinculado || contract.orgao,
      provider,
      contract.orgaoVinculadoCodigo || contract.orgaoCodigo,
      contract.orgaoCnpj,
      contract.orgaoSuperior,
    );
    const identifier = String(contract.numeroControlePncp || contract.id || contract.numeroContrato || contract.objeto || organizationKey);
    const value = Number(contract.valorGlobal ?? contract.valorFinal ?? contract.valorInicial) || 0;
    const key = `rel:public-contract:${stableHash(`${provider}|${identifier}|${organizationKey}`)}`;
    const relationship = registerRelationship({
      key,
      sourceKey: rootKey,
      targetKey: organizationKey,
      type: 'CONTRACTED_BY',
      label: 'Contratada por',
      status: 'CONFIRMED',
      confidence: 100,
      properties: {
        provider,
        contractNumber: contract.numeroContrato || null,
        processNumber: contract.numeroProcesso || null,
        object: contract.objeto || null,
        value,
        signedAt: contract.dataAssinatura || null,
        validFrom: contract.vigenciaInicio || null,
        validUntil: contract.vigenciaFim || null,
        sourceUrl: contract.url || null,
        projectedLocally: true,
      },
    });
    if (!relationship) return;
    registerEvidence(`${key}|evidence`, {
      relationshipId: relationship.id,
      provider,
      sourceName: provider === 'PNCP' ? 'Portal Nacional de Contratações Públicas' : 'Portal da Transparência do Governo Federal',
      sourceUrl: contract.url || null,
      query: rootCnpj || null,
      identifier,
      excerpt: `${contract.numeroContrato ? `Contrato ${contract.numeroContrato}. ` : ''}${contract.objeto || 'Objeto não informado.'}`,
      confidence: 100,
      retrievedAt: consultedAt || generatedAt,
    });
  };

  const pncpContracts = diligence.pncp?.contratos || [];
  pncpContracts.forEach((contract) => registerPublicContract('PNCP', contract, diligence.pncp?.consultadoEm));
  coverage.push({
    id: stableId('fallback-coverage', `${root.key}|pncp`),
    axis: 'PUBLIC_CONTRACTS',
    provider: 'PNCP',
    status: diligence.pncp?.ok ? (diligence.pncp.consultaParcial ? 'PARTIAL' : 'CONSULTED') : 'UNAVAILABLE',
    message: diligence.pncp?.ok
      ? `${pncpContracts.length} contrato(s) foram confirmados pelo CNPJ no PNCP.`
      : (diligence.pncp?.erro || 'O PNCP não foi consultado.'),
    resultCount: pncpContracts.length,
    consultedAt: diligence.pncp?.consultadoEm,
  });

  const federalContracts = (diligence.federalExposure?.contratos || [])
    .filter((contract) => contract.cnpjConfirmado !== false);
  federalContracts.forEach((contract) => registerPublicContract(
    'CGU_FEDERAL_CONTRACTS',
    contract,
    diligence.federalExposure?.consultadoEm,
  ));
  (diligence.federalExposure?.recursos?.orgaos || []).forEach((agency) => {
    const organizationKey = registerPublicOrganization(
      agency.nome,
      'CGU_FEDERAL_RESOURCES',
      agency.codigo,
      undefined,
      agency.orgaoSuperior,
    );
    const key = `rel:public-payment:${stableHash(`${rootKey}|${organizationKey}|${diligence.federalExposure?.recursos?.periodoInicio}`)}`;
    const relationship = registerRelationship({
      key,
      sourceKey: rootKey,
      targetKey: organizationKey,
      type: 'RECEIVED_PUBLIC_RESOURCES_FROM',
      label: 'Recebeu recursos de',
      status: 'CONFIRMED',
      confidence: 100,
      properties: {
        provider: 'CGU_FEDERAL_RESOURCES',
        value: agency.valorTotal,
        periodStart: diligence.federalExposure?.recursos?.periodoInicio || null,
        periodEnd: diligence.federalExposure?.recursos?.periodoFim || null,
        sourceUrl: diligence.federalExposure?.sourceUrl || null,
        projectedLocally: true,
      },
    });
    if (!relationship) return;
    registerEvidence(`${key}|evidence`, {
      relationshipId: relationship.id,
      provider: 'CGU_FEDERAL_RESOURCES',
      sourceName: 'Portal da Transparência do Governo Federal',
      sourceUrl: diligence.federalExposure?.sourceUrl || null,
      query: rootCnpj || null,
      identifier: agency.codigo || agency.nome,
      excerpt: `Pagamentos agregados no período consultado: ${agency.valorTotal}.`,
      confidence: 100,
      retrievedAt: diligence.federalExposure?.consultadoEm || generatedAt,
    });
  });
  coverage.push({
    id: stableId('fallback-coverage', `${root.key}|federal-exposure`),
    axis: 'PUBLIC_CONTRACTS',
    provider: 'CGU_FEDERAL_CONTRACTS',
    status: diligence.federalExposure?.ok
      ? (diligence.federalExposure.consultaParcial ? 'PARTIAL' : 'CONSULTED')
      : 'UNAVAILABLE',
    message: diligence.federalExposure?.ok
      ? `${federalContracts.length} contrato(s) federal(is) e ${diligence.federalExposure.recursos?.quantidadeRegistros || 0} pagamento(s) foram vinculados ao CNPJ.`
      : (diligence.federalExposure?.erro || 'A exposição federal não foi consultada.'),
    resultCount: federalContracts.length + (diligence.federalExposure?.recursos?.quantidadeRegistros || 0),
    consultedAt: diligence.federalExposure?.consultadoEm,
  });

  (diligence.risco?.detalhes || [])
    .filter((detail) => detail.requerRevisao)
    .forEach((detail, index) => {
      findings.push({
        id: stableId('fallback-finding', `${rootKey}|${detail.criterio}|${index}`),
        entityId: root.id,
        axis: detail.categoria || 'DECISAO_HUMANA',
        status: 'REVIEW',
        severity: findingSeverity(detail.pontos),
        title: detail.criterio,
        explanation: detail.info,
        confidence: confidenceFromRisk(detail.confianca),
        reviewStatus: 'pending',
      });
    });

  coverage.push({
    id: stableId('fallback-coverage', `${root.key}|relationships`),
    axis: 'RELATIONSHIPS',
    provider: 'LOCAL_PUBLIC_DATA_PROJECTION',
    status: corporateNetwork?.consultaParcial ? 'PARTIAL' : 'CONSULTED',
    message: 'As entidades e ligações já coletadas foram projetadas localmente no mapa.',
    resultCount: relationshipsByKey.size,
    consultedAt: generatedAt,
  });

  const entities = [...entitiesByKey.values()];
  const relationships = [...relationshipsByKey.values()];
  const coverageCounts = coverage.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
  const statusCounts = findings.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});

  return {
    runId: `fallback-${diligence.id}`,
    version: 'egos-local-public-data-projection-1.0',
    generatedAt,
    metrics: {
      entities: entities.length,
      relationships: relationships.length,
      evidences: evidences.length,
      findings: findings.length,
      resolutions: 0,
      coverage: coverageCounts,
      statuses: statusCounts,
    },
    insights: [
      `${relationships.length} ligação(ões) pública(s) foram organizadas para navegação.`,
      'A projeção local mantém o mapa disponível; vínculos prováveis continuam exigindo validação humana.',
    ],
    coverage,
    entities,
    relationships,
    evidences,
    findings,
    resolutions: [],
  };
}
