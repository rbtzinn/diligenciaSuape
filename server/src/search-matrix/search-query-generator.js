// ==========================================================
// DILIGÊNCIA 360 — Gerador de consultas e matriz de pesquisa
// ==========================================================
// Camada única que decide O QUE perguntar a cada fonte sobre a entidade
// investigada. Hoje cada serviço monta as próprias variantes de nome, e o
// resultado é que a mesma pergunta é feita de três jeitos ligeiramente
// diferentes, sem que ninguém consiga responder por que ela foi feita.
//
// A matriz existe para tornar a pergunta auditável antes da resposta: cada
// consulta carrega o identificador que a sustenta, o motivo, a prioridade e o
// risco de trazer material de outra empresa.
//
// FRONTEIRAS DESTE MÓDULO — as duas importam:
//
// 1. Ele NÃO resolve identidade. Gerar `"GUERRA"` não afirma nada sobre GUERRA
//    CONSTRUCOES LTDA; apenas registra que a pergunta é ruidosa e por isso vale
//    pouco. Quem decide se um resultado é da empresa continua sendo o
//    `resolveEntityMatch` da Fase 1, depois da execução.
//
// 2. Ele NÃO executa nada. Consulta gerada não é consulta feita, e fonte
//    planejada não é fonte consultada. O estado da execução mora em `status`, e
//    a resposta da fonte, quando houver, em `sourceStatus` (Fase 2).
// ==========================================================

const crypto = require('crypto');
const { buildEntityProfile, normalize } = require('../entity-resolution/entity-resolution');
// Vocabulário de relação compartilhado. Mora em domain desde a Fase 3, quando
// deixou de ser exclusivo do TCE-PE — antes a matriz importava um serviço só
// para ler seis strings, invertendo a direção da dependência.
const { RELATIONSHIP_TYPE } = require('../domain/relationship-type');
const {
  SEARCH_CATEGORY,
  QUERY_PRIORITY,
  PRIORITY_RANK,
  QUERY_STATUS,
  FALSE_POSITIVE_RISK,
  IDENTIFIER_KIND,
  PROVIDERS,
} = require('./search-vocabulary');

const envInt = (name, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(process.env[name], 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, minimum), maximum);
};

// Tetos contra explosão combinatória. Sem eles, três nomes × cinco termos ×
// quinze provedores × dez sócios produziriam milhares de consultas que ninguém
// executaria e cuja leitura não caberia em nenhuma tela.
const MAX_PARTNERS = envInt('SEARCH_MATRIX_MAX_PARTNERS', 5, 0, 20);
const MAX_KNOWN_CONTRACTS = envInt('SEARCH_MATRIX_MAX_CONTRACTS', 10, 0, 50);
const MAX_KNOWN_PROCESSES = envInt('SEARCH_MATRIX_MAX_PROCESSES', 10, 0, 50);
const MAX_QUERIES_PER_CATEGORY = envInt('SEARCH_MATRIX_MAX_PER_CATEGORY', 24, 4, 100);
const MAX_QUERIES_TOTAL = envInt('SEARCH_MATRIX_MAX_TOTAL', 160, 20, 600);

/** Termos de execução contratual que o Compliance procura em fonte aberta. */
const CONTRACT_MEDIA_TERMS = Object.freeze([
  'contrato', 'licitação', 'termo aditivo', 'aditivo', 'reequilíbrio',
  'acréscimo', 'supressão', 'rescisão', 'multa', 'penalidade',
  'paralisação', 'obra paralisada', 'obra inacabada', 'serviços excedentes',
  'ajuste de contas', 'auditoria', 'representação', 'denúncia',
]);

function stableId(...parts) {
  return crypto.createHash('sha256').update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex').slice(0, 24);
}

/** Aspas para busca por frase exata, no mesmo formato já usado na mídia. */
function quote(value) {
  const cleaned = String(value ?? '').replace(/["“”]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return cleaned ? `"${cleaned}"` : '';
}

function formatCnpj(digits) {
  const value = String(digits ?? '').replace(/\D/g, '');
  if (value.length !== 14) return '';
  return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Chave semântica de deduplicação.
 *
 * "GUERRA CONSTRUÇÕES LTDA" e "Guerra Construcoes Ltda." são a mesma pergunta
 * escrita de dois jeitos. A chave normaliza acento, caixa e pontuação para que
 * a fonte seja consultada uma vez só.
 *
 * A normalização serve à deduplicação e NADA MAIS: nomes que colapsam na mesma
 * chave continuam sendo nomes semelhantes, não identidades confirmadas.
 */
function semanticKey(query) {
  const terms = normalize(query.query).split(' ').filter(Boolean).sort().join(' ');
  return [query.category, terms].join('::');
}

/**
 * Constrói uma consulta com toda a proveniência que a torna auditável.
 * Campos ausentes são explicitados como `null`, nunca omitidos.
 */
function buildQuery({
  query,
  provider,
  category,
  priority,
  priorityRationale,
  subject,
  identifier,
  reason,
  expectedRelationship,
  falsePositiveRisk,
  municipio = null,
  uf = null,
}) {
  const descriptor = PROVIDERS[provider] || {};
  return {
    id: stableId('search-query', provider, category, normalize(query)),
    query,
    // Um provedor por consulta na geração; a deduplicação funde os equivalentes.
    provider,
    providers: [provider],
    providerLabel: descriptor.label || provider,
    providerImplemented: descriptor.implemented !== false,
    category,
    priority,
    // Prioridade sem explicação é número mágico: quem revisa precisa poder
    // discordar da ordem, e para isso precisa saber de onde ela veio.
    priorityRationale,
    subject,
    identifier,
    reason,
    expectedRelationship,
    falsePositiveRisk,
    requiresCnpj: descriptor.requiresCnpj === true,
    allowsName: descriptor.allowsName !== false,
    municipio,
    uf,
    // Consulta gerada nasce planejada. Só a execução muda estes dois campos.
    status: QUERY_STATUS.PLANNED,
    sourceStatus: null,
  };
}

/**
 * Funde consultas semanticamente equivalentes preservando o que cada uma
 * trazia: os provedores alvo, a maior prioridade, o menor risco e todas as
 * justificativas. Descartar a justificativa da duplicata perderia a única
 * resposta possível a "por que o sistema pesquisou isso?".
 */
function deduplicate(queries) {
  const merged = new Map();
  for (const query of queries) {
    const key = semanticKey(query);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...query, reasons: [query.reason], duplicatesMerged: 0 });
      continue;
    }
    current.providers = [...new Set([...current.providers, ...query.providers])];
    current.duplicatesMerged += 1;
    if (!current.reasons.includes(query.reason)) current.reasons.push(query.reason);
    // A prioridade da consulta fundida é a mais alta entre as origens: se uma
    // fonte oficial justifica perguntar, a pergunta não fica em segundo plano
    // por também ter sido pedida por um buscador aberto.
    if (PRIORITY_RANK[query.priority] > PRIORITY_RANK[current.priority]) {
      current.priority = query.priority;
      current.priorityRationale = query.priorityRationale;
    }
    if (query.falsePositiveRisk === FALSE_POSITIVE_RISK.LOW) {
      current.falsePositiveRisk = FALSE_POSITIVE_RISK.LOW;
    }
    current.providerImplemented = current.providerImplemented || query.providerImplemented;
  }
  return [...merged.values()];
}

/**
 * Risco de ruído de um TERMO de busca — não do nome da empresa.
 *
 * A distinção é o ponto. O falso positivo da Fase 1 nasceu de UMA PALAVRA
 * ("guerra") casando com uma reportagem sobre a Síria; não nasceu da frase
 * "GUERRA CONSTRUCOES LTDA", que nenhum texto sobre a Síria contém. Medir o
 * risco pelo perfil da empresa condenaria a frase exata pelo pecado do token
 * isolado, e rebaixaria justamente a consulta mais precisa disponível.
 *
 * Por isso o que se mede aqui é o poder discriminante do termo pesquisado.
 *
 * @param {string} term termo que irá para a busca, sem aspas.
 * @param {boolean} anchored a consulta acompanha município, UF ou nome de empresa.
 */
function termFalsePositiveRisk(term, anchored = false) {
  const tokens = normalize(term).split(' ').filter(Boolean);
  if (tokens.length >= 3) return FALSE_POSITIVE_RISK.LOW;
  if (tokens.length === 2) return anchored ? FALSE_POSITIVE_RISK.LOW : FALSE_POSITIVE_RISK.MEDIUM;
  // Palavra única: casa com qualquer texto que a contenha. Uma âncora
  // geográfica atenua, mas não elimina.
  return anchored ? FALSE_POSITIVE_RISK.MEDIUM : FALSE_POSITIVE_RISK.HIGH;
}

/**
 * Risco do nome empresarial reduzido ao seu núcleo distintivo.
 * Mantido para quem precisa avaliar a entidade, e não uma consulta específica.
 */
function corporateNameRisk(profile) {
  if (profile.distinctiveTokens.length >= 2) return FALSE_POSITIVE_RISK.LOW;
  return profile.singleTokenName ? FALSE_POSITIVE_RISK.HIGH : FALSE_POSITIVE_RISK.MEDIUM;
}

/** Prioridade de consulta nominal. Só o termo fraco é rebaixado. */
function nameQueryPriority(term, official, withContext) {
  const risky = termFalsePositiveRisk(term, withContext) === FALSE_POSITIVE_RISK.HIGH;
  if (official) return risky ? QUERY_PRIORITY.MEDIUM : QUERY_PRIORITY.HIGH;
  if (risky) return QUERY_PRIORITY.LOW;
  return QUERY_PRIORITY.MEDIUM;
}

function providersFor(category) {
  return Object.entries(PROVIDERS)
    .filter(([, descriptor]) => descriptor.categories.includes(category))
    .map(([id]) => id);
}

/**
 * Gera a matriz de pesquisa da entidade.
 *
 * @param {object} input dados cadastrais e QSA, ou um perfil já construído.
 * @param {object} [options]
 * @param {string[]} [options.knownContracts] números de contrato já confirmados.
 * @param {string[]} [options.knownProcesses] números de processo já conhecidos.
 * @param {string[]} [options.categories] restringe as categorias geradas.
 * @param {boolean} [options.includeUnimplementedProviders=true] planeja também
 *   as fontes públicas ainda sem adaptador, declarando que não são executáveis.
 * @returns {object} matriz com consultas, agrupamento por categoria e resumo.
 */
function generateSearchMatrix(input = {}, options = {}) {
  const profile = input && input.entityId ? input : buildEntityProfile(input);
  const generatedAt = new Date().toISOString();
  const {
    knownContracts = [],
    knownProcesses = [],
    categories = null,
    includeUnimplementedProviders = true,
  } = options;

  const cnpj = profile.cnpjNormalized;
  const cnpjFormatted = formatCnpj(cnpj);
  const hasCnpj = cnpj.length === 14;
  const razao = profile.razaoSocial;
  const fantasia = profile.nomeFantasia;
  const municipio = profile.municipio || null;
  const uf = profile.uf || null;
  const subject = { type: 'company', name: razao || fantasia || cnpjFormatted, entityId: profile.entityId };
  const nameRisk = razao ? termFalsePositiveRisk(razao) : FALSE_POSITIVE_RISK.HIGH;

  const queries = [];
  const skipped = [];
  const allowCategory = (category) => !categories || categories.includes(category);

  const push = (candidate) => {
    if (!candidate.query || !allowCategory(candidate.category)) return;
    const descriptor = PROVIDERS[candidate.provider];
    if (!descriptor) return;
    // Fonte que só responde por CNPJ não recebe consulta nominal: geraria uma
    // pergunta que a API não sabe atender.
    if (descriptor.requiresCnpj && !candidate.identifier.kind.startsWith('CNPJ') && !descriptor.allowsName) return;
    if (!includeUnimplementedProviders && descriptor.implemented === false) {
      skipped.push({
        provider: candidate.provider,
        category: candidate.category,
        motivo: 'Fonte pública sem adaptador implementado nesta versão.',
      });
      return;
    }
    queries.push(buildQuery({ ...candidate, municipio, uf }));
  };

  // ---------------------------------------------------------------
  // 1. Identificador exato. É a consulta que mais rende identidade
  //    confirmada, e por isso encabeça toda categoria que a aceite.
  // ---------------------------------------------------------------
  if (hasCnpj) {
    const cnpjCategories = [
      SEARCH_CATEGORY.IDENTIDADE, SEARCH_CATEGORY.SANCOES, SEARCH_CATEGORY.CONTRATOS,
      SEARCH_CATEGORY.ADITIVOS, SEARCH_CATEGORY.LICITACOES, SEARCH_CATEGORY.OBRAS,
      SEARCH_CATEGORY.PAGAMENTOS, SEARCH_CATEGORY.PNCP, SEARCH_CATEGORY.CONTROLE_EXTERNO,
      SEARCH_CATEGORY.RELACIONAMENTOS,
    ];
    for (const category of cnpjCategories) {
      for (const provider of providersFor(category)) {
        const descriptor = PROVIDERS[provider];
        push({
          query: cnpj,
          provider,
          category,
          priority: descriptor.official ? QUERY_PRIORITY.CRITICAL : QUERY_PRIORITY.HIGH,
          priorityRationale: descriptor.official
            ? 'Identificador exato em fonte oficial: a consulta de maior poder de confirmação disponível.'
            : 'Identificador exato em fonte não oficial: confirma identidade, mas a fonte é secundária.',
          subject,
          identifier: { kind: IDENTIFIER_KIND.CNPJ, value: cnpj },
          reason: `Busca de vínculos em ${descriptor.label} usando o CNPJ da empresa, que identifica a `
            + 'pessoa jurídica sem ambiguidade.',
          expectedRelationship: RELATIONSHIP_TYPE.CONTRACTOR,
          falsePositiveRisk: FALSE_POSITIVE_RISK.LOW,
        });
      }
    }

    // Grafia pontuada, para as fontes que casam texto em vez de campo.
    for (const category of [SEARCH_CATEGORY.MEDIA, SEARCH_CATEGORY.DIARIO_OFICIAL]) {
      for (const provider of providersFor(category)) {
        push({
          query: quote(cnpjFormatted),
          provider,
          category,
          priority: QUERY_PRIORITY.HIGH,
          priorityRationale: 'Identificador exato em fonte textual: baixo ruído, mas depende de o '
            + 'documento grafar o CNPJ.',
          subject,
          identifier: { kind: IDENTIFIER_KIND.CNPJ_FORMATTED, value: cnpjFormatted },
          reason: 'Localiza documentos que citam o CNPJ com pontuação, grafia usual em publicações '
            + 'oficiais e contratos.',
          expectedRelationship: RELATIONSHIP_TYPE.MENTIONED,
          falsePositiveRisk: FALSE_POSITIVE_RISK.LOW,
        });
        push({
          query: cnpj,
          provider,
          category,
          priority: QUERY_PRIORITY.HIGH,
          priorityRationale: 'Identificador exato em fonte textual, na grafia sem pontuação.',
          subject,
          identifier: { kind: IDENTIFIER_KIND.CNPJ, value: cnpj },
          reason: 'Localiza documentos que citam o CNPJ sem pontuação, grafia usual em sistemas e planilhas.',
          expectedRelationship: RELATIONSHIP_TYPE.MENTIONED,
          falsePositiveRisk: FALSE_POSITIVE_RISK.LOW,
        });
      }
    }
  }

  // ---------------------------------------------------------------
  // 2. Nome empresarial. Sempre entre aspas, para frase exata: sem elas
  //    o buscador devolve qualquer texto com uma das palavras.
  // ---------------------------------------------------------------
  const nameCategories = [
    SEARCH_CATEGORY.CONTROLE_EXTERNO, SEARCH_CATEGORY.DIARIO_OFICIAL,
    SEARCH_CATEGORY.PNCP, SEARCH_CATEGORY.MEDIA, SEARCH_CATEGORY.CONTRATOS,
    SEARCH_CATEGORY.LICITACOES, SEARCH_CATEGORY.OBRAS, SEARCH_CATEGORY.ADITIVOS,
  ];
  if (razao) {
    for (const category of nameCategories) {
      for (const provider of providersFor(category)) {
        const descriptor = PROVIDERS[provider];
        if (!descriptor.allowsName) continue;
        push({
          query: quote(razao),
          provider,
          category,
          priority: nameQueryPriority(razao, descriptor.official, false),
          priorityRationale: nameRisk === FALSE_POSITIVE_RISK.HIGH
            ? 'Razão social curta: como termo de busca casa com muito texto alheio, então a consulta '
              + 'vale menos que a mesma pergunta com contexto.'
            : 'Razão social completa em frase exata: identificação nominal forte, ainda sujeita a homônimo.',
          subject,
          identifier: { kind: IDENTIFIER_KIND.CORPORATE_NAME, value: razao },
          reason: `Busca nominal em ${descriptor.label}, porque a fonte não aceita filtro por CNPJ `
            + 'ou pode citar a empresa apenas pelo nome.',
          expectedRelationship: RELATIONSHIP_TYPE.MENTIONED,
          falsePositiveRisk: nameRisk,
        });
      }
    }

    // Nome + contexto geográfico. Só existe quando o dado existe, e só para
    // fontes textuais: numa API que filtra por CNPJ o município é ruído.
    const contextProviders = [
      ...providersFor(SEARCH_CATEGORY.MEDIA),
      ...providersFor(SEARCH_CATEGORY.DIARIO_OFICIAL),
    ];
    for (const provider of [...new Set(contextProviders)]) {
      if (municipio) {
        push({
          query: `${quote(razao)} ${quote(municipio)}`,
          provider,
          category: PROVIDERS[provider].categories[0],
          priority: nameQueryPriority(razao, PROVIDERS[provider].official, true),
          priorityRationale: 'Nome com âncora geográfica: reduz homônimo de outra praça sem depender de CNPJ.',
          subject,
          identifier: { kind: IDENTIFIER_KIND.CORPORATE_NAME, value: razao },
          reason: `Restringe a busca nominal ao município de registro da empresa (${municipio}), `
            + 'para separar a entidade investigada de homônimas de outras localidades.',
          expectedRelationship: RELATIONSHIP_TYPE.MENTIONED,
          falsePositiveRisk: termFalsePositiveRisk(razao, true),
        });
      }
      if (uf) {
        push({
          query: `${quote(razao)} ${uf}`,
          provider,
          category: PROVIDERS[provider].categories[0],
          priority: nameQueryPriority(razao, PROVIDERS[provider].official, true),
          priorityRationale: 'Nome com âncora de unidade federativa: âncora mais fraca que o município, '
            + 'mas ainda separa homônimo de outro estado.',
          subject,
          identifier: { kind: IDENTIFIER_KIND.CORPORATE_NAME, value: razao },
          reason: `Restringe a busca nominal à UF de registro da empresa (${uf}).`,
          expectedRelationship: RELATIONSHIP_TYPE.MENTIONED,
          falsePositiveRisk: termFalsePositiveRisk(razao, true),
        });
      }
    }

    // Nome + termos de execução contratual. Uma consulta com os termos em OR,
    // e não uma consulta por termo: dezoito consultas por provedor seria a
    // explosão combinatória que este módulo existe para evitar.
    for (const provider of providersFor(SEARCH_CATEGORY.MEDIA)) {
      push({
        query: `${quote(razao)} (${CONTRACT_MEDIA_TERMS.map((term) => quote(term)).join(' OR ')})`,
        provider,
        category: SEARCH_CATEGORY.MEDIA,
        priority: QUERY_PRIORITY.MEDIUM,
        priorityRationale: 'Nome com termos de execução contratual: dirige a busca ao que o Compliance '
          + 'precisa examinar, em vez de varrer menções genéricas.',
        subject,
        identifier: { kind: IDENTIFIER_KIND.CORPORATE_NAME, value: razao },
        reason: 'Procura registros públicos de alteração, penalidade ou paralisação contratual '
          + 'associados ao nome empresarial.',
        expectedRelationship: RELATIONSHIP_TYPE.MENTIONED,
        falsePositiveRisk: nameRisk,
      });
    }
  }

  // Nome fantasia: apelido mais curto e mais colidente que a razão social.
  if (fantasia && normalize(fantasia) !== normalize(razao)) {
    const fantasiaRisk = termFalsePositiveRisk(fantasia);
    for (const provider of [...providersFor(SEARCH_CATEGORY.MEDIA), ...providersFor(SEARCH_CATEGORY.DIARIO_OFICIAL)]) {
      push({
        query: quote(fantasia),
        provider,
        category: PROVIDERS[provider].categories[0],
        priority: fantasiaRisk === FALSE_POSITIVE_RISK.HIGH ? QUERY_PRIORITY.LOW : QUERY_PRIORITY.MEDIUM,
        priorityRationale: fantasiaRisk === FALSE_POSITIVE_RISK.HIGH
          ? 'Nome fantasia de palavra única: alto ruído, mantido em baixa prioridade porque ainda é '
            + 'como parte das publicações se refere à empresa.'
          : 'Nome fantasia: costuma ser a grafia usada em publicações e notícias.',
        subject,
        identifier: { kind: IDENTIFIER_KIND.TRADE_NAME, value: fantasia },
        reason: 'Publicações e notícias frequentemente citam o nome fantasia, e não a razão social.',
        expectedRelationship: RELATIONSHIP_TYPE.MENTIONED,
        falsePositiveRisk: fantasiaRisk,
      });
    }
  }

  // ---------------------------------------------------------------
  // 3. Pessoas do quadro. Só pessoa natural, e só nome completo:
  //    primeiro nome isolado é ruído puro em qualquer fonte.
  // ---------------------------------------------------------------
  const partners = profile.socios
    .filter((partner) => partner.naturalPerson && partner.normalizedName.split(' ').length >= 2)
    .slice(0, MAX_PARTNERS);
  for (const partner of partners) {
    const partnerSubject = { type: 'person', name: partner.name, entityId: profile.entityId };
    for (const provider of [...providersFor(SEARCH_CATEGORY.PESSOAS), ...providersFor(SEARCH_CATEGORY.MEDIA)]) {
      const descriptor = PROVIDERS[provider];
      push({
        query: quote(partner.name),
        provider,
        category: descriptor.categories.includes(SEARCH_CATEGORY.PESSOAS)
          ? SEARCH_CATEGORY.PESSOAS
          : SEARCH_CATEGORY.MEDIA,
        priority: QUERY_PRIORITY.MEDIUM,
        priorityRationale: 'Nome completo de integrante do quadro: identificação nominal sem documento, '
          + 'sempre sujeita a homônimo.',
        subject: partnerSubject,
        identifier: { kind: IDENTIFIER_KIND.PARTNER_NAME, value: partner.name },
        reason: `${partner.name} consta no quadro societário${partner.qualification ? ` como ${partner.qualification}` : ''}`
          + ', e a exposição da pessoa integra a diligência da empresa.',
        expectedRelationship: RELATIONSHIP_TYPE.RELATED,
        falsePositiveRisk: FALSE_POSITIVE_RISK.MEDIUM,
      });
    }
    // Nome da pessoa ancorado na empresa: a combinação que reduz homônimo.
    if (razao) {
      for (const provider of providersFor(SEARCH_CATEGORY.MEDIA)) {
        push({
          query: `${quote(partner.name)} ${quote(razao)}`,
          provider,
          category: SEARCH_CATEGORY.MEDIA,
          priority: QUERY_PRIORITY.MEDIUM,
          priorityRationale: 'Pessoa ancorada no nome da empresa: reduz homônimo sem depender de CPF, '
            + 'que o QSA público não fornece por inteiro.',
          subject: partnerSubject,
          identifier: { kind: IDENTIFIER_KIND.PARTNER_NAME, value: partner.name },
          reason: 'Procura material que associe a pessoa à empresa investigada, e não apenas ao nome dela.',
          expectedRelationship: RELATIONSHIP_TYPE.RELATED,
          falsePositiveRisk: FALSE_POSITIVE_RISK.LOW,
        });
      }
    }
  }

  // ---------------------------------------------------------------
  // 4. Identificadores já descobertos. Contrato e processo conhecidos são
  //    âncoras exatas — valem tanto quanto o CNPJ para achar documento.
  // ---------------------------------------------------------------
  for (const contract of knownContracts.slice(0, MAX_KNOWN_CONTRACTS)) {
    const value = String(contract ?? '').trim();
    if (!value) continue;
    for (const provider of [...providersFor(SEARCH_CATEGORY.DIARIO_OFICIAL), ...providersFor(SEARCH_CATEGORY.MEDIA)]) {
      push({
        query: razao ? `${quote(value)} ${quote(razao)}` : quote(value),
        provider,
        category: SEARCH_CATEGORY.CONTRATOS,
        priority: QUERY_PRIORITY.HIGH,
        priorityRationale: 'Número de contrato já confirmado da empresa: âncora documental exata.',
        subject,
        identifier: { kind: IDENTIFIER_KIND.CONTRACT_NUMBER, value },
        reason: `O contrato ${value} já foi confirmado como da empresa; a consulta busca publicações, `
          + 'aditivos e atos relacionados a ele.',
        expectedRelationship: RELATIONSHIP_TYPE.CONTRACTOR,
        falsePositiveRisk: FALSE_POSITIVE_RISK.LOW,
      });
    }
  }

  for (const processNumber of knownProcesses.slice(0, MAX_KNOWN_PROCESSES)) {
    const value = String(processNumber ?? '').trim();
    if (!value) continue;
    for (const provider of providersFor(SEARCH_CATEGORY.PROCESSOS)) {
      push({
        query: value,
        provider,
        category: SEARCH_CATEGORY.PROCESSOS,
        priority: QUERY_PRIORITY.HIGH,
        priorityRationale: 'Numeração processual única: identificador exato, sem ambiguidade possível.',
        subject,
        identifier: { kind: IDENTIFIER_KIND.PROCESS_NUMBER, value },
        reason: `Enriquecimento do processo ${value}, já identificado por outra fonte, com os dados `
          + 'oficiais do tribunal.',
        expectedRelationship: RELATIONSHIP_TYPE.PARTY,
        falsePositiveRisk: FALSE_POSITIVE_RISK.LOW,
      });
    }
  }

  // ---------------------------------------------------------------
  // 5. Deduplicação, tetos e ordenação.
  // ---------------------------------------------------------------
  const deduplicated = deduplicate(queries);
  const ordered = deduplicated.sort((left, right) => {
    const byPriority = PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority];
    if (byPriority) return byPriority;
    if (left.category !== right.category) return left.category.localeCompare(right.category);
    return left.query.localeCompare(right.query);
  });

  const perCategory = new Map();
  const retained = [];
  const truncated = [];
  for (const query of ordered) {
    const count = perCategory.get(query.category) || 0;
    if (count >= MAX_QUERIES_PER_CATEGORY || retained.length >= MAX_QUERIES_TOTAL) {
      truncated.push(query);
      continue;
    }
    perCategory.set(query.category, count + 1);
    retained.push(query);
  }

  const byCategory = {};
  for (const query of retained) {
    if (!byCategory[query.category]) byCategory[query.category] = [];
    byCategory[query.category].push(query);
  }

  return {
    generatedAt,
    entity: {
      entityId: profile.entityId,
      cnpj: profile.cnpj || null,
      cnpjNormalized: cnpj || null,
      razaoSocial: razao || null,
      nomeFantasia: fantasia || null,
      municipio,
      uf,
      socios: profile.socios.length,
      administradores: profile.administradores.length,
    },
    queries: retained,
    byCategory,
    // O que a matriz decidiu não gerar, e por quê. Uma matriz que esconde os
    // próprios cortes não é auditável.
    skipped,
    truncated: truncated.map((query) => ({
      category: query.category,
      query: query.query,
      priority: query.priority,
      motivo: 'Teto de consultas por categoria ou total da matriz.',
    })),
    resumo: {
      total: retained.length,
      porCategoria: Object.fromEntries(
        Object.entries(byCategory).map(([category, items]) => [category, items.length]),
      ),
      porPrioridade: Object.fromEntries(
        Object.values(QUERY_PRIORITY).map((priority) => [
          priority,
          retained.filter((query) => query.priority === priority).length,
        ]),
      ),
      geradasAntesDaDeduplicacao: queries.length,
      duplicatasFundidas: queries.length - deduplicated.length,
      truncadas: truncated.length,
      executaveisAgora: retained.filter((query) => query.providerImplemented).length,
      // Repetido de propósito no resumo: é o dado que impede alguém de ler a
      // matriz como se as fontes já tivessem sido consultadas.
      executadas: 0,
    },
    limitacao: 'Esta matriz descreve as consultas planejadas para a entidade. Nenhuma foi executada: '
      + 'o estado de cada consulta é PLANNED e nenhuma fonte deve ser considerada consultada com base '
      + 'nela. A confirmação de identidade de qualquer resultado permanece a cargo da camada de '
      + 'resolução de identidade, após a execução.',
  };
}

/**
 * Registra o resultado da execução de uma consulta.
 *
 * Única porta pela qual uma consulta deixa de ser planejada. Existe para que o
 * `sourceStatus` da Fase 2 só apareça acompanhado de uma execução real.
 *
 * @param {object} query consulta da matriz.
 * @param {string} sourceStatus valor de `SOURCE_STATUS`.
 */
function applyExecutionResult(query, sourceStatus) {
  return {
    ...query,
    status: QUERY_STATUS.EXECUTED,
    sourceStatus,
    executedAt: new Date().toISOString(),
  };
}

module.exports = {
  generateSearchMatrix,
  applyExecutionResult,
  deduplicate,
  semanticKey,
  corporateNameRisk,
  termFalsePositiveRisk,
  providersFor,
  buildQuery,
  CONTRACT_MEDIA_TERMS,
};
