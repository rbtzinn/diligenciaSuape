const { normalizeName, stableHash, safeDate } = require('../domain/normalization');

function resolveMediaSubjectKey(context, subject) {
  if (subject?.subjectType === 'company') return context.companyKey;
  if (subject?.subjectType !== 'person') return null;
  return context.shareholderKeys.get(normalizeName(subject.subjectName)) || null;
}

function adaptMedia(builder, context, payload) {
  const companyKey = context.companyKey;
  const media = payload.adverseMedia;
  const results = Array.isArray(media?.results) ? media.results : [];
  const companyResults = media?.companyResultsCount ?? results.filter((item) => item.subjectType !== 'person').length;
  const personResults = media?.personResultsCount ?? results.filter((item) => item.subjectType === 'person').length;
  const riskRelevantResults = results.filter((item) => item.riskRelevant !== false);
  const unavailable = !media || media.semChave || media.ok === false;
  const coMentionPairs = new Map();
  builder.addCoverage({
    axis: 'MEDIA',
    provider: 'MEDIA_SEARCH',
    status: unavailable ? 'UNAVAILABLE' : media.consultaParcial ? 'PARTIAL' : 'CONSULTED',
    message: unavailable
      ? (media?.aviso || 'A busca de mídia não está configurada ou não respondeu.')
      : results.length > 0
        ? `${results.length} publicação(ões) única(s) foram correlacionadas: ${riskRelevantResults.length} com termos de atenção e ${results.length - riskRelevantResults.length} menção(ões) geral(is).`
        : `Nenhum resultado localizado nas fontes consultadas para a empresa e ${media?.peopleSearched || 0} integrante(s).`,
    resultCount: results.length,
    consultedAt: media?.consultadoEm ? safeDate(media.consultadoEm) : null,
  });

  if (unavailable) return;
  if (results.length === 0) {
    builder.addFinding({
      entityKey: companyKey,
      axis: 'MEDIA',
      status: 'OK',
      severity: 'INFORMATIONAL',
      title: 'Nenhum resultado localizado nas fontes consultadas',
      explanation: 'As consultas configuradas foram executadas e não retornaram conteúdo correlacionado. Isso não comprova ausência de notícias fora das fontes e do período coberto.',
      confidence: 100,
    });
    return;
  }

  for (const item of results) {
    const isPersonResult = item.subjectType === 'person';
    const personRiskRelevant = isPersonResult
      && item.personMatch?.fullName === true
      && Array.isArray(item.matchedTerms)
      && item.matchedTerms.length > 0
      && Array.isArray(item.categories)
      && item.categories.some((category) => category === 'criminal' || category === 'integrity');
    const riskRelevant = item.riskRelevant !== false
      && (!isPersonResult || personRiskRelevant);
    const relatedSubjects = Array.isArray(item.relatedSubjects) && item.relatedSubjects.length > 0
      ? item.relatedSubjects
      : [{
          subjectType: item.subjectType || 'company',
          subjectName: item.subjectName || payload.razaoSocial,
          matchStrength: item.matchStrength,
          identityStatus: item.identityStatus,
        }];
    const resolvedSubjects = relatedSubjects
      .map((subject) => ({ subject, sourceKey: resolveMediaSubjectKey(context, subject) }))
      .filter((entry) => entry.sourceKey)
      .filter((entry, index, list) => list.findIndex((candidate) => candidate.sourceKey === entry.sourceKey) === index);
    const sourceKey = resolveMediaSubjectKey(context, item) || resolvedSubjects[0]?.sourceKey;
    if (!sourceKey || resolvedSubjects.length === 0) continue;
    const documentKey = `document:web:${stableHash(item.url || item.title)}`;
    builder.addEntity({
      key: documentKey,
      type: 'Document',
      name: item.title || 'Publicação na web',
      normalizedName: normalizeName(item.title),
      role: isPersonResult ? 'person_occurrence_candidate' : 'media_mention',
      depth: 1,
      confidence: item.matchStrength === 'high' ? 85 : item.matchStrength === 'medium' ? 65 : 40,
      properties: {
        url: item.url || null,
        domain: item.domain || null,
        publishedAt: item.publishedAt || null,
        categories: item.categories || [],
        matchedTerms: item.matchedTerms || [],
        questionnaireCandidate: personRiskRelevant,
        riskRelevant,
        matchStrength: item.matchStrength || 'low',
        subjectType: item.subjectType || 'company',
        subjectName: item.subjectName || payload.razaoSocial,
        identityStatus: item.identityStatus || null,
        questionnaireRefs: item.questionnaireRefs || [],
      },
    });
    let relationshipKey = null;
    for (const association of resolvedSubjects) {
      const associationIsPerson = association.subject.subjectType === 'person';
      const associationStrength = association.subject.matchStrength || item.matchStrength;
      const associationConfidence = associationStrength === 'high' ? 85 : associationStrength === 'medium' ? 65 : 40;
      const associationRelationshipKey = builder.addRelationship({
        sourceKey: association.sourceKey,
        targetKey: documentKey,
        type: associationIsPerson ? 'POSSIBLE_PERSON_OCCURRENCE' : 'MENTIONED_IN',
        label: associationIsPerson ? 'Possível menção pública associada ao nome' : 'Mencionada em publicação',
        status: 'CANDIDATE',
        confidence: associationConfidence,
        properties: {
          queriesMatched: item.queriesMatched || [],
          provider: 'MEDIA_SEARCH',
          providerSources: item.providerSources || [],
          subjectType: association.subject.subjectType,
          subjectName: association.subject.subjectName,
          requiresHumanReview: true,
          identityConfirmed: false,
        },
      });
      builder.addEvidence({
        entityKey: documentKey,
        relationshipKey: associationRelationshipKey,
        provider: (item.providerSources || []).join(' + ') || 'MEDIA_SEARCH',
        sourceName: item.domain || 'Publicação na web',
        sourceUrl: item.url || null,
        query: (item.queriesMatched || []).join(' | ') || association.subject.subjectName || payload.razaoSocial,
        identifier: item.url || item.title,
        excerpt: item.snippet || null,
        confidence: associationConfidence,
        retrievedAt: item.searchedAt ? safeDate(item.searchedAt) : new Date(),
      });
      if (association.sourceKey === sourceKey) relationshipKey = associationRelationshipKey;
    }

    const resolvedCoMentions = (Array.isArray(item.coMentionedSubjects) ? item.coMentionedSubjects : [])
      .map((subject) => ({
        subject,
        entityKey: resolveMediaSubjectKey(context, subject),
      }))
      .filter((entry) => entry.entityKey)
      .filter((entry, index, list) => list.findIndex((candidate) => candidate.entityKey === entry.entityKey) === index);

    for (let leftIndex = 0; leftIndex < resolvedCoMentions.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < resolvedCoMentions.length; rightIndex += 1) {
        const left = resolvedCoMentions[leftIndex];
        const right = resolvedCoMentions[rightIndex];
        if (left.entityKey === right.entityKey) continue;
        const [sourceKey, targetKey] = [left.entityKey, right.entityKey].sort();
        const pairKey = `${sourceKey}|${targetKey}`;
        const documentIdentity = item.url || item.title || documentKey;
        const pairConfidence = Math.min(
          80,
          Number(left.subject.confidence || 65),
          Number(right.subject.confidence || 65)
        );
        const currentPair = coMentionPairs.get(pairKey) || {
          sourceKey,
          targetKey,
          confidence: 0,
          documents: new Map(),
        };
        currentPair.confidence = Math.max(currentPair.confidence, pairConfidence);
        currentPair.documents.set(documentIdentity, {
          documentKey,
          sourceName: item.domain || 'Publicação na web',
          sourceUrl: item.url || null,
          query: (item.queriesMatched || []).join(' | ') || null,
          identifier: documentIdentity,
          excerpt: item.snippet || item.title || 'As duas entidades foram citadas na mesma publicação.',
          confidence: pairConfidence,
          retrievedAt: item.searchedAt ? safeDate(item.searchedAt) : new Date(),
        });
        coMentionPairs.set(pairKey, currentPair);
      }
    }

    if (riskRelevant && (item.matchStrength === 'high' || item.matchStrength === 'medium')) {
      builder.addFinding({
        entityKey: sourceKey,
        relationshipKey,
        axis: 'MEDIA',
        status: item.matchStrength === 'high' ? 'REVIEW' : 'INCONCLUSIVE',
        severity: item.matchStrength === 'high' ? 'MEDIUM' : 'LOW',
        title: isPersonResult ? 'Conteúdo público associado ao nome — validar pessoa e teor' : 'Publicação potencialmente relevante sobre a empresa',
        explanation: isPersonResult
          ? `A pesquisa encontrou conteúdo associado ao nome “${item.subjectName}”. Isso não confirma identidade, autoria, investigação, processo, condenação ou irregularidade.`
          : 'A correlação indica que o conteúdo merece leitura humana. A menção não comprova irregularidade.',
        confidence: item.matchStrength === 'high' ? 85 : 65,
      });
    }
  }

  for (const pair of coMentionPairs.values()) {
    const relationshipKey = builder.addRelationship({
      key: `rel:media-co-mention:${stableHash(pair.sourceKey, pair.targetKey)}`,
      sourceKey: pair.sourceKey,
      targetKey: pair.targetKey,
      type: 'CO_MENTIONED_WITH',
      label: 'Co-mencionados em fonte pública',
      status: 'CANDIDATE',
      confidence: pair.confidence,
      properties: {
        provider: 'MEDIA_SEARCH',
        coMentionCount: pair.documents.size,
        requiresHumanReview: true,
        identityConfirmed: false,
        disclaimer: 'Co-menção não comprova vínculo pessoal, societário ou ilícito.',
      },
    });

    for (const evidence of pair.documents.values()) {
      builder.addEvidence({
        entityKey: evidence.documentKey,
        relationshipKey,
        provider: 'MEDIA_CO_MENTION',
        sourceName: evidence.sourceName,
        sourceUrl: evidence.sourceUrl,
        query: evidence.query,
        identifier: evidence.identifier,
        excerpt: evidence.excerpt,
        confidence: evidence.confidence,
        retrievedAt: evidence.retrievedAt,
      });
    }
  }

  if (coMentionPairs.size > 0) {
    builder.addInsight(`${coMentionPairs.size} par(es) de entidades foram citados na mesma fonte pública; co-menção é apenas hipótese contextual.`);
  }
}

function adaptProcesses(builder, context, payload) {
  const companyKey = context.companyKey;
  const discoveries = Array.isArray(payload.processosDescobertos) ? payload.processosDescobertos : [];
  const enriched = discoveries.filter((item) => item.dataJud);
  const discoveryExecuted = payload.processDiscoveryExecuted === true;
  const discoverySources = Array.isArray(payload.processDiscoverySources) ? payload.processDiscoverySources : [];
  builder.addCoverage({
    axis: 'PROCESS_DISCOVERY',
    provider: 'PROCESS_DISCOVERY',
    status: discoveries.length > 0 ? 'PARTIAL' : discoveryExecuted ? 'CONSULTED' : 'NOT_CONSULTED',
    message: discoveries.length > 0
      ? `${discoveries.length} número(s) CNJ foram extraídos de fontes auxiliares; a associação ainda precisa ser validada.`
      : discoveryExecuted
        ? `A extração de números CNJ foi executada sobre ${discoverySources.join(' e ') || 'as evidências coletadas'} e não localizou identificador processual válido.`
        : 'Nenhum provider de descoberta processual por entidade foi executado.',
    resultCount: discoveries.length,
    consultedAt: discoveries.length > 0 ? safeDate(payload.dataAnalise) : null,
  });
  builder.addCoverage({
    axis: 'DATAJUD',
    provider: 'CNJ_DATAJUD',
    status: enriched.length > 0 ? 'CONSULTED' : discoveries.length > 0 ? 'PARTIAL' : discoveryExecuted ? 'NOT_APPLICABLE' : 'NOT_CONSULTED',
    message: enriched.length > 0
      ? `${enriched.length} processo(s) conhecido(s) foram enriquecidos no DataJud.`
      : discoveries.length > 0
        ? `${discoveries.length} número(s) CNJ aguardam enriquecimento no DataJud.`
        : discoveryExecuted
          ? 'Nenhum número CNJ foi descoberto; portanto não havia processo aplicável ao enriquecimento DataJud.'
          : 'O DataJud somente enriquece números CNJ previamente identificados; nenhum processo foi enriquecido.',
    resultCount: enriched.length,
    consultedAt: enriched.length > 0 ? safeDate(payload.dataAnalise) : null,
  });

  for (const discovery of discoveries) {
    const primarySource = discovery.primarySource || discovery.sources?.[0];
    const sourceKey = primarySource?.subjectType === 'person'
      ? context.shareholderKeys.get(normalizeName(primarySource.subjectName)) || companyKey
      : companyKey;
    const processNumber = discovery.processNumber || discovery.formattedProcessNumber;
    if (!processNumber) continue;
    const caseKey = `court-case:cnj:${String(processNumber).replace(/\D/g, '')}`;
    builder.addEntity({
      key: caseKey,
      type: 'CourtCase',
      name: discovery.formattedProcessNumber || processNumber,
      normalizedName: String(processNumber).replace(/\D/g, ''),
      role: 'case_candidate',
      depth: 1,
      confidence: discovery.status === 'validated' || discovery.status === 'enriched' ? 85 : 55,
      properties: {
        tribunal: discovery.tribunal || null,
        discoveryStatus: discovery.status || 'candidate',
        className: discovery.dataJud?.classe || null,
        category: discovery.dataJud?.categoria?.label || null,
      },
      identifiers: [{ type: 'CNJ', value: String(processNumber).replace(/\D/g, ''), provider: primarySource?.name || 'PROCESS_DISCOVERY', confidence: 100 }],
    });
    const relationshipKey = builder.addRelationship({
      sourceKey,
      targetKey: caseKey,
      type: 'POTENTIALLY_RELATED_TO_CASE',
      label: 'Possível relação processual',
      status: discovery.status === 'validated' || discovery.status === 'enriched' ? 'VALIDATED' : 'CANDIDATE',
      confidence: discovery.status === 'validated' || discovery.status === 'enriched' ? 85 : 55,
      properties: { role: 'UNKNOWN', provider: primarySource?.name || 'PROCESS_DISCOVERY' },
    });
    builder.addEvidence({
      entityKey: caseKey,
      relationshipKey,
      provider: primarySource?.type || 'PROCESS_DISCOVERY',
      sourceName: primarySource?.name || 'Origem da descoberta',
      sourceUrl: primarySource?.url || null,
      query: primarySource?.subjectName || payload.cnpj,
      identifier: processNumber,
      excerpt: primarySource?.excerpt || 'Número CNJ identificado em fonte auxiliar.',
      confidence: discovery.status === 'validated' || discovery.status === 'enriched' ? 85 : 55,
      retrievedAt: primarySource?.consultedAt ? safeDate(primarySource.consultedAt) : new Date(),
    });
    builder.addFinding({
      entityKey: sourceKey,
      relationshipKey,
      axis: 'PROCESS_DISCOVERY',
      status: 'INCONCLUSIVE',
      severity: 'LOW',
      title: 'Ocorrência processual potencialmente relacionada',
      explanation: 'O número processual foi identificado, mas o papel e a identidade da parte ainda precisam ser confirmados. Processo não significa crime ou condenação.',
      confidence: discovery.status === 'validated' || discovery.status === 'enriched' ? 85 : 55,
    });
  }
}

function adaptOfficialGazettes(builder, companyKey, payload) {
  const gazettes = payload.officialGazettes;
  const results = Array.isArray(gazettes?.results) ? gazettes.results : [];
  const available = gazettes?.ok === true;
  builder.addCoverage({
    axis: 'DIARIOS_OFICIAIS',
    provider: 'QUERIDO_DIARIO',
    status: available ? 'CONSULTED' : 'UNAVAILABLE',
    message: available
      ? `${gazettes.totalFound || results.length} edição(ões) municipal(is) corresponderam à busca exata; ${results.length} amostra(s) foram estruturadas. A cobertura não inclui todos os municípios, DOU ou DOE.`
      : (gazettes?.erro || 'A API pública do Querido Diário não pôde ser consultada.'),
    resultCount: available ? (gazettes.totalFound || results.length) : 0,
    consultedAt: gazettes?.consultadoEm ? safeDate(gazettes.consultadoEm) : null,
  });
  if (!available) return;

  for (const item of results) {
    const documentKey = `document:gazette:${stableHash(item.url || item.id)}`;
    const name = `Diário Oficial de ${item.territoryName || 'município não informado'}${item.stateCode ? `/${item.stateCode}` : ''} — ${item.date || 'data não informada'}`;
    const confidence = item.matchStrength === 'high' ? 95 : item.matchStrength === 'medium' ? 75 : 55;
    builder.addEntity({
      key: documentKey,
      type: 'Document',
      name,
      normalizedName: normalizeName(name),
      role: 'official_gazette_mention',
      depth: 1,
      confidence,
      properties: { url: item.url || null, date: item.date || null, territory: item.territoryName || null, state: item.stateCode || null, edition: item.edition || null },
    });
    const relationshipKey = builder.addRelationship({
      sourceKey: companyKey,
      targetKey: documentKey,
      type: 'MENTIONED_IN_OFFICIAL_GAZETTE',
      label: 'Mencionada em Diário Oficial municipal',
      status: 'CONFIRMED',
      confidence,
      properties: { provider: 'QUERIDO_DIARIO' },
    });
    builder.addEvidence({
      entityKey: documentKey,
      relationshipKey,
      provider: 'QUERIDO_DIARIO',
      sourceName: `Querido Diário — ${item.territoryName || 'Município'}`,
      sourceUrl: item.url || null,
      query: gazettes.query || payload.razaoSocial,
      identifier: item.id || item.url,
      excerpt: item.excerpts?.[0] || 'Menção localizada no Diário Oficial municipal.',
      confidence,
      retrievedAt: gazettes.consultadoEm ? safeDate(gazettes.consultadoEm) : new Date(),
    });
  }
  if (results.length > 0) builder.addInsight(`${gazettes.totalFound || results.length} edição(ões) de Diários Oficiais municipais mencionam a entidade; a menção é documental e não indica irregularidade.`);
}

function publicOrganizationKey({ cnpj, code, name }) {
  const digits = String(cnpj || '').replace(/\D/g, '');
  if (code) return `organization:siafi:${String(code).trim()}`;
  if (digits) return `organization:cnpj:${digits}`;
  return `organization:public:${stableHash(normalizeName(name))}`;
}

function addPublicOrganization(builder, organization, provider) {
  const key = publicOrganizationKey(organization);
  const identifiers = [];
  const cnpj = String(organization.cnpj || '').replace(/\D/g, '');
  if (cnpj) identifiers.push({ type: 'CNPJ', value: cnpj, provider, confidence: 100 });
  if (organization.code) identifiers.push({ type: 'SIAFI', value: String(organization.code), provider, confidence: 100 });
  builder.addEntity({
    key,
    type: 'Organization',
    name: organization.name || 'Órgão público não informado',
    normalizedName: normalizeName(organization.name),
    role: 'public_contracting_body',
    depth: 1,
    confidence: 100,
    properties: {
      publicOrganization: true,
      provider,
      parentOrganization: organization.parent || null,
    },
    identifiers,
  });
  return key;
}

function addPublicContract(builder, companyKey, contract, provider, retrievedAt, query) {
  const organizationKey = addPublicOrganization(builder, {
    cnpj: contract.orgaoCnpj,
    code: contract.orgaoVinculadoCodigo || contract.orgaoCodigo,
    name: contract.orgaoVinculado || contract.orgao,
    parent: contract.orgaoSuperior,
  }, provider);
  const identifier = contract.numeroControlePncp || contract.id || contract.numeroContrato
    || stableHash(contract.orgao, contract.objeto, contract.dataAssinatura);
  const value = Number(contract.valorGlobal ?? contract.valorFinal ?? contract.valorInicial) || 0;
  const relationshipKey = builder.addRelationship({
    key: `rel:public-contract:${stableHash(provider, identifier, companyKey, organizationKey)}`,
    sourceKey: companyKey,
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
    },
  });
  builder.addEvidence({
    relationshipKey,
    provider,
    sourceName: provider === 'PNCP' ? 'Portal Nacional de Contratações Públicas' : 'Portal da Transparência do Governo Federal',
    sourceUrl: contract.url || null,
    query,
    identifier: String(identifier),
    excerpt: `${contract.numeroContrato ? `Contrato ${contract.numeroContrato}. ` : ''}${contract.objeto || 'Objeto não informado.'}${value ? ` Valor: R$ ${value.toFixed(2)}.` : ''}`,
    confidence: 100,
    retrievedAt,
  });
}

function adaptPublicContracts(builder, context, payload) {
  const pncp = payload.pncp;
  const pncpContracts = Array.isArray(pncp?.contratos) ? pncp.contratos : [];
  builder.addCoverage({
    axis: 'PUBLIC_CONTRACTS',
    provider: 'PNCP',
    status: pncp?.ok ? (pncp.consultaParcial ? 'PARTIAL' : 'CONSULTED') : 'UNAVAILABLE',
    message: pncp?.ok
      ? `${pncpContracts.length} contrato(s) do PNCP foram confirmados pelo CNPJ do fornecedor.`
      : (pncp?.erro || 'O PNCP não foi consultado nesta diligência.'),
    resultCount: pncpContracts.length,
    consultedAt: pncp?.consultadoEm ? safeDate(pncp.consultadoEm) : null,
  });
  for (const contract of pncpContracts) {
    addPublicContract(
      builder,
      context.companyKey,
      contract,
      'PNCP',
      pncp?.consultadoEm ? safeDate(pncp.consultadoEm) : new Date(),
      payload.cnpj,
    );
  }

  const federal = payload.federalExposure;
  const federalContracts = Array.isArray(federal?.contratos)
    ? federal.contratos.filter((contract) => contract.cnpjConfirmado !== false)
    : [];
  builder.addCoverage({
    axis: 'PUBLIC_CONTRACTS',
    provider: 'CGU_FEDERAL_CONTRACTS',
    status: federal?.ok ? (federal.consultaParcial ? 'PARTIAL' : 'CONSULTED') : 'UNAVAILABLE',
    message: federal?.ok
      ? `${federalContracts.length} contrato(s) do Executivo Federal foram confirmados diretamente pelo CNPJ.`
      : (federal?.erro || 'Os contratos do Executivo Federal não foram consultados nesta diligência.'),
    resultCount: federalContracts.length,
    consultedAt: federal?.consultadoEm ? safeDate(federal.consultadoEm) : null,
  });
  for (const contract of federalContracts) {
    addPublicContract(
      builder,
      context.companyKey,
      contract,
      'CGU_FEDERAL_CONTRACTS',
      federal?.consultadoEm ? safeDate(federal.consultadoEm) : new Date(),
      payload.cnpj,
    );
  }

  const resourceAgencies = Array.isArray(federal?.recursos?.orgaos) ? federal.recursos.orgaos : [];
  builder.addCoverage({
    axis: 'PUBLIC_PAYMENTS',
    provider: 'CGU_FEDERAL_RESOURCES',
    status: federal?.ok ? (federal.consultaParcial ? 'PARTIAL' : 'CONSULTED') : 'UNAVAILABLE',
    message: federal?.ok
      ? `${federal?.recursos?.quantidadeRegistros || 0} registro(s) de pagamento foram agregados em ${resourceAgencies.length} órgão(s) federais.`
      : (federal?.erro || 'Os pagamentos do Executivo Federal não foram consultados nesta diligência.'),
    resultCount: federal?.recursos?.quantidadeRegistros || 0,
    consultedAt: federal?.consultadoEm ? safeDate(federal.consultadoEm) : null,
  });
  for (const agency of resourceAgencies) {
    const organizationKey = addPublicOrganization(builder, {
      code: agency.codigo,
      name: agency.nome,
      parent: agency.orgaoSuperior,
    }, 'CGU_FEDERAL_RESOURCES');
    const relationshipKey = builder.addRelationship({
      key: `rel:public-payment:${stableHash(context.companyKey, organizationKey, federal?.recursos?.periodoInicio, federal?.recursos?.periodoFim)}`,
      sourceKey: context.companyKey,
      targetKey: organizationKey,
      type: 'RECEIVED_PUBLIC_RESOURCES_FROM',
      label: 'Recebeu recursos de',
      status: 'CONFIRMED',
      confidence: 100,
      properties: {
        provider: 'CGU_FEDERAL_RESOURCES',
        value: Number(agency.valorTotal) || 0,
        periodStart: federal?.recursos?.periodoInicio || null,
        periodEnd: federal?.recursos?.periodoFim || null,
        sourceUrl: federal?.sourceUrl || null,
      },
    });
    builder.addEvidence({
      relationshipKey,
      provider: 'CGU_FEDERAL_RESOURCES',
      sourceName: 'Portal da Transparência do Governo Federal',
      sourceUrl: federal?.sourceUrl || null,
      query: payload.cnpj,
      identifier: agency.codigo || agency.nome,
      excerpt: `Pagamentos agregados no período consultado: R$ ${(Number(agency.valorTotal) || 0).toFixed(2)}.`,
      confidence: 100,
      retrievedAt: federal?.consultadoEm ? safeDate(federal.consultadoEm) : new Date(),
    });
  }

  const totalContracts = pncpContracts.length + federalContracts.length;
  if (totalContracts || resourceAgencies.length) {
    builder.addInsight(`${totalContracts} contrato(s) e ${resourceAgencies.length} vínculo(s) de pagamento público foram materializados como relações oficiais.`);
  }
}

function adaptCorporateNetwork(builder, context, payload) {
  const companyKey = context.companyKey;
  const network = payload.corporateNetwork;
  const companies = Array.isArray(network?.companies) ? network.companies : [];
  const relationships = Array.isArray(network?.relationships) ? network.relationships : [];
  const personExpansion = network?.personExpansion;
  const personMemberships = Array.isArray(personExpansion?.memberships) ? personExpansion.memberships : [];
  const relatedPersonMemberships = personMemberships.filter((item) => !item.isRootCompany);
  const available = network?.ok === true;
  builder.addCoverage({
    axis: 'CORPORATE_EXPANSION',
    provider: 'CORPORATE_NETWORK',
    status: !available ? 'UNAVAILABLE' : network.consultaParcial ? 'PARTIAL' : companies.length > 0 ? 'CONSULTED' : 'NOT_APPLICABLE',
    message: !available
      ? (network?.erro || 'A expansão societária não pôde ser executada.')
      : companies.length > 0 || relatedPersonMemberships.length > 0
        ? `${companies.length} empresa(s), ${relationships.length} vínculo(s) entre CNPJs e ${relatedPersonMemberships.length} vínculo(s) por pessoa foram estruturados até o nível ${network.maxDepth || 2}.`
        : 'O QSA consultado não contém empresa com CNPJ completo para expansão automática.',
    resultCount: relationships.length + relatedPersonMemberships.length,
    consultedAt: network?.consultadoEm ? safeDate(network.consultadoEm) : null,
  });

  builder.addCoverage({
    axis: 'PERSON_CORPORATE_LINKS',
    provider: 'MINHA_RECEITA_GRAPH',
    status: !personExpansion
      ? 'NOT_CONSULTED'
      : !personExpansion.ok
        ? 'UNAVAILABLE'
        : personExpansion.consultaParcial
          ? 'PARTIAL'
          : (personExpansion.people?.length || 0) > 0
            ? 'CONSULTED'
            : 'NOT_APPLICABLE',
    message: !personExpansion
      ? 'O grafo societário por pessoa não fazia parte desta diligência.'
      : !personExpansion.ok
        ? (personExpansion.erro || 'O grafo público do Minha Receita não pôde ser consultado.')
        : `${personExpansion.peopleExpanded || 0} pessoa(s) foram expandidas por nome e CPF mascarado; ${relatedPersonMemberships.length} vínculo(s) com outras empresas foram localizados. A identidade exige validação humana.`,
    resultCount: relatedPersonMemberships.length,
    consultedAt: personExpansion?.consultadoEm ? safeDate(personExpansion.consultadoEm) : null,
  });

  if (!available) return;

  for (const item of companies) {
    const company = item.company || {};
    const cnpj = String(item.cnpj || company.cnpj || '').replace(/\D/g, '');
    if (cnpj.length !== 14) continue;
    const relatedKey = `company:cnpj:${cnpj}`;
    builder.addEntity({
      key: relatedKey,
      type: 'Company',
      name: company.razao_social || `Empresa ${cnpj}`,
      normalizedName: normalizeName(company.razao_social || ''),
      role: 'related_company',
      depth: item.depth || 2,
      confidence: 100,
      properties: { cnpj, tradeName: company.nome_fantasia || null, registrationStatus: company.descricao_situacao_cadastral || null, municipality: company.municipio || null, state: company.uf || null },
      identifiers: [{ type: 'CNPJ', value: cnpj, provider: item.source || network.provider || 'CORPORATE_NETWORK', confidence: 100 }],
    });
  }

  for (const relationship of relationships) {
    const sourceCnpj = String(relationship.sourceCnpj || '').replace(/\D/g, '');
    const targetCnpj = String(relationship.targetCnpj || '').replace(/\D/g, '');
    const sourceKey = `company:cnpj:${sourceCnpj}`;
    const targetKey = targetCnpj === String(payload.cnpj || '').replace(/\D/g, '') ? companyKey : `company:cnpj:${targetCnpj}`;
    if (!builder.entities.has(sourceKey) || !builder.entities.has(targetKey)) continue;
    const relationshipKey = builder.addRelationship({
      sourceKey,
      targetKey,
      type: 'SHAREHOLDER_OF',
      label: 'Integra o quadro societário',
      status: 'CONFIRMED',
      confidence: 100,
      properties: { qualification: relationship.qualification || null, joinedAt: relationship.joinedAt || null, provider: relationship.provider || network.provider },
    });
    builder.addEvidence({
      relationshipKey,
      provider: 'CORPORATE_NETWORK',
      sourceName: relationship.provider || network.provider || 'Fonte cadastral pública',
      query: targetCnpj,
      identifier: sourceCnpj,
      excerpt: `O CNPJ ${sourceCnpj} consta no QSA do CNPJ ${targetCnpj} como “${relationship.qualification || 'integrante'}”.`,
      confidence: 100,
      retrievedAt: relationship.consultedAt ? safeDate(relationship.consultedAt) : new Date(),
    });
  }

  const personKeyByGraphId = new Map();
  for (const person of Array.isArray(personExpansion?.people) ? personExpansion.people : []) {
    if (!person?.id || !person?.name) continue;
    const normalizedPersonName = normalizeName(person.name);
    const existingKey = context.shareholderKeys.get(normalizedPersonName);
    const personKey = existingKey || `person:minha-receita:${person.id}`;
    const current = builder.entities.get(personKey);
    builder.addEntity({
      key: personKey,
      type: 'Person',
      name: person.name,
      normalizedName: normalizedPersonName,
      role: current?.role || 'qsa_member_graph',
      depth: current?.depth ?? 1,
      confidence: Math.max(current?.confidence || 0, person.maskedCpf ? 85 : 70),
      properties: {
        graphSource: 'Minha Receita — dados abertos da RFB',
        graphId: person.id,
        maskedCpf: person.maskedCpf || null,
        identityBasis: person.maskedCpf ? 'Nome exato + CPF mascarado' : 'Nome exato',
        identityConfirmed: false,
      },
      identifiers: [
        ...(person.maskedCpf ? [{ type: 'MASKED_CPF', value: person.maskedCpf, provider: 'MINHA_RECEITA_GRAPH', confidence: 65 }] : []),
        { type: 'MINHA_RECEITA_GRAPH_ID', value: person.id, provider: 'MINHA_RECEITA_GRAPH', confidence: 85 },
      ],
    });
    personKeyByGraphId.set(person.id, personKey);
  }

  let personLinksAdded = 0;
  for (const membership of personMemberships) {
    const personKey = personKeyByGraphId.get(membership.personId)
      || context.shareholderKeys.get(normalizeName(membership.personName));
    if (!personKey) continue;
    const companyCnpj = String(membership.companyCnpj || '').replace(/\D/g, '');
    if (companyCnpj.length !== 14) continue;
    const targetKey = membership.isRootCompany ? companyKey : `company:cnpj:${companyCnpj}`;

    if (!builder.entities.has(targetKey)) {
      builder.addEntity({
        key: targetKey,
        type: 'Company',
        name: membership.companyName || `Empresa ${companyCnpj}`,
        normalizedName: normalizeName(membership.companyName || ''),
        role: 'person_related_company',
        depth: membership.depth || 2,
        confidence: membership.confidence || 85,
        properties: { cnpj: companyCnpj, source: personExpansion.provider },
        identifiers: [{ type: 'CNPJ', value: companyCnpj, provider: 'MINHA_RECEITA_GRAPH', confidence: 100 }],
      });
    }

    const alreadyLinked = [...builder.relationships.values()].some((relationship) => (
      (relationship.sourceKey === personKey && relationship.targetKey === targetKey)
      || (relationship.sourceKey === targetKey && relationship.targetKey === personKey)
    ));
    if (membership.isRootCompany && alreadyLinked) continue;

    const relationshipKey = builder.addRelationship({
      key: `rel:minha-receita-qsa:${stableHash(membership.personId, companyCnpj)}`,
      sourceKey: personKey,
      targetKey,
      type: 'QSA_MEMBER_OF',
      label: 'Consta no QSA público',
      status: 'PROBABLE',
      confidence: membership.confidence || 85,
      properties: {
        provider: 'MINHA_RECEITA_GRAPH',
        maskedCpf: membership.maskedCpf || null,
        matchBasis: membership.matchBasis || 'EXACT_NAME_AND_MASKED_CPF_HASH',
        requiresHumanReview: true,
        identityConfirmed: false,
        disclaimer: 'O elo usa nome e CPF mascarado; valide a identidade antes de concluir que se trata da mesma pessoa.',
      },
    });
    builder.addEvidence({
      relationshipKey,
      provider: 'MINHA_RECEITA_GRAPH',
      sourceName: personExpansion.provider || 'Minha Receita — grafo societário (dados RFB)',
      sourceUrl: membership.sourceUrl || null,
      query: payload.cnpj,
      identifier: membership.maskedCpf || membership.personId,
      excerpt: `${membership.personName} aparece no quadro societário de ${membership.companyName} com o mesmo identificador derivado de nome${membership.maskedCpf ? ` e CPF mascarado ${membership.maskedCpf}` : ''}. A correspondência exige validação humana.`,
      confidence: membership.confidence || 85,
      retrievedAt: personExpansion.consultadoEm ? safeDate(personExpansion.consultadoEm) : new Date(),
    });
    if (!membership.isRootCompany) personLinksAdded += 1;
  }

  if (companies.length > 0) {
    builder.addInsight(`${companies.length} empresa(s) adicional(is) foram alcançadas pela expansão societária controlada.`);
  }
  if (personLinksAdded > 0) {
    builder.addInsight(`${personLinksAdded} vínculo(s) adicional(is) foram encontrados pelo mesmo nome e CPF mascarado em outros quadros societários.`);
  }
}

function adaptFundNetwork(builder, context, payload) {
  const network = payload.fundNetwork;
  if (!network) {
    builder.addCoverage({
      axis: 'FUND_RELATIONSHIPS',
      provider: 'CVM_FUND_REGISTRY',
      status: 'NOT_CONSULTED',
      message: 'O cadastro regulatório de fundos da CVM não foi consultado nesta diligência.',
      resultCount: 0,
      consultedAt: null,
    });
    return;
  }

  if (!network.applicable) {
    builder.addCoverage({
      axis: 'FUND_RELATIONSHIPS',
      provider: 'CVM_FUND_REGISTRY',
      status: 'NOT_APPLICABLE',
      message: network.aviso || 'O CNPJ não consta como fundo ou classe no cadastro público atual da CVM.',
      resultCount: 0,
      consultedAt: network.consultadoEm ? safeDate(network.consultadoEm) : null,
    });
    return;
  }

  const available = network.ok === true;
  const entities = Array.isArray(network.entities) ? network.entities : [];
  const relationships = Array.isArray(network.relationships) ? network.relationships : [];
  const evidences = Array.isArray(network.evidences) ? network.evidences : [];
  builder.addCoverage({
    axis: 'FUND_RELATIONSHIPS',
    provider: 'CVM_FUND_REGISTRY',
    status: !available ? 'UNAVAILABLE' : network.consultaParcial ? 'PARTIAL' : 'CONSULTED',
    message: !available
      ? (network.erro || 'O cadastro regulatório de fundos da CVM não pôde ser consultado.')
      : `${network.directParties || 0} vínculo(s) regulatório(s) direto(s) e ${network.expandedCompanies || 0} QSA(s) de prestadores foram estruturados sem confundir prestação de serviço com participação societária.`,
    resultCount: relationships.length,
    consultedAt: network.consultadoEm ? safeDate(network.consultadoEm) : null,
  });
  if (!available) return;

  for (const entity of entities) {
    if (!entity?.key || !entity?.name) continue;
    builder.addEntity({
      key: entity.key === `company:cnpj:${String(payload.cnpj || '').replace(/\D/g, '')}`
        ? context.companyKey
        : entity.key,
      type: entity.type || 'Company',
      name: entity.name,
      normalizedName: normalizeName(entity.name),
      role: entity.role || 'fund_related_entity',
      depth: entity.depth ?? 1,
      confidence: entity.confidence ?? 100,
      properties: entity.properties || {},
      identifiers: Array.isArray(entity.identifiers) ? entity.identifiers : [],
    });
  }

  const rootKey = `company:cnpj:${String(payload.cnpj || '').replace(/\D/g, '')}`;
  const canonicalKey = (key) => key === rootKey ? context.companyKey : key;
  for (const relationship of relationships) {
    const sourceKey = canonicalKey(relationship.sourceKey);
    const targetKey = canonicalKey(relationship.targetKey);
    if (!builder.entities.has(sourceKey) || !builder.entities.has(targetKey)) continue;
    builder.addRelationship({
      key: relationship.key,
      sourceKey,
      targetKey,
      type: relationship.type,
      label: relationship.label,
      status: relationship.status || 'CONFIRMED',
      confidence: relationship.confidence ?? 100,
      properties: relationship.properties || {},
    });
  }

  for (const evidence of evidences) {
    const entityKey = evidence.entityKey ? canonicalKey(evidence.entityKey) : undefined;
    const relationshipKey = evidence.relationshipKey;
    if (entityKey && !builder.entities.has(entityKey)) continue;
    if (relationshipKey && !builder.relationships.has(relationshipKey)) continue;
    builder.addEvidence({
      entityKey,
      relationshipKey,
      provider: evidence.provider || 'CVM_FUND_REGISTRY',
      sourceName: evidence.sourceName || network.provider || 'CVM — Cadastro de Fundos',
      sourceUrl: evidence.sourceUrl || network.sourceUrl || null,
      query: evidence.query || payload.cnpj,
      identifier: evidence.identifier || null,
      excerpt: evidence.excerpt || null,
      confidence: evidence.confidence ?? 100,
      retrievedAt: evidence.retrievedAt ? safeDate(evidence.retrievedAt) : new Date(),
    });
  }

  builder.addInsight(`${network.directParties || 0} vínculo(s) regulatório(s) direto(s) do fundo foram conectados a ${network.expandedCompanies || 0} quadro(s) societário(s) relacionado(s).`);
}

function adaptOffshore(builder, context, payload) {
  const offshore = payload.offshore;
  const candidates = Array.isArray(offshore?.candidates) ? offshore.candidates : [];
  const available = offshore?.ok === true;
  builder.addCoverage({
    axis: 'OFFSHORE',
    provider: 'ICIJ_OFFSHORE',
    status: available ? 'CONSULTED' : 'UNAVAILABLE',
    message: available
      ? `${offshore.totalQueries || 0} nome(s) foram reconciliados na base ICIJ; ${candidates.length} hipótese(s) forte(s) exigem revisão. A presença na base não implica ilegalidade.`
      : (offshore?.erro || 'A API de reconciliação do ICIJ não pôde ser consultada.'),
    resultCount: candidates.length,
    consultedAt: offshore?.consultadoEm ? safeDate(offshore.consultadoEm) : null,
  });
  if (!available) return;

  for (const candidate of candidates) {
    const sourceKey = candidate.sourceType === 'company'
      ? context.companyKey
      : context.shareholderKeys.get(normalizeName(candidate.sourceName));
    if (!sourceKey) continue;
    const type = candidate.offshoreType === 'Officer' ? 'Person' : candidate.offshoreType === 'Entity' ? 'Company' : 'OffshoreEntity';
    const candidateKey = `${type.toLowerCase()}:icij:${candidate.id}`;
    builder.addEntity({
      key: candidateKey,
      type,
      name: candidate.name,
      normalizedName: normalizeName(candidate.name),
      role: 'offshore_candidate',
      depth: 2,
      confidence: candidate.confidence,
      properties: { icijId: candidate.id, offshoreType: candidate.offshoreType, description: candidate.description, historicalDataset: true },
      identifiers: [{ type: 'ICIJ_NODE_ID', value: candidate.id, provider: 'ICIJ_OFFSHORE', confidence: 100 }],
    });
    const relationshipKey = builder.addRelationship({
      sourceKey,
      targetKey: candidateKey,
      type: 'POSSIBLE_OFFSHORE_MATCH',
      label: 'Possível correspondência na Offshore Leaks',
      status: 'CANDIDATE',
      confidence: candidate.confidence,
      properties: { requiresHumanReview: true, provider: 'ICIJ_OFFSHORE' },
    });
    builder.addEvidence({
      entityKey: candidateKey,
      relationshipKey,
      provider: 'ICIJ_OFFSHORE',
      sourceName: 'ICIJ Offshore Leaks Database',
      sourceUrl: candidate.url,
      query: candidate.sourceName,
      identifier: candidate.id,
      excerpt: `${candidate.description} Correspondência apenas nominal; presença offshore não implica ilegalidade.`,
      confidence: candidate.confidence,
      retrievedAt: offshore.consultadoEm ? safeDate(offshore.consultadoEm) : new Date(),
    });
    builder.addFinding({
      entityKey: sourceKey,
      relationshipKey,
      axis: 'OFFSHORE',
      status: 'INCONCLUSIVE',
      severity: 'LOW',
      title: 'Possível correspondência nominal em base offshore',
      explanation: `O ICIJ retornou um candidato com ${candidate.confidence}% de confiança nominal. Isso não confirma identidade, irregularidade ou conflito e exige validação humana.`,
      confidence: candidate.confidence,
    });
  }
  builder.addInsight(candidates.length > 0
    ? `${candidates.length} hipótese(s) nominal(is) da Offshore Leaks requerem validação de identidade e contexto.`
    : 'Nenhuma correspondência nominal forte foi localizada na base Offshore Leaks do ICIJ.');
}

function adaptExternalResults(builder, context, payload) {
  adaptMedia(builder, context, payload);
  adaptProcesses(builder, context, payload);
  adaptOfficialGazettes(builder, context.companyKey, payload);
  adaptPublicContracts(builder, context, payload);
  adaptCorporateNetwork(builder, context, payload);
  adaptFundNetwork(builder, context, payload);
  adaptOffshore(builder, context, payload);
}

module.exports = { adaptExternalResults };
