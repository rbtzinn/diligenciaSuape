const { EgosGraphBuilder } = require('./egos-graph-builder');
const { adaptReceita } = require('../adapters/receita.adapter');
const { adaptCgu } = require('../adapters/cgu.adapter');
const { adaptExternalResults } = require('../adapters/external-results.adapter');
const { adaptInternalSuape } = require('../adapters/internal-suape/internal-suape.adapter');
const { persistSnapshot } = require('./egos-persistence.service');

const EgosService = {
  async buildAndPersist(tx, diligenceId, payload) {
    const builder = new EgosGraphBuilder({
      diligenceId,
      rootCnpj: payload.cnpj,
      startedAt: payload.dataAnalise ? new Date(payload.dataAnalise) : new Date(),
    });

    const context = adaptReceita(builder, payload);
    adaptCgu(builder, context, payload);
    adaptExternalResults(builder, context, payload);
    await adaptInternalSuape(
      builder,
      context,
      tx,
      process.env.INTERNAL_SUAPE_ORGANIZATION || 'SUAPE'
    );

    const resolutionCount = builder.resolutions.length;
    builder.addCoverage({
      axis: 'ENTITY_RESOLUTION',
      provider: 'EGOS_ENTITY_RESOLUTION',
      status: resolutionCount > 0 ? 'CONSULTED' : 'NOT_APPLICABLE',
      message: resolutionCount > 0
        ? `${resolutionCount} candidato(s) foram pontuados por regras explicáveis.`
        : 'Nenhum candidato de identidade exigiu comparação nesta execução.',
      resultCount: resolutionCount,
      consultedAt: new Date(),
    });

    builder.addCoverage({
      axis: 'RELATIONSHIPS',
      provider: 'EGOS_GRAPH',
      status: 'CONSULTED',
      message: `${builder.entities.size} entidade(s) e ${builder.relationships.size} relação(ões) foram estruturadas com proveniência.`,
      resultCount: builder.relationships.size,
      consultedAt: new Date(),
    });
    builder.addInsight(`${builder.relationships.size} relação(ões) possuem evidência rastreável nesta diligência.`);

    const snapshot = builder.toSnapshot();
    return await persistSnapshot(tx, diligenceId, payload.cnpj, snapshot);
  },
};

module.exports = { EgosService };
