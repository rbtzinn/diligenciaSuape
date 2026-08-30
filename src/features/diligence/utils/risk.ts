// ==========================================================
// DILIGÊNCIA 360 — Motor de Exposição e Atenção (v2.0)
// Mede necessidade de diligência; não declara culpa ou irregularidade.
// ==========================================================

import {
  AdverseMediaSummary,
  CompanyData,
  CorporateNetworkSummary,
  FundNetworkSummary,
  GovernanceHistoryResult,
  OfficialGazetteSummary,
  OffshoreSummary,
  PepPartnerResult,
  PersonSanctionsSummary,
  ProcessDiscovery,
  RiskAssessment,
  RiskDetail,
  SanctionsResult,
} from '../types';

export interface RiskInput {
  empresa: CompanyData;
  ceis?: SanctionsResult;
  cnep?: SanctionsResult;
  personSanctions?: PersonSanctionsSummary;
  pepResults: PepPartnerResult[];
  adverseMedia?: AdverseMediaSummary;
  corporateNetwork?: CorporateNetworkSummary;
  fundNetwork?: FundNetworkSummary;
  offshore?: OffshoreSummary;
  officialGazettes?: OfficialGazetteSummary;
  discoveries?: ProcessDiscovery[];
  governanceHistory?: GovernanceHistoryResult;
}

const COMPANY_NAME_PATTERN = /\b(LTDA|LIMITADA|S\.?A\.?|EIRELI|FUNDO|FIP|HOLDING|PARTICIPA(?:C|Ç)(?:AO|ÕES|OES))\b/i;
const SERIOUS_MEDIA_TERMS = [
  'corrupcao', 'fraude', 'lavagem', 'propina', 'cartel', 'superfaturamento',
  'direcionamento', 'favorecimento', 'investigacao', 'denuncia', 'operacao policial',
  'organizacao criminosa', 'improbidade', 'desvio', 'conluio', 'irregularidade',
];
const OVERLAP_MEDIA_TERMS = [
  'mesmo endereco', 'mesma sede', 'mesmo telefone', 'mesmos advogados',
  'mesmo advogado', 'mesmos socios', 'grupo economico', 'controlada pelo',
  'vinculada ao', 'empresa relacionada', 'acoes identicas', 'acao identica',
  'acoes semelhantes', 'mesmo tributo', 'mesmo dia', 'mesmo escritorio',
  'mesmos representantes', 'mesma representacao',
];
const PUBLIC_CONTRACT_TERMS = [
  'licitacao', 'contrato publico', 'dispensa de licitacao', 'pregao',
  'recursos publicos', 'contratacao publica', 'milhoes', 'administracao publica',
];

function normalize(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const date = br
    ? new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAddress(company?: CompanyData): string {
  if (!company?.logradouro || !company?.numero) return '';
  return normalize([
    company.logradouro,
    company.numero,
    company.complemento,
    company.bairro,
    company.cep,
  ].filter(Boolean).join(' '));
}

function getPhone(company?: CompanyData): string {
  const phone = String(company?.ddd_telefone_1 || '').replace(/\D/g, '');
  return phone.length >= 8 ? phone : '';
}

function getEmail(company?: CompanyData): string {
  const email = String(company?.email || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function classification(score: number): Omit<RiskAssessment, 'score' | 'detalhes'> {
  if (score <= 14) {
    return {
      nivel: 'Atenção Baixa',
      cor: 'low',
      emoji: '🟢',
      decisao: 'Prosseguir com Monitoramento Ordinário',
      decisaoDesc: 'A exposição identificada é baixa, considerando também as limitações declaradas das fontes consultadas.',
      automaticScore: score,
      methodologyVersion: 'v2.0-exposure',
    };
  }
  if (score <= 34) {
    return {
      nivel: 'Atenção Moderada',
      cor: 'medium',
      emoji: '🟡',
      decisao: 'Realizar Análise Complementar',
      decisaoDesc: 'Há sinais, hipóteses ou lacunas que aumentam a exposição e precisam ser documentados antes da decisão.',
      automaticScore: score,
      methodologyVersion: 'v2.0-exposure',
    };
  }
  if (score <= 59) {
    return {
      nivel: 'Atenção Elevada',
      cor: 'high',
      emoji: '🟠',
      decisao: 'Aprofundar a Diligência',
      decisaoDesc: 'A combinação de vínculos, ocorrências ou incertezas representa exposição relevante para o Compliance.',
      automaticScore: score,
      methodologyVersion: 'v2.0-exposure',
    };
  }
  return {
    nivel: 'Atenção Crítica',
    cor: 'critical',
    emoji: '🔴',
    decisao: 'Submeter ao Comitê de Riscos',
    decisaoDesc: 'A exposição acumulada exige decisão formal, medidas de mitigação e validação humana antes de avançar.',
    automaticScore: score,
    methodologyVersion: 'v2.0-exposure',
  };
}

export function calculateRisk(dados: RiskInput): RiskAssessment {
  let score = 0;
  const detalhes: RiskDetail[] = [];

  const add = (
    criterio: string,
    pontos: number,
    info: string,
    categoria: RiskDetail['categoria'],
    natureza: RiskDetail['natureza'] = 'indicator',
    confianca: RiskDetail['confianca'] = 'media',
  ) => {
    const applied = Math.max(0, Math.round(pontos));
    if (applied === 0) return;
    score += applied;
    detalhes.push({ criterio, pontos: applied, info, categoria, natureza, confianca, requerRevisao: natureza !== 'confirmed' });
  };

  const situation = normalize(dados.empresa.descricao_situacao_cadastral).toUpperCase();
  if (situation && situation !== 'ATIVA') {
    add('Situação cadastral diferente de ativa', 35, `Situação informada pela Receita: ${situation}.`, 'CADASTRAL', 'confirmed', 'alta');
  }

  const openingDate = parseDate(dados.empresa.data_inicio_atividade);
  if (openingDate) {
    const ageYears = (Date.now() - openingDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears < 1) add('Empresa com menos de um ano', 12, `Início de atividade: ${dados.empresa.data_inicio_atividade}.`, 'CADASTRAL', 'indicator', 'alta');
    else if (ageYears < 2) add('Empresa com menos de dois anos', 7, `Início de atividade: ${dados.empresa.data_inicio_atividade}.`, 'CADASTRAL', 'indicator', 'alta');
  }

  const applySanctions = (source: 'CEIS' | 'CNEP', result?: SanctionsResult) => {
    if (!result || result.semChave || !result.ok) {
      add(`${source} não pôde ser verificado`, 6, 'A ausência de cobertura impede descartar sanções nesta execução.', 'COBERTURA', 'coverage', 'alta');
      return;
    }
    const active = Array.isArray(result.registros)
      ? result.registros.filter((item) => item.vigente === true).length
      : (result.encontrado ? result.quantidade : 0);
    const historical = Math.max(0, (result.quantidade || 0) - active);
    if (active > 0) add(`Sanção vigente no ${source}`, Math.min(48, 38 + ((active - 1) * 5)), `${active} registro(s) vigente(s).`, 'INTEGRIDADE', 'confirmed', 'alta');
    if (historical > 0) add(`Histórico de sanção no ${source}`, Math.min(20, 10 + ((historical - 1) * 3)), `${historical} registro(s) histórico(s), ainda relevantes para análise de recorrência.`, 'INTEGRIDADE', 'confirmed', 'alta');
  };
  applySanctions('CEIS', dados.ceis);
  applySanctions('CNEP', dados.cnep);

  // Sócios pessoa física nos mesmos cadastros. A busca é nominal, então
  // nenhum resultado é tratado como confirmado: mesmo o índice máximo
  // permanece hipótese até a validação documental da identidade.
  const personSanctions = dados.personSanctions;
  if (personSanctions && personSanctions.coverageStatus !== 'NOT_APPLICABLE') {
    if (personSanctions.coverageStatus === 'UNAVAILABLE') {
      add(
        'Sanções dos sócios não puderam ser verificadas',
        6,
        'Os sócios pessoa física não foram rastreados em CEIS e CNEP nesta execução.',
        'COBERTURA', 'coverage', 'alta',
      );
    } else {
      if (personSanctions.coverageStatus === 'PARTIAL') {
        add(
          'Cobertura incompleta das sanções dos sócios',
          4,
          personSanctions.aviso || 'Parte dos sócios não pôde ser verificada.',
          'COBERTURA', 'coverage', 'alta',
        );
      }
      const strong = personSanctions.strongCandidates || 0;
      const weak = Math.max(0, (personSanctions.totalCandidates || 0) - strong);
      if (strong > 0) {
        add(
          'Sócio pessoa física com correspondência forte em cadastro de sanção',
          Math.min(30, 18 + ((strong - 1) * 6)),
          `${strong} correspondência(s) com nome e CPF mascarado compatíveis em CEIS/CNEP. A identidade ainda exige validação documental.`,
          'PESSOAS_RELACIONADAS', 'uncertainty', 'media',
        );
      }
      if (weak > 0) {
        add(
          'Sócio pessoa física com homônimo em cadastro de sanção',
          Math.min(10, 4 + ((weak - 1) * 2)),
          `${weak} coincidência(s) apenas nominal(is), sem CPF mascarado compatível. Homônimos são frequentes.`,
          'PESSOAS_RELACIONADAS', 'uncertainty', 'baixa',
        );
      }
    }
  }

  const pepMatches = (dados.pepResults || []).filter((item) => item.encontrado);
  const pepUnavailable = (dados.pepResults || []).filter((item) => item.semChave || !item.ok).length;
  if (pepMatches.length > 0) {
    add(
      'Correspondência nominal PEP em integrante do QSA',
      Math.min(24, 8 + ((pepMatches.length - 1) * 5)),
      `${pepMatches.length} integrante(s) possuem candidato nominal na base oficial. É risco de exposição política, com identidade pendente de validação.`,
      'PESSOAS_RELACIONADAS',
      'uncertainty',
      'media',
    );
  }
  if (pepUnavailable > 0) {
    add('Cobertura PEP incompleta', Math.min(8, 3 + pepUnavailable), `${pepUnavailable} integrante(s) não puderam ser verificados integralmente.`, 'COBERTURA', 'coverage', 'alta');
  }

  const shareholders = dados.empresa.qsa || [];
  const companyShareholders = shareholders.filter((shareholder) => {
    const document = String(shareholder.cnpj_cpf_do_socio || '').replace(/\D/g, '');
    return document.length === 14 || COMPANY_NAME_PATTERN.test(shareholder.nome_socio || '');
  });
  if (companyShareholders.length > 0) {
    add(
      'Pessoa jurídica ou fundo no quadro societário',
      Math.min(20, 8 + ((companyShareholders.length - 1) * 4)),
      `${companyShareholders.length} sócio(s) empresarial(is) exigem expansão da cadeia até os beneficiários e administradores finais.`,
      'ESTRUTURA_SOCIETARIA',
      'indicator',
      'alta',
    );
  }
  if (shareholders.length > 6) {
    add('Estrutura societária extensa', shareholders.length > 10 ? 8 : 4, `${shareholders.length} sócios ou administradores ampliam a superfície de verificação.`, 'ESTRUTURA_SOCIETARIA', 'indicator', 'alta');
  }

  const network = dados.corporateNetwork;
  if (network?.ok) {
    const relatedCompanies = network.companies || [];
    const relationships = network.relationships || [];
    if (relatedCompanies.length > 0) {
      add(
        'Cadeia de empresas relacionadas identificada',
        Math.min(18, 6 + (relatedCompanies.length * 2)),
        `${relatedCompanies.length} empresa(s) e ${relationships.length} vínculo(s) societário(s) foram expandidos até o segundo nível.`,
        'REDE_EMPRESARIAL',
        'indicator',
        'alta',
      );
    }
    if (relatedCompanies.some((item) => item.depth >= 2)) {
      add('Estrutura societária em múltiplas camadas', 6, 'A cadeia alcança pelo menos o segundo nível empresarial.', 'REDE_EMPRESARIAL', 'indicator', 'alta');
    }

    const rootAddress = getAddress(dados.empresa);
    const rootPhone = getPhone(dados.empresa);
    const rootEmail = getEmail(dados.empresa);
    const sameAddress = relatedCompanies.filter((item) => rootAddress && getAddress(item.company) === rootAddress);
    const samePhone = relatedCompanies.filter((item) => rootPhone && getPhone(item.company) === rootPhone);
    const sameEmail = relatedCompanies.filter((item) => rootEmail && getEmail(item.company) === rootEmail);
    if (sameAddress.length > 0) add('Endereço compartilhado entre empresas relacionadas', Math.min(16, 8 + ((sameAddress.length - 1) * 3)), `${sameAddress.length} empresa(s) relacionada(s) utilizam o mesmo endereço cadastral da analisada.`, 'SOBREPOSICAO_OPERACIONAL', 'indicator', 'alta');
    if (samePhone.length > 0) add('Telefone compartilhado entre empresas relacionadas', Math.min(14, 7 + ((samePhone.length - 1) * 3)), `${samePhone.length} empresa(s) relacionada(s) utilizam o mesmo contato telefônico.`, 'SOBREPOSICAO_OPERACIONAL', 'indicator', 'alta');
    if (sameEmail.length > 0) add('E-mail compartilhado entre empresas relacionadas', Math.min(10, 5 + ((sameEmail.length - 1) * 2)), `${sameEmail.length} empresa(s) relacionada(s) utilizam o mesmo e-mail cadastral.`, 'SOBREPOSICAO_OPERACIONAL', 'indicator', 'alta');
    const overlapKinds = [sameAddress.length, samePhone.length, sameEmail.length].filter((count) => count > 0).length;
    if (overlapKinds >= 2) add('Convergência de identificadores operacionais', 8, `${overlapKinds} tipos de contato ou localização coincidem, elevando o risco de baixa independência operacional.`, 'SOBREPOSICAO_OPERACIONAL', 'uncertainty', 'alta');
    if (network.consultaParcial || (network.failures || 0) > 0) add('Expansão societária incompleta', 5, `${network.failures || 0} empresa(s) relacionada(s) não puderam ser consultadas.`, 'COBERTURA', 'coverage', 'alta');
  } else {
    add('Rede societária não pôde ser expandida', 6, network?.erro || 'Não foi possível verificar empresas relacionadas nesta execução.', 'COBERTURA', 'coverage', 'alta');
  }

  const fund = dados.fundNetwork;
  if (fund?.applicable) {
    add('Estrutura de fundo de investimento', 6, 'Gestor, administrador, cotistas e empresas investidas precisam ser analisados em conjunto.', 'ESTRUTURA_SOCIETARIA', 'indicator', 'alta');
    if ((fund.expandedCompanies || 0) > 0) add('Empresas vinculadas ao fundo', Math.min(12, 4 + ((fund.expandedCompanies || 0) * 2)), `${fund.expandedCompanies} empresa(s) relacionada(s) foram expandidas na rede regulatória.`, 'REDE_EMPRESARIAL', 'indicator', 'alta');
    const hasNaturalPerson = (fund.entities || []).some((entity) => normalize(entity.type).includes('person'));
    if (!hasNaturalPerson) add('Beneficiário final não visível na rede pública', 9, 'A estrutura pública consultada não revelou pessoa natural como beneficiário final; solicite declaração de beneficiários e conflitos.', 'TRANSPARENCIA', 'uncertainty', 'media');
    if (!fund.ok || fund.consultaParcial) add('Cobertura regulatória do fundo incompleta', 6, fund.aviso || fund.erro || 'Parte da estrutura regulatória não pôde ser expandida.', 'COBERTURA', 'coverage', 'alta');
  }

  const media = dados.adverseMedia;
  if (!media || media.semChave || !media.ok) {
    add('Pesquisa de mídia indisponível', 7, media?.aviso || 'Não foi possível pesquisar ocorrências da empresa e de seus integrantes.', 'COBERTURA', 'coverage', 'alta');
  } else {
    const activeResults = Array.from(new Map(
      (media.results || [])
        .filter((item) => item.status !== 'discarded' && item.riskRelevant !== false)
        .map((item) => [item.url || item.id, item]),
    ).values());
    let mediaPoints = 0;
    const mediaReasons: string[] = [];
    const convergenceSignals: Array<{ title: string; signals: string[]; publicContext: boolean }> = [];
    for (const item of activeResults) {
      const text = normalize(`${item.title} ${item.snippet} ${(item.categories || []).join(' ')}`);
      const overlapMatches = OVERLAP_MEDIA_TERMS.filter((term) => text.includes(term));
      const publicContext = hasAny(text, PUBLIC_CONTRACT_TERMS);
      let itemPoints = item.matchStrength === 'high' ? 8 : item.matchStrength === 'medium' ? 5 : 2;
      if (item.status === 'validated') itemPoints += 3;
      if (item.identityStatus === 'documented-entity' || item.companyMatch?.cnpj) itemPoints += 2;
      if (item.subjectType === 'person') itemPoints += 1;
      if (hasAny(text, SERIOUS_MEDIA_TERMS)) itemPoints += 5;
      if (overlapMatches.length > 0) itemPoints += 5;
      if (publicContext) itemPoints += 2;
      if (overlapMatches.length >= 2) convergenceSignals.push({ title: item.title, signals: overlapMatches, publicContext });
      const available = Math.max(0, 32 - mediaPoints);
      const applied = Math.min(14, itemPoints, available);
      if (applied <= 0) break;
      mediaPoints += applied;
      mediaReasons.push(`${item.title} (+${applied})`);
    }
    if (mediaPoints > 0) {
      add(
        'Ocorrências públicas sobre a empresa ou pessoas relacionadas',
        mediaPoints,
        `${activeResults.length} resultado(s) não descartado(s). Principais sinais: ${mediaReasons.slice(0, 3).join(' · ')}. A pontuação representa exposição reputacional, não confirmação dos fatos narrados.`,
        'MIDIA_REPUTACIONAL',
        'uncertainty',
        activeResults.some((item) => item.matchStrength === 'high') ? 'alta' : 'media',
      );
    }
    const peopleWithRiskRelevant = media.peopleWithRiskRelevant
      ?? (media.results || []).filter((item) => item.subjectType === 'person' && item.riskRelevant !== false).length;
    if (peopleWithRiskRelevant > 0) add('Pessoas do QSA com ocorrências públicas', Math.min(8, 3 + peopleWithRiskRelevant), peopleWithRiskRelevant + ' integrante(s) possuem conteúdo candidato associado ao nome e com termo de atenção.', 'PESSOAS_RELACIONADAS', 'uncertainty', 'media');
    if (convergenceSignals.length > 0) {
      const strongest = convergenceSignals.sort((a, b) => b.signals.length - a.signals.length)[0];
      const convergencePoints = Math.min(
        24,
        (strongest.signals.length >= 3 ? 18 : 12)
          + (strongest.publicContext ? 4 : 0)
          + Math.min(2, convergenceSignals.length - 1) * 2,
      );
      add(
        'Possível coordenação operacional entre empresas relacionadas',
        convergencePoints,
        `Conteúdo público reúne ${strongest.signals.length} sinais convergentes (${strongest.signals.join(', ')})${strongest.publicContext ? ' em contexto de contratação ou recursos públicos' : ''}. Coincidências de sede, representação e atos semelhantes podem indicar baixa independência operacional e justificam diligência reforçada; não confirmam grupo econômico de fato nem favorecimento.`,
        'SOBREPOSICAO_OPERACIONAL',
        'uncertainty',
        strongest.signals.length >= 3 ? 'alta' : 'media',
      );
    }
    if (media.consultaParcial || media.personSearchTruncated || media.personSearchCompleted === false) add('Pesquisa de mídia parcial', 5, 'Nem todas as pessoas ou consultas planejadas foram concluídas.', 'COBERTURA', 'coverage', 'alta');
  }

  const discoveries = (dados.discoveries || []).filter((item) => item.status !== 'discarded');
  if (discoveries.length > 0) {
    const processPoints = discoveries.reduce((total, item) => {
      const points = item.status === 'validated' ? 10 : item.status === 'enriched' ? 7 : 5;
      return Math.min(25, total + points);
    }, 0);
    add('Processos ou referências judiciais descobertos', processPoints, `${discoveries.length} referência(s) exigem classificação de polo, matéria, fase e materialidade.`, 'JUDICIAL', 'uncertainty', 'media');
  }

  const offshore = dados.offshore;
  if (offshore?.ok && offshore.candidates.length > 0) {
    const offshorePoints = offshore.candidates.reduce((total, candidate) => {
      const points = candidate.score >= 90 ? 12 : candidate.score >= 70 ? 8 : 4;
      return Math.min(24, total + points);
    }, 0);
    add('Correspondência em base offshore', offshorePoints, `${offshore.candidates.length} candidato(s) nominais exigem validação documental e de identidade.`, 'OFFSHORE', 'uncertainty', 'media');
  } else if (offshore && !offshore.ok) {
    add('Consulta offshore indisponível', 4, offshore.erro || 'Não foi possível concluir a reconciliação nominal.', 'COBERTURA', 'coverage', 'alta');
  }

  if (dados.officialGazettes?.ok && dados.officialGazettes.totalFound > 0) {
    const strongMentions = (dados.officialGazettes.results || []).filter((item) => item.matchStrength === 'high').length;
    add('Presença em Diários Oficiais', Math.min(5, 1 + strongMentions), `${dados.officialGazettes.totalFound} edição(ões) mencionam a entidade. Revise objeto, órgão e natureza de cada publicação.`, 'CONTRATOS_PUBLICOS', 'indicator', 'alta');
  } else if (dados.officialGazettes && !dados.officialGazettes.ok) {
    add('Diários Oficiais indisponíveis', 4, dados.officialGazettes.erro || 'A cobertura documental oficial não foi concluída.', 'COBERTURA', 'coverage', 'alta');
  }

  const governance = dados.governanceHistory;
  if (governance?.applicable) {
    if (!governance.ok || governance.coverageStatus === 'unavailable') add('Histórico de governança indisponível', 6, governance.aviso || governance.erro || 'Não foi possível verificar os cinco exercícios.', 'COBERTURA', 'coverage', 'alta');
    else if (governance.coverageStatus === 'partial') add('Histórico de governança parcial', 4, 'Parte dos últimos cinco exercícios não possui cobertura completa.', 'COBERTURA', 'coverage', 'alta');
    if ((governance.members || []).length > 10) add('Alta rotatividade ou amplitude de governança', 6, `${governance.members.length} pessoas distintas aparecem nos exercícios consultados.`, 'GOVERNANCA', 'indicator', 'media');
  }

  const finalScore = Math.min(100, score);
  const result = classification(finalScore);
  return {
    score: finalScore,
    ...result,
    automaticScore: finalScore,
    detalhes,
  };
}
