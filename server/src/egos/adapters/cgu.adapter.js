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
  const recordsCount = results.reduce((total, item) => total + (item.registros?.length || 0), 0);
  const status = results.length === 0 || unavailable === results.length
    ? 'UNAVAILABLE'
    : unavailable > 0 ? 'PARTIAL' : 'CONSULTED';
  builder.addCoverage({
    axis: 'PEP',
    provider: 'CGU_PEP',
    status,
    message: status === 'UNAVAILABLE'
      ? 'A verificação nominal de PEP não pôde ser concluída.'
      : status === 'PARTIAL'
        ? `${results.length - unavailable} de ${results.length} integrante(s) foram consultados.`
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
        properties: { source: 'CGU_PEP' },
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
        properties: { requiresHumanReview: true, provider: 'EGOS_ENTITY_RESOLUTION' },
      });
      builder.addEvidence({
        relationshipKey: identityRelationshipKey,
        provider: 'EGOS_ENTITY_RESOLUTION',
        sourceName: 'Cruzamento QSA × Pessoas Expostas Politicamente',
        query: result.nome,
        identifier: stableHash(sourceKey, candidateKey),
        excerpt: `Comparação explicável: ${resolution.signals.map((signal) => signal.label).join('; ')}. O resultado não confirma identidade automaticamente.`,
        confidence: resolution.score,
        rawReference: { signals: resolution.signals.map((signal) => ({ code: signal.code, matched: signal.matched, weight: signal.weight })) },
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
          explanation: `A busca por nome retornou candidato com ${resolution.score}% de confiança. Isso não confirma identidade e requer validação humana.`,
          confidence: resolution.score,
        });
      }
    }
  }
}

function adaptCgu(builder, context, payload) {
  adaptSanctions(builder, context.companyKey, payload.cnpj, 'CEIS', payload.ceis);
  adaptSanctions(builder, context.companyKey, payload.cnpj, 'CNEP', payload.cnep);
  adaptPep(builder, context.shareholderKeys, payload.pepResults);

  const sanctions = [...(payload.ceis?.registros || []), ...(payload.cnep?.registros || [])];
  const active = sanctions.filter((record) => record.vigente !== false).length;
  if (active > 0) builder.addInsight(`${active} sanção(ões) com vigência ativa exigem revisão.`);
}

module.exports = { adaptCgu, coverageStatus };
