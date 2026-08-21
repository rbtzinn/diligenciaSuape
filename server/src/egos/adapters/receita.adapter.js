const {
  normalizeName,
  normalizeIdentifier,
  normalizeText,
  stableHash,
  safeDate,
} = require('../domain/normalization');

const ADMIN_QUALIFICATIONS = /ADMINISTR|DIRETOR|PRESIDENTE|GESTOR|REPRESENTANTE/;

function adaptReceita(builder, payload) {
  const company = payload.empresa || {};
  const cnpj = normalizeIdentifier(payload.cnpj || company.cnpj);
  const companyKey = `company:cnpj:${cnpj}`;
  const sourceName = payload.companySource || 'BrasilAPI / Receita Federal';
  const consultedAt = safeDate(payload.companyConsultedAt || payload.dataAnalise);

  builder.addEntity({
    key: companyKey,
    type: 'Company',
    name: company.razao_social || payload.razaoSocial || 'Empresa sem razão social',
    normalizedName: normalizeName(company.razao_social || payload.razaoSocial, { removeCorporateSuffix: true }),
    role: 'root',
    depth: 0,
    confidence: 100,
    properties: {
      cnpj,
      tradeName: company.nome_fantasia || payload.nomeFantasia || null,
      registrationStatus: company.descricao_situacao_cadastral || null,
      legalNature: company.natureza_juridica || null,
      mainActivity: company.cnae_fiscal_descricao || null,
      openedAt: company.data_inicio_atividade || null,
      municipality: company.municipio || null,
      state: company.uf || null,
    },
    identifiers: [{ type: 'CNPJ', value: cnpj, provider: sourceName, confidence: 100 }],
    aliases: company.nome_fantasia ? [{ value: company.nome_fantasia, type: 'trade_name', provider: sourceName }] : [],
  });

  builder.addEvidence({
    entityKey: companyKey,
    provider: 'RECEITA_CNPJ',
    sourceName,
    sourceUrl: `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    query: cnpj,
    identifier: cnpj,
    excerpt: `${company.razao_social || payload.razaoSocial} — situação cadastral: ${company.descricao_situacao_cadastral || 'não informada'}.`,
    confidence: 100,
    rawReference: { source: sourceName, retrievedAt: consultedAt.toISOString() },
    retrievedAt: consultedAt,
  });

  builder.addCoverage({
    axis: 'CADASTRO',
    provider: 'RECEITA_CNPJ',
    status: 'CONSULTED',
    message: 'Cadastro empresarial localizado e normalizado.',
    resultCount: 1,
    consultedAt,
  });

  const registrationStatus = normalizeText(company.descricao_situacao_cadastral);
  builder.addFinding({
    entityKey: companyKey,
    axis: 'CADASTRO',
    status: registrationStatus === 'ATIVA' ? 'OK' : 'REVIEW',
    severity: registrationStatus === 'ATIVA' ? 'INFORMATIONAL' : 'HIGH',
    title: registrationStatus === 'ATIVA' ? 'Cadastro empresarial ativo' : 'Situação cadastral exige revisão',
    explanation: registrationStatus === 'ATIVA'
      ? 'A empresa consta como ativa na fonte cadastral consultada.'
      : `A situação informada pela fonte cadastral é “${company.descricao_situacao_cadastral || 'não informada'}”.`,
    confidence: 100,
  });

  const addressParts = [company.logradouro, company.numero, company.bairro, company.municipio, company.uf, company.cep].filter(Boolean);
  if (addressParts.length >= 2) {
    const addressName = addressParts.join(', ');
    const addressKey = `address:${stableHash(normalizeText(addressName))}`;
    builder.addEntity({
      key: addressKey,
      type: 'Address',
      name: addressName,
      normalizedName: normalizeText(addressName),
      role: 'registered_address',
      depth: 1,
      confidence: 100,
      properties: { municipality: company.municipio || null, state: company.uf || null, postalCode: company.cep || null },
    });
    const relationshipKey = builder.addRelationship({
      sourceKey: companyKey,
      targetKey: addressKey,
      type: 'REGISTERED_AT',
      label: 'Registrada em',
      confidence: 100,
      properties: { provider: sourceName },
    });
    builder.addEvidence({
      relationshipKey,
      provider: 'RECEITA_CNPJ',
      sourceName,
      query: cnpj,
      identifier: cnpj,
      excerpt: `Endereço cadastral informado: ${addressName}.`,
      confidence: 100,
      retrievedAt: consultedAt,
    });
  }

  const shareholders = Array.isArray(payload.socios) ? payload.socios : (company.qsa || []);
  const shareholderKeys = new Map();
  for (const shareholder of shareholders) {
    const name = shareholder.nome_socio || '';
    if (!name.trim()) continue;
    const qualification = shareholder.qualificacao_socio || 'Integrante do QSA';
    const document = normalizeIdentifier(shareholder.cnpj_cpf_do_socio);
    const isCompany = document.length === 14 && !document.includes('*');
    const entityKey = isCompany
      ? `company:cnpj:${document}`
      : `person:qsa:${cnpj}:${stableHash(normalizeName(name), qualification, document)}`;

    builder.addEntity({
      key: entityKey,
      type: isCompany ? 'Company' : 'Person',
      name,
      normalizedName: normalizeName(name, { removeCorporateSuffix: isCompany }),
      role: 'qsa_member',
      depth: 1,
      confidence: 100,
      properties: { qualification, joinedAt: shareholder.data_entrada_sociedade || null, country: shareholder.pais || null },
      identifiers: document ? [{
        type: isCompany ? 'CNPJ' : 'MASKED_CPF',
        value: document,
        provider: sourceName,
        confidence: isCompany ? 100 : 65,
      }] : [],
    });
    shareholderKeys.set(normalizeName(name), entityKey);

    const isAdministrator = ADMIN_QUALIFICATIONS.test(normalizeText(qualification));
    const relationshipKey = builder.addRelationship({
      sourceKey: entityKey,
      targetKey: companyKey,
      type: isAdministrator ? 'DIRECTOR_OF' : 'SHAREHOLDER_OF',
      label: isAdministrator ? 'Administra' : 'Integra o quadro societário',
      confidence: 100,
      properties: { qualification, joinedAt: shareholder.data_entrada_sociedade || null, provider: sourceName },
    });
    builder.addEvidence({
      relationshipKey,
      provider: 'RECEITA_QSA',
      sourceName,
      query: cnpj,
      identifier: document || name,
      excerpt: `${name} consta no QSA como “${qualification}”.`,
      confidence: 100,
      retrievedAt: consultedAt,
    });
  }

  builder.addCoverage({
    axis: 'QSA',
    provider: 'RECEITA_QSA',
    status: 'CONSULTED',
    message: shareholders.length > 0
      ? `${shareholders.length} integrante(s) do quadro societário foram normalizados.`
      : 'A fonte foi consultada, mas não retornou integrantes do QSA.',
    resultCount: shareholders.length,
    consultedAt,
  });
  builder.addInsight(shareholders.length > 0
    ? `${shareholders.length} pessoa(s) ou empresa(s) integram o quadro societário e administrativo.`
    : 'Nenhum integrante do QSA foi retornado pela fonte cadastral.');

  return { companyKey, shareholderKeys };
}

module.exports = { adaptReceita };
