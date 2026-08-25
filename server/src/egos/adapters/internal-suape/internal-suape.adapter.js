const { comparePerson } = require('../../entity-resolution/entity-resolution.service');
const { stableHash } = require('../../domain/normalization');
const { InternalSuapeProvider } = require('./internal-suape.provider');

async function adaptInternalSuape(builder, context, _provider, organization = 'SUAPE') {
  const source = await InternalSuapeProvider.load(organization);
  if (!source.available) {
    builder.addCoverage({
      axis: 'INTERNAL_SUAPE',
      provider: 'INTERNAL_SUAPE',
      status: 'UNAVAILABLE',
      message: 'Nenhuma base interna autorizada está configurada nesta implantação.',
      resultCount: 0,
    });
    return;
  }

  const orgKey = `organization:${stableHash(organization)}`;

  let comparisons = 0;
  let candidates = 0;
  let probable = 0;
  for (const sourceKey of context.shareholderKeys.values()) {
    const networkPerson = builder.entities.get(sourceKey);
    if (!networkPerson || networkPerson.type !== 'Person') continue;
    const sourceCpf = networkPerson.identifiers.find((identifier) => identifier.type === 'MASKED_CPF')?.value;

    for (const internalPerson of source.people) {
      comparisons += 1;
      const resolution = comparePerson(
        { name: networkPerson.name, maskedCpf: sourceCpf },
        { name: internalPerson.name, maskedCpf: internalPerson.maskedCpf, organization }
      );
      if (resolution.score < 40) continue;
      candidates += 1;
      if (resolution.score >= 70) probable += 1;

      builder.addEntity({
        key: orgKey,
        type: 'Organization',
        name: organization,
        role: 'institution',
        depth: 3,
        confidence: 100,
        properties: { internal: true },
      });

      const internalKey = `person:internal-suape:${stableHash(internalPerson.employeeKey)}`;
      const affiliation = internalPerson.affiliations[0] || {};
      builder.addEntity({
        key: internalKey,
        type: 'Person',
        name: internalPerson.name,
        role: 'internal_candidate',
        depth: 2,
        confidence: 100,
        properties: {
          organization,
          employmentType: affiliation.employmentType || null,
          referencePeriod: affiliation.referencePeriod || source.dataset.referencePeriod || null,
          sourceSheet: affiliation.sourceSheet || null,
          datasetSourceName: source.dataset.sourceName,
          recordType: 'functional_registry',
          internal: true,
        },
      });

      const functionalRelationshipKey = builder.addRelationship({
        sourceKey: internalKey,
        targetKey: orgKey,
        type: 'FUNCTIONAL_LINK',
        label: 'Possui vínculo institucional registrado',
        status: 'CONFIRMED',
        confidence: 100,
        properties: {
          employmentType: affiliation.employmentType || null,
          referencePeriod: affiliation.referencePeriod || null,
          provider: 'INTERNAL_SUAPE',
          datasetSourceName: source.dataset.sourceName,
        },
      });
      builder.addEvidence({
        entityKey: internalKey,
        relationshipKey: functionalRelationshipKey,
        provider: 'INTERNAL_SUAPE',
        sourceName: source.dataset.sourceName,
        query: networkPerson.name,
        identifier: stableHash(internalPerson.employeeKey),
        excerpt: `Vínculo institucional registrado em ${affiliation.sourceSheet || 'base interna'}, competência ${affiliation.referencePeriod || 'não informada'}. Dados remuneratórios não foram importados.`,
        confidence: 100,
        rawReference: { datasetId: source.dataset.id, privacy: 'minimized' },
        retrievedAt: source.dataset.importedAt,
      });

      const identityRelationshipKey = builder.addRelationship({
        sourceKey,
        targetKey: internalKey,
        type: 'POSSIBLE_IDENTITY_MATCH',
        label: resolution.score >= 70 ? 'Provável correspondência interna' : 'Possível correspondência interna',
        status: resolution.score >= 90 ? 'PROBABLE' : 'CANDIDATE',
        confidence: resolution.score,
        properties: {
          requiresHumanReview: true,
          identityConfirmed: false,
          provider: 'EGOS_ENTITY_RESOLUTION',
          searchedName: networkPerson.name,
          candidateName: internalPerson.name,
          matchScore: resolution.score,
        },
      });
      builder.addEvidence({
        relationshipKey: identityRelationshipKey,
        provider: 'EGOS_ENTITY_RESOLUTION',
        sourceName: 'Cruzamento controlado com a base interna SUAPE',
        query: networkPerson.name,
        identifier: stableHash(networkPerson.name, internalPerson.employeeKey),
        excerpt: `Comparação explicável: ${resolution.signals.map((signal) => signal.label).join('; ')}. A correspondência não significa conflito de interesse.`,
        confidence: resolution.score,
        rawReference: {
          signals: resolution.signals.map((signal) => ({
            code: signal.code,
            label: signal.label,
            matched: signal.matched,
            weight: signal.weight,
            detail: signal.detail,
          })),
          privacy: 'minimized',
        },
        retrievedAt: new Date(),
      });
      builder.addResolution({
        sourceEntityKey: sourceKey,
        candidateEntityKey: internalKey,
        score: resolution.score,
        status: resolution.status,
        signals: resolution.signals,
      });
      builder.addFinding({
        entityKey: sourceKey,
        relationshipKey: identityRelationshipKey,
        axis: 'INTERNAL_SUAPE',
        status: resolution.score >= 70 ? 'REVIEW' : 'INCONCLUSIVE',
        severity: resolution.score >= 90 ? 'MEDIUM' : 'LOW',
        title: 'Possível vínculo institucional relevante',
        explanation: `A rede empresarial possui índice de compatibilidade ${resolution.score}/100 com um registro funcional interno (${resolution.signals.map((signal) => `${signal.label}: ${signal.detail}`).join('; ')}). Isso não é probabilidade, não prova identidade, parentesco, irregularidade ou conflito e requer revisão humana.`,
        confidence: resolution.score,
      });
    }
  }

  builder.addCoverage({
    axis: 'INTERNAL_SUAPE',
    provider: 'INTERNAL_SUAPE',
    status: 'CONSULTED',
    message: `${context.shareholderKeys.size} integrante(s) da rede foram comparados com ${source.people.length} identidade(s) funcionais minimizadas. ${candidates} candidato(s) exigem revisão.`,
    resultCount: candidates,
    consultedAt: source.dataset.importedAt,
  });
  builder.addInsight(candidates > 0
    ? `${probable} provável(is) e ${candidates - probable} possível(is) correspondência(s) com a base interna exigem revisão humana.`
    : `Nenhuma correspondência relevante foi localizada após ${comparisons} comparações com a base interna.`);
}

module.exports = { adaptInternalSuape };
