const { stableHash } = require('../domain/normalization');

class EgosGraphBuilder {
  constructor({ diligenceId, rootCnpj, startedAt = new Date() }) {
    this.diligenceId = diligenceId;
    this.rootCnpj = rootCnpj;
    this.startedAt = startedAt;
    this.rootEntityKey = null;
    this.entities = new Map();
    this.relationships = new Map();
    this.evidences = [];
    this.coverage = [];
    this.findings = [];
    this.resolutions = [];
    this.insights = [];
  }

  addEntity(entity) {
    const current = this.entities.get(entity.key);
    const next = {
      key: entity.key,
      type: entity.type,
      name: entity.name || 'Não informado',
      normalizedName: entity.normalizedName || '',
      properties: { ...(current?.properties || {}), ...(entity.properties || {}) },
      depth: Math.min(current?.depth ?? entity.depth ?? 0, entity.depth ?? 0),
      role: current?.role === 'root' ? 'root' : (entity.role || current?.role || 'related'),
      confidence: Math.max(current?.confidence || 0, entity.confidence ?? 100),
      identifiers: [...(current?.identifiers || []), ...(entity.identifiers || [])],
      aliases: [...(current?.aliases || []), ...(entity.aliases || [])],
    };
    this.entities.set(entity.key, next);
    if (next.role === 'root') this.rootEntityKey = entity.key;
    return entity.key;
  }

  addRelationship(relationship) {
    const key = relationship.key || `rel:${stableHash(
      relationship.sourceKey,
      relationship.type,
      relationship.targetKey
    )}`;
    this.relationships.set(key, {
      key,
      sourceKey: relationship.sourceKey,
      targetKey: relationship.targetKey,
      type: relationship.type,
      label: relationship.label,
      properties: relationship.properties || {},
      status: relationship.status || 'CONFIRMED',
      confidence: relationship.confidence ?? 100,
    });
    return key;
  }

  addEvidence(evidence) {
    this.evidences.push({ retrievedAt: new Date(), ...evidence });
  }

  addCoverage(entry) {
    this.coverage.push({ resultCount: 0, consultedAt: null, ...entry });
  }

  addFinding(finding) {
    const index = this.findings.findIndex((item) => (
      item.axis === finding.axis
      && item.title === finding.title
      && item.entityKey === finding.entityKey
      && item.relationshipKey === finding.relationshipKey
    ));
    if (index === -1) {
      this.findings.push({ reviewStatus: 'pending', ...finding });
      return;
    }
    const severityRank = { INFORMATIONAL: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
    const current = this.findings[index];
    this.findings[index] = {
      ...current,
      ...finding,
      confidence: Math.max(current.confidence || 0, finding.confidence || 0),
      severity: severityRank[finding.severity] > severityRank[current.severity] ? finding.severity : current.severity,
      reviewStatus: current.reviewStatus || finding.reviewStatus || 'pending',
    };
  }

  addResolution(resolution) {
    const index = this.resolutions.findIndex((item) => (
      item.sourceEntityKey === resolution.sourceEntityKey
      && item.candidateEntityKey === resolution.candidateEntityKey
    ));
    if (index === -1) {
      this.resolutions.push({ reviewStatus: 'pending', ...resolution });
      return;
    }

    const current = this.resolutions[index];
    const signals = [...(current.signals || []), ...(resolution.signals || [])]
      .filter((signal, signalIndex, all) => (
        all.findIndex((candidate) => candidate.code === signal.code && candidate.detail === signal.detail) === signalIndex
      ));
    this.resolutions[index] = {
      ...current,
      ...resolution,
      score: Math.max(current.score || 0, resolution.score || 0),
      signals,
      reviewStatus: current.reviewStatus || resolution.reviewStatus || 'pending',
    };
  }

  addInsight(insight) {
    if (insight) this.insights.push(insight);
  }

  toSnapshot() {
    const coverageCounts = this.coverage.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    const findingCounts = this.findings.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    return {
      rootEntityKey: this.rootEntityKey,
      entities: [...this.entities.values()],
      relationships: [...this.relationships.values()],
      evidences: this.evidences,
      coverage: this.coverage,
      findings: this.findings,
      resolutions: this.resolutions,
      insights: this.insights,
      metrics: {
        entities: this.entities.size,
        relationships: this.relationships.size,
        evidences: this.evidences.length,
        findings: this.findings.length,
        resolutions: this.resolutions.length,
        coverage: coverageCounts,
        statuses: findingCounts,
      },
    };
  }
}

module.exports = { EgosGraphBuilder };
