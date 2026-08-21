const { normalizeName, stableHash, safeDate } = require('../domain/normalization');

function adaptMedia(builder, companyKey, payload) {
  const media = payload.adverseMedia;
  const results = Array.isArray(media?.results) ? media.results : [];
  const unavailable = !media || media.semChave || media.ok === false;
  builder.addCoverage({
    axis: 'MEDIA',
    provider: 'MEDIA_SEARCH',
    status: unavailable ? 'UNAVAILABLE' : media.consultaParcial ? 'PARTIAL' : 'CONSULTED',
    message: unavailable
      ? (media?.aviso || 'A busca de mídia não está configurada ou não respondeu.')
      : results.length > 0
        ? `${results.length} resultado(s) público(s) foram correlacionados e deduplicados.`
        : 'Nenhuma ocorrência localizada nas consultas de mídia executadas.',
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
      title: 'Nenhuma ocorrência de mídia localizada',
      explanation: 'As consultas configuradas foram executadas e não retornaram conteúdo correlacionado.',
      confidence: 100,
    });
    return;
  }

  for (const item of results) {
    const documentKey = `document:web:${stableHash(item.url || item.title)}`;
    builder.addEntity({
      key: documentKey,
      type: 'Document',
      name: item.title || 'Publicação na web',
      normalizedName: normalizeName(item.title),
      role: 'media_mention',
      depth: 1,
      confidence: item.matchStrength === 'high' ? 85 : item.matchStrength === 'medium' ? 65 : 40,
      properties: {
        url: item.url || null,
        domain: item.domain || null,
        publishedAt: item.publishedAt || null,
        categories: item.categories || [],
        matchStrength: item.matchStrength || 'low',
      },
    });
    const relationshipKey = builder.addRelationship({
      sourceKey: companyKey,
      targetKey: documentKey,
      type: 'MENTIONED_IN',
      label: 'Mencionada em publicação',
      status: 'CANDIDATE',
      confidence: item.matchStrength === 'high' ? 85 : item.matchStrength === 'medium' ? 65 : 40,
      properties: { queriesMatched: item.queriesMatched || [], provider: 'MEDIA_SEARCH' },
    });
    builder.addEvidence({
      entityKey: documentKey,
      relationshipKey,
      provider: 'MEDIA_SEARCH',
      sourceName: item.domain || 'Publicação na web',
      sourceUrl: item.url || null,
      query: (item.queriesMatched || []).join(' | ') || payload.razaoSocial,
      identifier: item.url || item.title,
      excerpt: item.snippet || null,
      confidence: item.matchStrength === 'high' ? 85 : item.matchStrength === 'medium' ? 65 : 40,
      retrievedAt: item.searchedAt ? safeDate(item.searchedAt) : new Date(),
    });
    if (item.matchStrength === 'high' || item.matchStrength === 'medium') {
      builder.addFinding({
        entityKey: companyKey,
        relationshipKey,
        axis: 'MEDIA',
        status: item.matchStrength === 'high' ? 'REVIEW' : 'INCONCLUSIVE',
        severity: item.matchStrength === 'high' ? 'MEDIUM' : 'LOW',
        title: 'Publicação potencialmente relevante',
        explanation: 'A correlação indica que o conteúdo merece leitura humana. A menção não comprova irregularidade.',
        confidence: item.matchStrength === 'high' ? 85 : 65,
      });
    }
  }
}

function adaptProcesses(builder, companyKey, payload) {
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
      sourceKey: companyKey,
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
      query: payload.cnpj,
      identifier: processNumber,
      excerpt: primarySource?.excerpt || 'Número CNJ identificado em fonte auxiliar.',
      confidence: discovery.status === 'validated' || discovery.status === 'enriched' ? 85 : 55,
      retrievedAt: primarySource?.consultedAt ? safeDate(primarySource.consultedAt) : new Date(),
    });
    builder.addFinding({
      entityKey: companyKey,
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

function adaptCorporateNetwork(builder, companyKey, payload) {
  const network = payload.corporateNetwork;
  const companies = Array.isArray(network?.companies) ? network.companies : [];
  const relationships = Array.isArray(network?.relationships) ? network.relationships : [];
  const available = network?.ok === true;
  builder.addCoverage({
    axis: 'CORPORATE_EXPANSION',
    provider: 'CORPORATE_NETWORK',
    status: !available ? 'UNAVAILABLE' : network.consultaParcial ? 'PARTIAL' : companies.length > 0 ? 'CONSULTED' : 'NOT_APPLICABLE',
    message: !available
      ? (network?.erro || 'A expansão societária não pôde ser executada.')
      : companies.length > 0
        ? `${companies.length} empresa(s) e ${relationships.length} vínculo(s) adicionais foram estruturados até o nível ${network.maxDepth || 2}.`
        : 'O QSA consultado não contém empresa com CNPJ completo para expansão automática.',
    resultCount: companies.length,
    consultedAt: network?.consultadoEm ? safeDate(network.consultadoEm) : null,
  });
  if (!available || companies.length === 0) return;

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
  builder.addInsight(`${companies.length} empresa(s) adicional(is) foram alcançadas pela expansão societária controlada.`);
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
  adaptMedia(builder, context.companyKey, payload);
  adaptProcesses(builder, context.companyKey, payload);
  adaptOfficialGazettes(builder, context.companyKey, payload);
  adaptCorporateNetwork(builder, context.companyKey, payload);
  adaptOffshore(builder, context, payload);
}

module.exports = { adaptExternalResults };
