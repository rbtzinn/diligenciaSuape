const { normalizeName, normalizeIdentifier, stableHash, safeDate } = require('../domain/normalization');
const { comparePerson } = require('../entity-resolution/entity-resolution.service');

function coverageStatus(result) {
  if (!result || result.semChave || result.ok === false) return 'UNAVAILABLE';
  if (result.consultaParcial) return 'PARTIAL';
  return 'CONSULTED';
}

function adaptSanctions(builder, companyKey, cnpj, axis, result) {
  const provider = `CGU_${axis}`;
  const sourceName = result?.fonte || `Portal da Transparência (CGU / ${axis})`;
  const consultedAt = result?.consultadoEm ? safeDate(result.consultadoEm) : null;
  const records = Array.isArray(result?.registros) ? result.registros : [];
  const status = coverageStatus(result);

  builder.addCoverage({
    axis,
    provider,
    status,
    message: status === 'UNAVAILABLE'
      ? (result?.aviso || result?.erro || 'A fonte não pôde ser consultada.')
      : status === 'PARTIAL'
        ? 'Consulta parcial: a fonte indicou que podem existir registros adicionais.'
        : records.length > 0
          ? `${records.length} registro(s) retornado(s) pela fonte oficial.`
          : 'Nenhuma ocorrência localizada na fonte efetivamente consultada.',
    resultCount: records.length,
    consultedAt,
  });

  if (status === 'UNAVAILABLE') return;
  if (records.length === 0) {
    builder.addFinding({
      entityKey: companyKey,
      axis,
      status: 'OK',
      severity: 'INFORMATIONAL',
      title: `Nenhuma ocorrência ${axis} localizada`,
      explanation: 'A fonte oficial foi consultada e não retornou registro para o CNPJ pesquisado.',
      confidence: 100,
    });
    return;
  }

  for (const record of records) {
    const recordKey = record.id || stableHash(axis, record.processo, record.orgao, record.inicio, record.sancao);
    const sanctionKey = `sanction:${axis.toLowerCase()}:${recordKey}`;
    builder.addEntity({
      key: sanctionKey,
      type: 'Sanction',
      name: record.sancao || `Registro ${axis}`,
      normalizedName: normalizeName(record.sancao || `Registro ${axis}`),
      role: 'sanction',
      depth: 1,
      confidence: 100,
      properties: {
        source: axis,
        authority: record.orgao || null,
        state: record.uf || null,
        startsAt: record.inicio || null,
        endsAt: record.fim || null,
        active: record.vigente !== false,
        processNumber: record.processo || null,
        legalBasis: record.fundamentacao || null,
      },
    });
    const relationshipKey = builder.addRelationship({
      sourceKey: companyKey,
      targetKey: sanctionKey,
      type: 'SANCTIONED_IN',
      label: `Possui registro no ${axis}`,
      status: 'CONFIRMED',
      confidence: 100,
      properties: { active: record.vigente !== false, provider: sourceName },
    });
    builder.addEvidence({
      entityKey: sanctionKey,
      relationshipKey,
      provider,
      sourceName,
      sourceUrl: 'https://portaldatransparencia.gov.br/sancoes',
      query: cnpj,
      identifier: String(record.id || record.processo || cnpj),
      excerpt: `${record.sancao || 'Sanção'} — órgão: ${record.orgao || 'não informado'}; período: ${record.inicio || 'não informado'} a ${record.fim || 'não informado'}.`,
      confidence: 100,
      rawReference: { id: record.id || null, processNumber: record.processo || null },
      retrievedAt: consultedAt || new Date(),
    });
    builder.addFinding({
      entityKey: companyKey,
      relationshipKey,
      axis,
      status: record.vigente !== false ? 'REVIEW' : 'OK',
      severity: record.vigente !== false ? 'HIGH' : 'INFORMATIONAL',
      title: record.vigente !== false ? `Sanção ${axis} vigente` : `Registro ${axis} histórico`,
      explanation: record.vigente !== false
        ? 'A fonte oficial indica vigência ativa. O impedimento e sua abrangência devem ser revisados antes da decisão.'
        : 'O registro é histórico ou encerrado e não foi tratado automaticamente como impedimento atual.',
      confidence: 100,
    });
  }
}

function adaptPep(builder, shareholderKeys, pepResults) {
  const results = Array.isArray(pepResults) ? pepResults : [];
  if (shareholderKeys.size === 0) {
    builder.addCoverage({
      axis: 'PEP',
      provider: 'CGU_PEP',
      status: 'NOT_APPLICABLE',
      message: 'Não há integrantes do QSA disponíveis para consulta nominal.',
      resultCount: 0,
    });
    return;
  }

  const unavailable = results.filter((item) => item.semChave || item.ok === false).length;
  const partial = results.filter((item) => item.consultaParcial).length;
  const recordsCount = results.reduce((total, item) => total + (item.registros?.length || 0), 0);
  const status = results.length === 0 || unavailable === results.length
    ? 'UNAVAILABLE'
    : unavailable > 0 || partial > 0 ? 'PARTIAL' : 'CONSULTED';
  builder.addCoverage({
    axis: 'PEP',
    provider: 'CGU_PEP',
    status,
    message: status === 'UNAVAILABLE'
      ? 'A verificação nominal de PEP não pôde ser concluída.'
      : status === 'PARTIAL'
        ? partial > 0
          ? `${results.length - unavailable} de ${results.length} integrante(s) foram consultados, mas ao menos uma busca atingiu o limite técnico de paginação.`
          : `${results.length - unavailable} de ${results.length} integrante(s) foram consultados.`
        : recordsCount > 0
          ? `${recordsCount} candidato(s) nominal(is) exigem resolução de identidade.`
          : 'Nenhuma correspondência nominal retornada para os integrantes consultados.',
    resultCount: recordsCount,
    consultedAt: results.find((item) => item.consultadoEm)?.consultadoEm
      ? safeDate(results.find((item) => item.consultadoEm).consultadoEm)
      : null,
  });

  if (status === 'UNAVAILABLE') return;
  if (recordsCount === 0) {
    builder.addFinding({
      axis: 'PEP',
      status: 'OK',
      severity: 'INFORMATIONAL',
      title: 'Nenhuma correspondência nominal PEP localizada',
      explanation: 'Os nomes disponíveis foram consultados e não retornaram candidatos na fonte oficial.',
      confidence: 100,
    });
    return;
  }

  for (const result of results) {
    const sourceKey = shareholderKeys.get(normalizeName(result.nome));
    if (!sourceKey || !Array.isArray(result.registros)) continue;
    const sourceEntity = builder.entities.get(sourceKey);
    for (const record of result.registros) {
      const candidateName = record.nome || result.nome;
      const candidateKey = `person:cgu-pep:${stableHash(candidateName, record.cpf)}`;
      builder.addEntity({
        key: candidateKey,
        type: 'Person',
        name: candidateName,
        normalizedName: normalizeName(candidateName),
        role: 'pep_candidate',
        depth: 2,
        confidence: 100,
        properties: {
          source: 'CGU_PEP',
          searchedName: result.nome || null,
          maskedCpf: record.cpf || null,
          publicRole: record.funcao || null,
          roleAbbreviation: record.siglaFuncao || null,
          roleLevel: record.nivelFuncao || null,
          publicOrganization: record.orgao || null,
          publicOrganizationCode: record.codigoOrgao || null,
          publicServiceStart: record.inicio || null,
          publicServiceEnd: record.fim || null,
          pepCoolingOffEnd: record.carencia || null,
          identityConfirmed: false,
        },
        identifiers: record.cpf ? [{ type: 'MASKED_CPF', value: normalizeIdentifier(record.cpf), provider: 'CGU_PEP', confidence: 70 }] : [],
      });

      const resolution = comparePerson(
        { name: sourceEntity.name, maskedCpf: sourceEntity.identifiers.find((id) => id.type === 'MASKED_CPF')?.value },
        { name: candidateName, maskedCpf: record.cpf, organization: record.orgao }
      );
      builder.addResolution({
        sourceEntityKey: sourceKey,
        candidateEntityKey: candidateKey,
        score: resolution.score,
        status: resolution.status,
        signals: resolution.signals,
      });
      const identityRelationshipKey = builder.addRelationship({
        sourceKey,
        targetKey: candidateKey,
        type: 'POSSIBLE_IDENTITY_MATCH',
        label: resolution.score >= 90 ? 'Correspondência PEP muito forte' : 'Possível correspondência PEP',
        status: resolution.score >= 90 ? 'PROBABLE' : 'CANDIDATE',
        confidence: resolution.score,
        properties: {
          requiresHumanReview: true,
          identityConfirmed: false,
          provider: 'EGOS_ENTITY_RESOLUTION',
          searchedName: sourceEntity.name,
          candidateName,
          matchScore: resolution.score,
        },
      });
      builder.addEvidence({
        relationshipKey: identityRelationshipKey,
        provider: 'EGOS_ENTITY_RESOLUTION',
        sourceName: 'Cruzamento QSA × Pessoas Expostas Politicamente',
        sourceUrl: 'https://portaldatransparencia.gov.br/download-de-dados/pep',
        query: result.nome,
        identifier: stableHash(sourceKey, candidateKey),
        excerpt: `Candidato exato retornado: ${candidateName}; CPF: ${record.cpf || 'não informado'}; função: ${record.funcao || 'não informada'}; órgão: ${record.orgao || 'não informado'}; período: ${record.inicio || 'não informado'} a ${record.fim || 'não informado'}. Índice de compatibilidade ${resolution.score}/100 (${resolution.signals.map((signal) => signal.label).join('; ')}). A identidade ainda não está confirmada.`,
        confidence: resolution.score,
        rawReference: {
          candidate: {
            name: candidateName,
            maskedCpf: record.cpf || null,
            role: record.funcao || null,
            organization: record.orgao || null,
            startsAt: record.inicio || null,
            endsAt: record.fim || null,
            coolingOffEndsAt: record.carencia || null,
          },
          signals: resolution.signals.map((signal) => ({
            code: signal.code,
            label: signal.label,
            matched: signal.matched,
            weight: signal.weight,
            detail: signal.detail,
          })),
        },
        retrievedAt: result.consultadoEm ? safeDate(result.consultadoEm) : new Date(),
      });

      if (record.orgao || record.funcao) {
        const officeKey = `public-office:${stableHash(record.orgao, record.funcao)}`;
        builder.addEntity({
          key: officeKey,
          type: 'PublicOffice',
          name: [record.funcao, record.orgao].filter(Boolean).join(' — ') || 'Cargo público',
          normalizedName: normalizeName([record.funcao, record.orgao].filter(Boolean).join(' ')),
          role: 'public_office',
          depth: 3,
          confidence: 100,
          properties: { organization: record.orgao || null, role: record.funcao || null, startsAt: record.inicio || null, endsAt: record.fim || null },
        });
        const officeRelationshipKey = builder.addRelationship({
          sourceKey: candidateKey,
          targetKey: officeKey,
          type: 'HOLDS_PUBLIC_OFFICE',
          label: 'Exerce ou exerceu cargo público',
          confidence: 100,
          properties: { provider: 'CGU_PEP' },
        });
        builder.addEvidence({
          entityKey: candidateKey,
          relationshipKey: officeRelationshipKey,
          provider: 'CGU_PEP',
          sourceName: result.fonte || 'Portal da Transparência (CGU / PEP)',
          sourceUrl: 'https://portaldatransparencia.gov.br/download-de-dados/pep',
          query: result.nome,
          identifier: normalizeIdentifier(record.cpf) || candidateName,
          excerpt: `${candidateName} — ${record.funcao || 'função não informada'} em ${record.orgao || 'órgão não informado'}.`,
          confidence: 100,
          retrievedAt: result.consultadoEm ? safeDate(result.consultadoEm) : new Date(),
        });
      }

      if (resolution.score >= 40) {
        builder.addFinding({
          entityKey: sourceKey,
          relationshipKey: identityRelationshipKey,
          axis: 'PEP',
          status: resolution.score >= 90 ? 'REVIEW' : 'INCONCLUSIVE',
          severity: resolution.score >= 90 ? 'MEDIUM' : 'LOW',
          title: resolution.score >= 90 ? 'Correspondência PEP muito forte' : 'Possível correspondência PEP',
          explanation: `A CGU retornou o candidato ${candidateName}. O índice ${resolution.score}/100 resulta dos campos comparados (${resolution.signals.map((signal) => `${signal.label}: ${signal.detail}`).join('; ')}). O índice não é uma probabilidade e não confirma identidade; valide os documentos antes de decidir.`,
          confidence: resolution.score,
        });
      }
    }
  }
}

/**
 * Sanções de sócios pessoa física. A busca é nominal — o QSA público não
 * traz CPF completo —, então cada retorno entra como candidato sujeito a
 * resolução de identidade, jamais como sanção atribuída ao sócio.
 */
function adaptPersonSanctions(builder, shareholderKeys, summary) {
  if (!summary) return;

  const status = summary.coverageStatus || 'UNAVAILABLE';
  const candidates = (summary.resultados || []).flatMap((person) => person.candidatos || []);
  builder.addCoverage({
    axis: 'PERSON_SANCTIONS',
    provider: 'CGU_CEIS_CNEP_NOMINAL',
    status,
    message: summary.aviso
      || (candidates.length > 0
        ? `${candidates.length} candidato(s) nominal(is) exigem resolução de identidade.`
        : 'Nenhuma correspondência nominal para os sócios pessoa física consultados.'),
    resultCount: candidates.length,
    consultedAt: summary.consultadoEm ? safeDate(summary.consultadoEm) : null,
  });

  if (status === 'UNAVAILABLE' || status === 'NOT_APPLICABLE') return;

  if (candidates.length === 0) {
    builder.addFinding({
      axis: 'PERSON_SANCTIONS',
      status: 'OK',
      severity: 'INFORMATIONAL',
      title: 'Nenhum sócio pessoa física localizado em CEIS ou CNEP',
      explanation: `Os ${summary.peopleSearched || 0} sócio(s) pessoa física do quadro foram pesquisados por nome nos dois cadastros, sem correspondência.`,
      confidence: 100,
    });
    return;
  }

  for (const person of summary.resultados || []) {
    const sourceKey = shareholderKeys.get(normalizeName(person.nome));
    for (const candidate of person.candidatos || []) {
      const candidateKey = `person:cgu-sanction:${stableHash(candidate.sancionado, candidate.documentoSancionado, candidate.cadastro, candidate.processo)}`;
      builder.addEntity({
        key: candidateKey,
        type: 'Person',
        name: candidate.sancionado,
        normalizedName: normalizeName(candidate.sancionado),
        role: 'sanctioned_candidate',
        depth: 2,
        confidence: 100,
        properties: {
          source: `CGU_${candidate.cadastro}`,
          searchedName: person.nome,
          maskedCpf: candidate.documentoSancionado || null,
          sanction: candidate.sancao || null,
          sanctioningBody: candidate.orgao || null,
          sanctionStart: candidate.inicio || null,
          sanctionEnd: candidate.fim || null,
          sanctionActive: candidate.vigente === true,
          identityConfirmed: false,
        },
        identifiers: candidate.documentoSancionado
          ? [{ type: 'MASKED_CPF', value: normalizeIdentifier(candidate.documentoSancionado), provider: `CGU_${candidate.cadastro}`, confidence: 70 }]
          : [],
      });

      if (!sourceKey) continue;
      builder.addResolution({
        sourceEntityKey: sourceKey,
        candidateEntityKey: candidateKey,
        score: candidate.score,
        status: candidate.status,
        signals: candidate.signals || [],
      });
      const relationshipKey = builder.addRelationship({
        sourceKey,
        targetKey: candidateKey,
        type: 'POSSIBLE_IDENTITY_MATCH',
        label: candidate.score >= 90 ? `Correspondência forte em ${candidate.cadastro}` : `Possível correspondência em ${candidate.cadastro}`,
        status: candidate.score >= 90 ? 'PROBABLE' : 'CANDIDATE',
        confidence: candidate.score,
        properties: {
          requiresHumanReview: true,
          identityConfirmed: false,
          provider: 'EGOS_ENTITY_RESOLUTION',
          searchedName: person.nome,
          candidateName: candidate.sancionado,
          matchScore: candidate.score,
        },
      });
      builder.addEvidence({
        relationshipKey,
        provider: `CGU_${candidate.cadastro}`,
        sourceName: candidate.fonte || `Portal da Transparência (CGU / ${candidate.cadastro})`,
        sourceUrl: 'https://portaldatransparencia.gov.br/sancoes',
        query: person.nome,
        identifier: stableHash(sourceKey, candidateKey),
        excerpt: `Busca nominal em ${candidate.cadastro} retornou ${candidate.sancionado} (documento ${candidate.documentoSancionado || 'não informado'}), sanção "${candidate.sancao || 'não informada'}" aplicada por ${candidate.orgao || 'órgão não informado'}, vigência ${candidate.inicio || 'não informada'} a ${candidate.fim || 'não informada'}. Índice de compatibilidade ${candidate.score}/100 (${(candidate.signals || []).map((sig) => sig.label).join('; ')}). A identidade não está confirmada.`,
        confidence: candidate.score,
        rawReference: { candidate, signals: candidate.signals || [] },
        retrievedAt: summary.consultadoEm ? safeDate(summary.consultadoEm) : new Date(),
      });
      builder.addFinding({
        entityKey: sourceKey,
        relationshipKey,
        axis: 'PERSON_SANCTIONS',
        status: candidate.score >= 90 ? 'REVIEW' : 'INCONCLUSIVE',
        severity: candidate.score >= 90 && candidate.vigente ? 'HIGH' : candidate.score >= 90 ? 'MEDIUM' : 'LOW',
        title: candidate.score >= 90
          ? `Sócio com correspondência forte em ${candidate.cadastro}`
          : `Homônimo de sócio em ${candidate.cadastro}`,
        explanation: `A busca nominal por ${person.nome} retornou ${candidate.sancionado} no ${candidate.cadastro}. O índice ${candidate.score}/100 vem dos campos comparados (${(candidate.signals || []).map((sig) => `${sig.label}: ${sig.detail}`).join('; ')}). O CPF completo do sócio não é público, então o índice não confirma identidade: valide a documentação antes de decidir.`,
        confidence: candidate.score,
      });
    }
  }
}

function adaptCgu(builder, context, payload) {
  adaptSanctions(builder, context.companyKey, payload.cnpj, 'CEIS', payload.ceis);
  adaptSanctions(builder, context.companyKey, payload.cnpj, 'CNEP', payload.cnep);
  adaptPep(builder, context.shareholderKeys, payload.pepResults);
  adaptPersonSanctions(builder, context.shareholderKeys, payload.personSanctions);

  const sanctions = [...(payload.ceis?.registros || []), ...(payload.cnep?.registros || [])];
  const active = sanctions.filter((record) => record.vigente !== false).length;
  if (active > 0) builder.addInsight(`${active} sanção(ões) com vigência ativa exigem revisão.`);
}

module.exports = { adaptCgu, coverageStatus, adaptPersonSanctions };
