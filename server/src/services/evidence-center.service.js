// ==========================================================
// DILIGÊNCIA 360 — Central de Evidências Assistidas
// Registros manuais, revisão humana e projeção segura no EGOS
// ==========================================================

const crypto = require('crypto');
const { DiligenceRepository } = require('../repositories/diligence.repository');

const CENTER_VERSION = 'evidence-center-v1';
const VALIDATION_STATUSES = new Set(['PENDENTE_REVISAO', 'CONFIRMADA', 'DESCARTADA']);
const COVERAGE_STATUSES = new Set([
  'CONSULTADO_COM_ACHADOS',
  'CONSULTADO_SEM_ACHADOS',
  'PARCIAL',
  'INDISPONIVEL',
  'NAO_CONSULTADO',
  'EXIGE_REVISAO_MANUAL',
]);
const EVIDENCE_TYPES = new Set([
  'LINK_OFICIAL',
  'NOTICIA',
  'DECISAO',
  'DIARIO_OFICIAL',
  'CERTIDAO',
  'CONTRATO_EDITAL',
  'PROCESSO',
  'TEXTO_ANALISTA',
  'PDF',
]);
const RELATION_TYPES = new Set([
  'MENCIONADA_EM',
  'INTERESSADA_EM',
  'CONTRATADA_POR',
  'SANCIONADA_POR',
  'RESPONSABILIZADA_EM',
  'SOCIA_DE',
  'ADMINISTRADA_POR',
  'CITADA_COM',
  'DOCUMENTO_RELACIONADO',
]);

const CPF_PATTERN = /\b(?:\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-.\s]?\d{2}|\d{11})\b/g;
const REMUNERATION_PATTERN = /\b(remunera(?:ç|c)(?:ão|ao)|sal[aá]rio|provento|desconto)\b[^.;\n]{0,90}/gi;

function text(value, maxLength = 4_000) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function redactPersonalData(value, maxLength) {
  return text(value, maxLength)
    .replace(CPF_PATTERN, '[CPF REMOVIDO]')
    .replace(REMUNERATION_PATTERN, '$1 [DADO REMOVIDO]');
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function safeIso(value, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function canonicalUrl(value) {
  const raw = text(value, 2_000);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.hostname = url.hostname.toLowerCase();
    url.hash = '';
    [...url.searchParams.keys()].forEach((key) => {
      const normalized = key.toLowerCase();
      if (normalized.startsWith('utm_') || ['fbclid', 'gclid', 'mc_cid', 'mc_eid'].includes(normalized)) {
        url.searchParams.delete(key);
      }
    });
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return '';
  }
}

function domainFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function cleanPages(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(values.map((item) => Number.parseInt(item, 10)).filter((item) => Number.isInteger(item) && item > 0))]
    .sort((left, right) => left - right)
    .slice(0, 100);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.firebaseUid || user.id || '',
    name: redactPersonalData(user.name, 160) || 'Usuário autenticado',
    email: text(user.email, 240),
  };
}

function normalizeDecision(value = {}) {
  const amount = Number(value.amount);
  return {
    agency: redactPersonalData(value.agency, 240),
    processNumber: redactPersonalData(value.processNumber, 160),
    decisionNumber: redactPersonalData(value.decisionNumber, 160),
    date: value.date ? safeIso(value.date, '') : '',
    rapporteur: redactPersonalData(value.rapporteur, 240),
    interestedParties: redactPersonalData(value.interestedParties, 1_200),
    object: redactPersonalData(value.object, 1_200),
    companyRole: ['MENCIONADA', 'INTERESSADA', 'RESPONSABILIZADA'].includes(value.companyRole)
      ? value.companyRole
      : 'MENCIONADA',
    responsiblePerson: redactPersonalData(value.responsiblePerson, 240),
    recognizedIrregularity: redactPersonalData(value.recognizedIrregularity, 1_200),
    penalty: redactPersonalData(value.penalty, 600),
    debt: redactPersonalData(value.debt, 600),
    amount: Number.isFinite(amount) && amount >= 0 ? amount : null,
    referredToProsecutor: value.referredToProsecutor === true,
    debarment: value.debarment === true,
    contractingImpediment: value.contractingImpediment === true,
    appealStatus: redactPersonalData(value.appealStatus, 500),
    dispositive: redactPersonalData(value.dispositive, 2_500),
    conclusion: redactPersonalData(value.conclusion, 2_000),
  };
}

function normalizeFile(value = {}) {
  const sizeBytes = Number(value.sizeBytes);
  const pageCount = Number(value.pageCount);
  const extractionStatus = ['EXTRAIDO', 'FALHOU', 'NAO_TENTADO', 'OCR_NECESSARIO'].includes(value.extractionStatus)
    ? value.extractionStatus
    : 'NAO_TENTADO';
  return {
    name: redactPersonalData(value.name, 260),
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : null,
    pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : null,
    extractionStatus,
  };
}

function validationIssues(evidence) {
  const issues = [];
  const hasOrigin = Boolean(evidence.url || evidence.originReference);
  if (!evidence.title) issues.push('Informe um título para a evidência.');
  if (!evidence.source) issues.push('Informe a fonte ou o órgão de origem.');
  if (!hasOrigin) issues.push('Informe uma URL ou referência de origem verificável.');
  if (evidence.type === 'PDF' && evidence.file.extractionStatus !== 'EXTRAIDO') {
    issues.push('O PDF não teve extração textual confiável e exige revisão manual.');
  }
  if (evidence.type === 'DECISAO') {
    if (evidence.relevantPages.length === 0) issues.push('Indique as páginas que sustentam a interpretação da decisão.');
    if (!evidence.decision.dispositive) issues.push('Registre o dispositivo antes de confirmar a decisão.');
  }
  if (evidence.relationType === 'RESPONSABILIZADA_EM') {
    if (evidence.type !== 'DECISAO' || evidence.decision.companyRole !== 'RESPONSABILIZADA') {
      issues.push('Responsabilização exige decisão e marcação explícita da empresa como responsabilizada.');
    }
    if (!evidence.decision.dispositive || evidence.relevantPages.length === 0) {
      issues.push('Responsabilização exige dispositivo e páginas comprobatórias.');
    }
  }
  if (evidence.relationType === 'SANCIONADA_POR' && evidence.relatedEntityType === 'company' && evidence.decision.responsiblePerson) {
    issues.push('Sanção atribuída a uma pessoa não pode ser projetada automaticamente na empresa.');
  }
  return [...new Set(issues)];
}

function computeCoverageStatus(evidence, requestedStatus) {
  if (requestedStatus === 'INDISPONIVEL' || evidence.sourceUnavailable) return 'INDISPONIVEL';
  if (evidence.type === 'PDF' && evidence.file.extractionStatus !== 'EXTRAIDO') return 'EXIGE_REVISAO_MANUAL';
  if (evidence.validationStatus === 'CONFIRMADA') return 'CONSULTADO_COM_ACHADOS';
  if (evidence.validationStatus === 'DESCARTADA') return 'CONSULTADO_SEM_ACHADOS';
  return COVERAGE_STATUSES.has(requestedStatus) ? requestedStatus : 'EXIGE_REVISAO_MANUAL';
}

function buildEvidence(input, { diligenceId, user, existing } = {}) {
  const now = new Date().toISOString();
  const url = canonicalUrl(input.url ?? existing?.url);
  const type = EVIDENCE_TYPES.has(input.type) ? input.type : (existing?.type || 'LINK_OFICIAL');
  const decision = normalizeDecision({ ...(existing?.decision || {}), ...(input.decision || {}) });
  const file = normalizeFile({ ...(existing?.file || {}), ...(input.file || {}) });
  const relationType = RELATION_TYPES.has(input.relationType)
    ? input.relationType
    : (existing?.relationType || (type === 'DECISAO' ? 'INTERESSADA_EM' : 'MENCIONADA_EM'));
  const requestedValidationStatus = VALIDATION_STATUSES.has(input.validationStatus)
    ? input.validationStatus
    : (existing?.validationStatus || 'PENDENTE_REVISAO');
  const hash = text(input.hash ?? existing?.hash, 128).toLowerCase();
  const evidence = {
    id: existing?.id || crypto.randomUUID(),
    diligenceId,
    type,
    title: redactPersonalData(input.title ?? existing?.title, 500),
    source: redactPersonalData(input.source ?? existing?.source, 320),
    domain: url ? domainFromUrl(url) : redactPersonalData(input.domain ?? existing?.domain, 240),
    url,
    originReference: redactPersonalData(input.originReference ?? existing?.originReference, 600),
    documentDate: (input.documentDate ?? existing?.documentDate) ? safeIso(input.documentDate ?? existing.documentDate, '') : '',
    consultedAt: safeIso(input.consultedAt ?? existing?.consultedAt, now),
    excerpt: redactPersonalData(input.excerpt ?? existing?.excerpt, 8_000),
    relevantPages: cleanPages(input.relevantPages ?? existing?.relevantPages),
    hash,
    relatedEntity: redactPersonalData(input.relatedEntity ?? existing?.relatedEntity, 320),
    relatedEntityType: ['company', 'person', 'organization'].includes(input.relatedEntityType)
      ? input.relatedEntityType
      : (existing?.relatedEntityType || 'company'),
    relatedCnpj: digits(input.relatedCnpj ?? existing?.relatedCnpj).slice(0, 14),
    relatedProcess: redactPersonalData(input.relatedProcess ?? existing?.relatedProcess, 200),
    sourceQuality: ['OFICIAL_PRIMARIA', 'OFICIAL_SECUNDARIA', 'JORNALISTICA', 'ANALISTA', 'DESCONHECIDA'].includes(input.sourceQuality)
      ? input.sourceQuality
      : (existing?.sourceQuality || 'DESCONHECIDA'),
    matchStrength: ['FORTE', 'MEDIA', 'FRACA'].includes(input.matchStrength)
      ? input.matchStrength
      : (existing?.matchStrength || 'FRACA'),
    relationType,
    validationStatus: requestedValidationStatus,
    analystNote: redactPersonalData(input.analystNote ?? existing?.analystNote, 2_000),
    sourceUnavailable: input.sourceUnavailable === true
      || (input.sourceUnavailable === undefined && existing?.sourceUnavailable === true),
    decision,
    file,
    createdBy: existing?.createdBy || publicUser(user),
    reviewedBy: requestedValidationStatus === 'PENDENTE_REVISAO' ? null : publicUser(user),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    history: Array.isArray(existing?.history) ? [...existing.history] : [],
  };
  evidence.validationIssues = validationIssues(evidence);
  if (evidence.validationStatus === 'CONFIRMADA' && evidence.validationIssues.length > 0) {
    evidence.validationStatus = 'PENDENTE_REVISAO';
    evidence.reviewedBy = null;
  }
  evidence.coverageStatus = computeCoverageStatus(evidence, input.coverageStatus ?? existing?.coverageStatus);
  evidence.history.push({
    at: now,
    action: existing ? 'CORRIGIDA' : 'CRIADA',
    status: evidence.validationStatus,
    by: publicUser(user),
    note: redactPersonalData(input.changeNote || input.analystNote, 600),
  });
  return evidence;
}

function ensureCenter(snapshot) {
  const existing = snapshot?.evidenceCenter;
  return {
    version: CENTER_VERSION,
    items: Array.isArray(existing?.items) ? existing.items : [],
    updatedAt: existing?.updatedAt || null,
  };
}

function duplicateOf(items, candidate, ignoredId) {
  return items.find((item) => item.id !== ignoredId && item.validationStatus !== 'DESCARTADA' && (
    (candidate.url && canonicalUrl(item.url) === candidate.url)
    || (candidate.hash && text(item.hash, 128).toLowerCase() === candidate.hash)
  ));
}

function stableId(prefix, value) {
  return `${prefix}:${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24)}`;
}

function normalizedName(value) {
  return text(value, 500).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function entityCnpj(entity) {
  const propertyCnpj = digits(entity?.properties?.cnpj);
  if (propertyCnpj) return propertyCnpj;
  const identifier = (entity?.identifiers || []).find((item) => String(item.type || item.identifierType).toUpperCase() === 'CNPJ');
  return digits(identifier?.value);
}

function recalculateEgosMetrics(egos) {
  const coverage = (egos.coverage || []).reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const statuses = (egos.findings || []).reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  egos.metrics = {
    ...(egos.metrics || {}),
    entities: egos.entities.length,
    relationships: egos.relationships.length,
    evidences: egos.evidences.length,
    findings: egos.findings.length,
    resolutions: egos.resolutions.length,
    coverage,
    statuses,
  };
}

function syncEvidenceCenterToEgos(snapshot) {
  const center = ensureCenter(snapshot);
  const base = snapshot.egos || {};
  const egos = {
    ...base,
    runId: base.runId || stableId('egos-run', snapshot.id || snapshot.cnpj),
    version: base.version || 'egos-2.0-snapshot',
    generatedAt: new Date().toISOString(),
    entities: (base.entities || []).filter((item) => item.properties?.assistedEvidence !== true),
    relationships: (base.relationships || []).filter((item) => item.properties?.assistedEvidence !== true),
    evidences: (base.evidences || []).filter((item) => item.provider !== 'ANALYST_EVIDENCE'),
    coverage: (base.coverage || []).filter((item) => item.axis !== 'ASSISTED_EVIDENCE'),
    findings: (base.findings || []).filter((item) => item.axis !== 'ASSISTED_EVIDENCE'),
    resolutions: base.resolutions || [],
    insights: (base.insights || []).filter((item) => !String(item).startsWith('Central de Evidências:')),
  };

  const confirmed = center.items.filter((item) => item.validationStatus === 'CONFIRMADA');
  const pending = center.items.filter((item) => item.validationStatus === 'PENDENTE_REVISAO');
  const unavailable = center.items.filter((item) => item.coverageStatus === 'INDISPONIVEL');
  let root = egos.entities.find((item) => item.role === 'root') || egos.entities.find((item) => item.depth === 0);
  if (!root) {
    const rootCnpj = digits(snapshot.cnpj || snapshot.empresa?.cnpj);
    root = {
      id: stableId('assisted-root', rootCnpj || snapshot.id),
      key: `company:cnpj:${rootCnpj || stableId('unknown', snapshot.id)}`,
      type: 'Company',
      name: redactPersonalData(snapshot.razaoSocial || snapshot.empresa?.razao_social, 320) || 'Empresa investigada',
      normalizedName: normalizedName(snapshot.razaoSocial || snapshot.empresa?.razao_social),
      properties: { cnpj: rootCnpj || null, reconstructedForEvidenceCenter: true },
      depth: 0,
      role: 'root',
      confidence: 100,
      identifiers: rootCnpj ? [{ type: 'CNPJ', value: rootCnpj, provider: 'DOSSIER', confidence: 100 }] : [],
    };
    egos.entities.push(root);
  }

  for (const item of confirmed) {
    let subject = item.relatedCnpj
      ? egos.entities.find((entity) => entityCnpj(entity) === item.relatedCnpj)
      : null;
    if (!subject && item.relatedEntity) {
      subject = egos.entities.find((entity) => normalizedName(entity.name) === normalizedName(item.relatedEntity));
    }
    if (!subject && item.relatedEntity) {
      subject = {
        id: stableId('assisted-subject', `${item.relatedEntityType}|${item.relatedCnpj}|${item.relatedEntity}`),
        key: stableId('assisted-subject-key', `${item.relatedEntityType}|${item.relatedCnpj}|${item.relatedEntity}`),
        type: item.relatedEntityType === 'person' ? 'Person' : item.relatedEntityType === 'organization' ? 'Organization' : 'Company',
        name: item.relatedEntity,
        normalizedName: normalizedName(item.relatedEntity),
        properties: { assistedEvidence: true, cnpj: item.relatedCnpj || null },
        depth: 1,
        role: 'evidence_subject',
        confidence: item.matchStrength === 'FORTE' ? 90 : item.matchStrength === 'MEDIA' ? 70 : 45,
        identifiers: item.relatedCnpj ? [{ type: 'CNPJ', value: item.relatedCnpj, provider: 'ANALYST_EVIDENCE', confidence: 100 }] : [],
      };
      egos.entities.push(subject);
    }
    subject = subject || root;
    if (!subject) continue;

    const documentId = stableId('assisted-document', item.id);
    const document = {
      id: documentId,
      key: stableId('assisted-document-key', item.id),
      type: 'Document',
      name: item.title,
      normalizedName: normalizedName(item.title),
      properties: {
        assistedEvidence: true,
        evidenceId: item.id,
        evidenceType: item.type,
        url: item.url || null,
        domain: item.domain || null,
        documentDate: item.documentDate || null,
        sourceQuality: item.sourceQuality,
        relevantPages: item.relevantPages,
        hash: item.hash || null,
      },
      depth: Math.max(1, Number(subject.depth || 0) + 1),
      role: 'assisted_evidence',
      confidence: item.matchStrength === 'FORTE' ? 90 : item.matchStrength === 'MEDIA' ? 70 : 45,
    };
    egos.entities.push(document);

    const relationshipId = stableId('assisted-relation', item.id);
    egos.relationships.push({
      id: relationshipId,
      key: stableId('assisted-relation-key', item.id),
      sourceEntityId: subject.id,
      targetEntityId: documentId,
      sourceName: subject.name,
      targetName: document.name,
      type: item.relationType,
      label: item.relationType.replaceAll('_', ' ').toLowerCase(),
      status: 'VALIDATED',
      confidence: item.matchStrength === 'FORTE' ? 90 : item.matchStrength === 'MEDIA' ? 70 : 45,
      properties: {
        assistedEvidence: true,
        evidenceId: item.id,
        validatedByHuman: true,
        disclaimer: 'A relação representa a classificação documental revisada; não presume culpa além do dispositivo validado.',
      },
    });
    egos.evidences.push({
      id: stableId('assisted-egos-evidence', item.id),
      entityId: documentId,
      relationshipId,
      provider: 'ANALYST_EVIDENCE',
      sourceName: item.source,
      sourceUrl: item.url || null,
      query: item.originReference || item.relatedEntity || snapshot.cnpj,
      identifier: item.hash || item.relatedProcess || item.id,
      excerpt: item.excerpt || item.analystNote || 'Evidência validada por analista.',
      confidence: item.matchStrength === 'FORTE' ? 90 : item.matchStrength === 'MEDIA' ? 70 : 45,
      retrievedAt: item.consultedAt,
    });
  }

  egos.coverage.push({
    id: stableId('assisted-coverage', snapshot.id || snapshot.cnpj),
    axis: 'ASSISTED_EVIDENCE',
    provider: 'ANALYST_EVIDENCE',
    status: center.items.length === 0
      ? 'NOT_CONSULTED'
      : unavailable.length > 0 || pending.length > 0
        ? 'PARTIAL'
        : 'CONSULTED',
    message: `${confirmed.length} evidência(s) confirmada(s), ${pending.length} pendente(s) de revisão e ${unavailable.length} fonte(s) indisponível(is).`,
    resultCount: confirmed.length,
    consultedAt: center.updatedAt || new Date().toISOString(),
  });
  if (confirmed.length > 0) egos.insights.push(`Central de Evidências: ${confirmed.length} registro(s) validado(s) pelo analista foram projetados no mapa.`);
  recalculateEgosMetrics(egos);
  snapshot.egos = egos;
  return egos;
}

function summarizeCenter(center) {
  const counts = center.items.reduce((acc, item) => {
    acc[item.validationStatus] = (acc[item.validationStatus] || 0) + 1;
    return acc;
  }, {});
  return { ...center, counts };
}

const EvidenceCenterService = {
  async addEvidence(diligenceId, input, user) {
    const created = buildEvidence(input || {}, { diligenceId, user });
    const result = await DiligenceRepository.mutate(diligenceId, (snapshot) => {
      const center = ensureCenter(snapshot);
      const duplicate = duplicateOf(center.items, created);
      if (duplicate) {
        const error = new Error(`Evidência duplicada: já existe o registro “${duplicate.title}”.`);
        error.status = 409;
        throw error;
      }
      center.items.push(created);
      center.updatedAt = created.updatedAt;
      snapshot.evidenceCenter = summarizeCenter(center);
      syncEvidenceCenterToEgos(snapshot);
    }, {
      user,
      action: 'create_evidence',
      entityType: 'assisted_evidence',
      entityId: created.id,
      previousStatus: '',
      newStatus: input?.validationStatus || 'PENDENTE_REVISAO',
      justification: `Evidência assistida adicionada: ${redactPersonalData(input?.title, 240) || 'sem título'}.`,
    });
    return { evidence: created, snapshot: result.snapshot };
  },

  async updateEvidence(diligenceId, evidenceId, input, user) {
    let updated;
    const result = await DiligenceRepository.mutate(diligenceId, (snapshot) => {
      const center = ensureCenter(snapshot);
      const index = center.items.findIndex((item) => item.id === evidenceId);
      if (index < 0) {
        const error = new Error('Evidência não localizada nesta diligência.');
        error.status = 404;
        throw error;
      }
      const previous = center.items[index];
      updated = buildEvidence(input || {}, { diligenceId, user, existing: previous });
      const duplicate = duplicateOf(center.items, updated, evidenceId);
      if (duplicate) {
        const error = new Error(`Evidência duplicada: já existe o registro “${duplicate.title}”.`);
        error.status = 409;
        throw error;
      }
      updated.history[updated.history.length - 1].action = input?.validationStatus === 'CONFIRMADA'
        ? 'APROVADA'
        : input?.validationStatus === 'DESCARTADA' ? 'DESCARTADA' : 'CORRIGIDA';
      center.items[index] = updated;
      center.updatedAt = updated.updatedAt;
      snapshot.evidenceCenter = summarizeCenter(center);
      syncEvidenceCenterToEgos(snapshot);
    }, {
      user,
      action: input?.validationStatus === 'CONFIRMADA' ? 'approve_evidence'
        : input?.validationStatus === 'DESCARTADA' ? 'discard_evidence' : 'correct_evidence',
      entityType: 'assisted_evidence',
      entityId: evidenceId,
      previousStatus: '',
      newStatus: input?.validationStatus || 'PENDENTE_REVISAO',
      justification: redactPersonalData(input?.changeNote || input?.analystNote, 600)
        || 'Classificação da evidência assistida atualizada.',
    });
    return { evidence: updated, snapshot: result.snapshot };
  },
};

module.exports = {
  EvidenceCenterService,
  buildEvidence,
  canonicalUrl,
  duplicateOf,
  ensureCenter,
  redactPersonalData,
  syncEvidenceCenterToEgos,
  validationIssues,
};
