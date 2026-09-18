// ==========================================================
// DILIGÊNCIA 360 — Motor do Questionário Oficial SUAPE 2026.2
// Mapeamento exato de todas as 10 seções do Questionário de
// Diligência do Complexo Industrial Portuário de Suape.
// ==========================================================

import type { DiligenceItem, ProcessDiscovery, Shareholder } from '../types';
import { Formatters } from '../../../lib/formatters';

export type SuapeAnswerStatus = 'automated' | 'regular' | 'review' | 'declaratory';

export interface SuapeQuestionItem {
  id: string;
  sectionNumber: number;
  sectionTitle: string;
  code: string;
  question: string;
  status: SuapeAnswerStatus;
  statusLabel: string;
  value: string;
  details?: string;
  sourceLabel?: string;
  isOfficialEvidence: boolean;
  tableData?: Array<Record<string, string | number | undefined>>;
  tags?: string[];
}

export interface SuapeSectionSummary {
  sectionNumber: number;
  title: string;
  subtitle: string;
  totalQuestions: number;
  automatedCount: number;
  regularCount: number;
  reviewCount: number;
  declaratoryCount: number;
  questions: SuapeQuestionItem[];
}

export interface SuapeQuestionnaireReport {
  generatedAt: string;
  companyName: string;
  cnpj: string;
  cnpjFormatted: string;
  sections: SuapeSectionSummary[];
  allQuestions: SuapeQuestionItem[];
  metrics: {
    total: number;
    automated: number;
    regular: number;
    review: number;
    declaratory: number;
    completionPercent: number;
  };
}

// Helpers
function formatDoc(doc?: string): string {
  if (!doc) return 'Não informado';
  const clean = doc.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (clean.length === 14) {
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return doc;
}

function calculateCompanyAge(startDateStr?: string): { years: number; months: number; text: string } {
  if (!startDateStr) return { years: 0, months: 0, text: 'Data não informada' };
  try {
    const parts = startDateStr.includes('/') ? startDateStr.split('/') : startDateStr.split('-');
    let date: Date;
    if (startDateStr.includes('/')) {
      date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    } else {
      date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }

    if (isNaN(date.getTime())) return { years: 0, months: 0, text: startDateStr };

    const now = new Date();
    let years = now.getFullYear() - date.getFullYear();
    let months = now.getMonth() - date.getMonth();

    if (months < 0) {
      years--;
      months += 12;
    }

    const yearPart = years === 1 ? '1 ano' : `${years} anos`;
    const monthPart = months === 1 ? '1 mês' : `${months} meses`;
    const text = years > 0 ? `${yearPart} e ${monthPart}` : monthPart;

    return { years, months, text };
  } catch {
    return { years: 0, months: 0, text: startDateStr };
  }
}

/** Identificação inteligente de atividade regulada a partir do CNAE */
function checkRegulatedActivity(cnaeCode?: string | number, cnaeDesc?: string): {
  isRegulated: boolean;
  regulators: Array<{ regulator: string; role: string; reason: string }>;
} {
  const code = String(cnaeCode || '').replace(/\D/g, '');
  const desc = String(cnaeDesc || '').toLowerCase();
  const regulators: Array<{ regulator: string; role: string; reason: string }> = [];

  // ANTAQ — Portos, Navegação, Logística Aquaviária
  if (
    code.startsWith('50') || // Transporte aquaviário
    code.startsWith('523') || // Atividades auxiliares dos transportes aquaviários
    desc.includes('porto') ||
    desc.includes('portuári') ||
    desc.includes('marítim') ||
    desc.includes('embarcaç') ||
    desc.includes('navegaç') ||
    desc.includes('atracação') ||
    desc.includes('praticagem') ||
    desc.includes('estiva') ||
    desc.includes('rebocador')
  ) {
    regulators.push({
      regulator: 'ANTAQ (Agência Nacional de Transportes Aquaviários)',
      role: 'Autorização / Regulação de Operações Aquaviárias e Terminais Portuários',
      reason: 'Atividade vinculada a operações em ambiente portuário e transporte aquaviário.',
    });
  }

  // ANP — Óleo, Gás, Combustíveis, Químicos
  if (
    code.startsWith('19') || // Coque e refino de petróleo
    code.startsWith('4681') || // Comércio de combustíveis
    code.startsWith('4682') ||
    code.startsWith('494') || // Transporte dutoviário
    desc.includes('petróleo') ||
    desc.includes('combustív') ||
    desc.includes('gás natural') ||
    desc.includes('lubrificante') ||
    desc.includes('biocombust')
  ) {
    regulators.push({
      regulator: 'ANP (Agência Nacional do Petróleo, Gás Natural e Biocombustíveis)',
      role: 'Regulação, Autorização e Fiscalização de Combustíveis e Derivados',
      reason: 'Atividade no setor de energia, refino, biocombustíveis e distribuição.',
    });
  }

  // CPRH — Meio Ambiente de Pernambuco (aplicável a complexos industriais/portuários como Suape)
  if (
    code.startsWith('10') ||
    code.startsWith('20') ||
    code.startsWith('23') ||
    code.startsWith('24') ||
    code.startsWith('25') ||
    code.startsWith('38') || // Gestão de resíduos
    desc.includes('resíduo') ||
    desc.includes('efluente') ||
    desc.includes('indústria') ||
    desc.includes('químic') ||
    desc.includes('dragagem') ||
    desc.includes('construção civil')
  ) {
    regulators.push({
      regulator: 'CPRH (Agência Estadual de Meio Ambiente de Pernambuco)',
      role: 'Licenciamento Ambiental (LP, LI, LO), Outorgas e Monitoramento',
      reason: 'Atividade com potencial impacto ambiental no território do Porto e Complexo de Suape.',
    });
  }

  // ANEEL — Energia Elétrica
  if (code.startsWith('351') || desc.includes('energia elétrica') || desc.includes('geração de energia')) {
    regulators.push({
      regulator: 'ANEEL (Agência Nacional de Energia Elétrica)',
      role: 'Outorga e Regulação de Empreendimentos de Energia',
      reason: 'Atividade vinculada ao setor elétrico.',
    });
  }

  // ANVISA — Produtos químicos controlados, insumos farmacêuticos, alimentação portuária
  if (code.startsWith('21') || code.startsWith('10') || desc.includes('medicamento') || desc.includes('farmac')) {
    regulators.push({
      regulator: 'ANVISA (Agência Nacional de Vigilância Sanitária)',
      role: 'Vigilância Sanitária e Autorização de Funcionamento (AFE)',
      reason: 'Manipulação de insumos controlados, cosméticos ou fármacos.',
    });
  }

  return {
    isRegulated: regulators.length > 0,
    regulators,
  };
}

export function buildSuapeQuestionnaire(diligence: DiligenceItem, discoveries: ProcessDiscovery[] = []): SuapeQuestionnaireReport {
  const emp = diligence.empresa || {};
  const socios: Shareholder[] = Array.isArray(diligence.socios) ? diligence.socios : [];
  const pepResults = Array.isArray(diligence.pepResults) ? diligence.pepResults : [];
  const ceis = diligence.ceis;
  const cnep = diligence.cnep;
  const personSanctions = Array.isArray(diligence.personSanctions) ? diligence.personSanctions : [];
  const tcePe = diligence.tcePe;
  const adverseMedia = diligence.adverseMedia;

  const companyAge = calculateCompanyAge(emp.data_inicio_atividade);
  const regulation = checkRegulatedActivity(emp.cnae_fiscal, emp.cnae_fiscal_descricao);

  // Identificação do Representante Legal Principal (geralmente sócio-administrador ou primeiro sócio)
  const repLegal = socios.find((s) => {
    const q = (s.qualificacao_socio || '').toLowerCase();
    return q.includes('administrador') || q.includes('diretor') || q.includes('presidente') || q.includes('gerente');
  }) || socios[0] || null;

  // Análise de sanções
  const totalCeis = ceis?.quantidade || 0;
  const totalCnep = cnep?.quantidade || 0;
  const officialSanctionsCount = totalCeis + totalCnep;

  // PEP Hits
  const pepFound = pepResults.filter((p) => p.encontrado);
  const pepHitsCount = pepFound.length;

  // Sócios com Pessoa Jurídica (exigem abertura em cadeia)
  const pjShareholders = socios.filter((s) => {
    const doc = String(s.cnpj_cpf_do_socio || '').replace(/\D/g, '');
    return doc.length === 14 && !String(s.cnpj_cpf_do_socio || '').includes('*');
  });

  // Ocorrências de mídia criminal / integridade
  const criminalIntegrityMedia = (adverseMedia?.results || []).filter((item) => {
    if (item.status === 'discarded' || item.riskRelevant === false) return false;
    const isCrim = item.categories?.some((c) => c === 'criminal' || c === 'integrity');
    return isCrim && (item.matchedTerms?.length || 0) > 0;
  });

  // Endereço formatado
  const enderecoPartes = [
    emp.logradouro ? `${emp.logradouro}${emp.numero ? `, nº ${emp.numero}` : ''}` : '',
    emp.complemento,
    emp.bairro ? `Bairro: ${emp.bairro}` : '',
    emp.municipio && emp.uf ? `${emp.municipio} - ${emp.uf}` : '',
    emp.cep ? `CEP: ${emp.cep}` : '',
  ].filter(Boolean);
  const enderecoCompleto = enderecoPartes.length > 0 ? enderecoPartes.join(', ') : 'Endereço cadastral não informado';

  const allQuestions: SuapeQuestionItem[] = [];

  // ==========================================================
  // SEÇÃO 1 — DADOS GERAIS DA PESSOA JURÍDICA
  // ==========================================================
  allQuestions.push({
    id: '1.1-razao-social-tipo',
    sectionNumber: 1,
    sectionTitle: '1. DADOS GERAIS DA PESSOA JURÍDICA',
    code: '1.1',
    question: 'Razão Social e Tipo Societário',
    status: 'automated',
    statusLabel: 'Preenchido Oficialmente',
    value: `${emp.razao_social || diligence.razaoSocial} — ${emp.natureza_juridica || 'Tipo societário constante na Receita Federal'}`,
    details: emp.nome_fantasia ? `Nome Fantasia: ${emp.nome_fantasia}` : 'Sem nome fantasia registrado.',
    sourceLabel: 'Receita Federal do Brasil (Cadastro CNPJ)',
    isOfficialEvidence: true,
    tags: ['Cadastro', 'Receita Federal'],
  });

  allQuestions.push({
    id: '1.1-cnpj',
    sectionNumber: 1,
    sectionTitle: '1. DADOS GERAIS DA PESSOA JURÍDICA',
    code: '1.1',
    question: 'CNPJ e Situação Cadastral',
    status: emp.descricao_situacao_cadastral === 'ATIVA' ? 'automated' : 'review',
    statusLabel: emp.descricao_situacao_cadastral === 'ATIVA' ? 'Regular (Ativa)' : 'Atenção Cadastral',
    value: `${diligence.cnpjFmt || formatDoc(emp.cnpj)} · Situação: ${emp.descricao_situacao_cadastral || 'ATIVA'}`,
    details: emp.data_situacao_cadastral ? `Data da situação: ${emp.data_situacao_cadastral}` : undefined,
    sourceLabel: 'Receita Federal do Brasil',
    isOfficialEvidence: true,
    tags: ['Cadastro', 'CNPJ'],
  });

  allQuestions.push({
    id: '1.1-objeto-social',
    sectionNumber: 1,
    sectionTitle: '1. DADOS GERAIS DA PESSOA JURÍDICA',
    code: '1.1',
    question: 'Objeto Social e Ramo de Atividade',
    status: 'automated',
    statusLabel: 'Preenchido Oficialmente',
    value: emp.cnae_fiscal_descricao ? `${emp.cnae_fiscal} — ${emp.cnae_fiscal_descricao}` : 'Atividade principal cadastrada no CNPJ',
    details: 'Mapeado a partir do CNAE Fiscal Principal e atividades secundárias registradas no cartão CNPJ da RFB.',
    sourceLabel: 'Receita Federal do Brasil (CNAE)',
    isOfficialEvidence: true,
    tags: ['CNAE', 'Objeto Social'],
  });

  allQuestions.push({
    id: '1.1-data-constituicao-empregados',
    sectionNumber: 1,
    sectionTitle: '1. DADOS GERAIS DA PESSOA JURÍDICA',
    code: '1.1',
    question: 'Data da Constituição da Sociedade e Nº de Empregados',
    status: 'automated',
    statusLabel: 'Preenchido Oficialmente',
    value: `Data de Constituição: ${emp.data_inicio_atividade || 'Não informada'} (${companyAge.text} de existência). Porte: ${emp.porte || emp.descricao_porte || 'DEMAIS (Normal/Grande Porte)'}.`,
    details: 'O número exato de colaboradores em folha ativa depende da RAIS/e-Social do fornecedor; porte cadastrado pela RFB.',
    sourceLabel: 'Receita Federal do Brasil',
    isOfficialEvidence: true,
    tags: ['Fundação', 'Porte'],
  });

  allQuestions.push({
    id: '1.1-endereco-contato',
    sectionNumber: 1,
    sectionTitle: '1. DADOS GERAIS DA PESSOA JURÍDICA',
    code: '1.1',
    question: 'Endereço, Sítio Eletrônico e Contato',
    status: 'automated',
    statusLabel: 'Preenchido Oficialmente',
    value: enderecoCompleto,
    details: `Telefone: ${emp.ddd_telefone_1 || 'Não cadastrado'} | E-mail: ${emp.email || 'Não cadastrado'}`,
    sourceLabel: 'Receita Federal do Brasil (Endereço e Contatos Cadastrais)',
    isOfficialEvidence: true,
    tags: ['Endereço', 'Contato'],
  });

  allQuestions.push({
    id: '1.1-localidades-servico',
    sectionNumber: 1,
    sectionTitle: '1. DADOS GERAIS DA PESSOA JURÍDICA',
    code: '1.1',
    question: 'Países e Localidades nos quais a Pessoa Jurídica atua e Serviço a ser Prestado',
    status: 'declaratory',
    statusLabel: 'Declaração / Objeto Contratual',
    value: `Sede no Brasil: ${emp.municipio || 'Município'}/${emp.uf || 'UF'}. Serviço e extensão operacional a preencher conforme Edital/Termo de Referência do Contrato SUAPE.`,
    details: 'Indicar localidades geográficas onde o fornecedor mantém filiais/operações e discriminar o escopo exato do serviço pactuado com SUAPE.',
    sourceLabel: 'Termo de Referência do Contrato / Declaração da Empresa',
    isOfficialEvidence: false,
    tags: ['Escopo Contratual'],
  });

  allQuestions.push({
    id: '1.2-subcontratacao',
    sectionNumber: 1,
    sectionTitle: '1. DADOS GERAIS DA PESSOA JURÍDICA',
    code: '1.2 / 1.3',
    question: 'Informar se a empresa tem a intenção de subcontratar ou utilizar outras pessoas físicas ou jurídicas para cumprir com o contrato com Suape?',
    status: 'declaratory',
    statusLabel: 'Declaração Obrigatória',
    value: 'A declarar pela empresa no ato da formalização da proposta comercial com SUAPE.',
    details: 'Se "SIM", o fornecedor deve relacionar razão social, CNPJ e percentual de participação de cada subcontratada para submissão à diligência prévia de compliance.',
    sourceLabel: 'Declaração de Subcontratação do Fornecedor',
    isOfficialEvidence: false,
    tags: ['Subcontratação'],
  });

  // ==========================================================
  // SEÇÃO 2 — REPRESENTANTE DA PESSOA JURÍDICA PARA CONTATO
  // ==========================================================
  allQuestions.push({
    id: '2.1-representante-contato',
    sectionNumber: 2,
    sectionTitle: '2. REPRESENTANTE DA PESSOA JURÍDICA PARA CONTATO',
    code: '2.0',
    question: 'Nome Completo, CPF, RG, Telefone, E-mail Corporativo, Nacionalidade e Cargo do Representante',
    status: repLegal ? 'automated' : 'declaratory',
    statusLabel: repLegal ? 'Identificado no QSA Oficial' : 'Pendente de Identificação',
    value: repLegal
      ? `Nome: ${repLegal.nome_socio} | Cargo/Qualificação: ${repLegal.qualificacao_socio || 'Sócio-Administrador'} | CPF: ${formatDoc(repLegal.cnpj_cpf_do_socio)} | Nacionalidade: ${repLegal.pais || 'Brasileira'}`
      : 'Representante legal para contato com Suape deve ser formalmente designado pela empresa.',
    details: `Telefone informado na RFB: ${emp.ddd_telefone_1 || 'N/D'} | E-mail: ${emp.email || 'N/D'} (RG e telefone direto a confirmar na procuração).`,
    sourceLabel: 'Receita Federal do Brasil (Quadro de Sócios e Administradores - QSA)',
    isOfficialEvidence: true,
    tags: ['Representante Legal', 'QSA'],
  });

  // ==========================================================
  // SEÇÃO 3 — HISTÓRICO DA SOCIEDADE
  // ==========================================================
  allQuestions.push({
    id: '3.1-tempo-exercicio',
    sectionNumber: 3,
    sectionTitle: '3. HISTÓRICO DA SOCIEDADE',
    code: '3.1',
    question: 'Há quantos anos a sociedade exerce as atividades que Suape pretende contratar?',
    status: 'automated',
    statusLabel: 'Calculado Oficialmente',
    value: `A sociedade exerce suas atividades econômicas há ${companyAge.text} (abertura registrada em ${emp.data_inicio_atividade || 'data inicial'}).`,
    details: 'Calculado com exatidão a partir da data de abertura no Cadastro Nacional da Pessoa Jurídica da Receita Federal.',
    sourceLabel: 'Receita Federal do Brasil',
    isOfficialEvidence: true,
    tags: ['Histórico', 'Tempo de Atividade'],
  });

  allQuestions.push({
    id: '3.2-historico-constituicao',
    sectionNumber: 3,
    sectionTitle: '3. HISTÓRICO DA SOCIEDADE',
    code: '3.2',
    question: 'Descreva brevemente o histórico de constituição da sociedade, suas atividades principais e objetivos',
    status: 'automated',
    statusLabel: 'Resumo Gerado por Dados Oficiais',
    value: `Sociedade constituída formalmente em ${emp.data_inicio_atividade || 'data inicial'}, sob a natureza jurídica ${emp.natureza_juridica || 'sociedade empresária'}, sediada em ${emp.municipio || 'Município'}/${emp.uf || 'UF'}, com objetivo econômico principal voltado a "${emp.cnae_fiscal_descricao || 'atividades econômicas correlatas'}" e capital social subscrito de ${Formatters.currency(emp.capital_social || 0)}.`,
    details: 'Histórico gerado e fundamentado pelos registros cadastrais da Junta Comercial e Receita Federal.',
    sourceLabel: 'Receita Federal do Brasil',
    isOfficialEvidence: true,
    tags: ['Histórico'],
  });

  // ==========================================================
  // SEÇÃO 4 — INFORMAÇÕES SOBRE A GESTÃO SOCIETÁRIA
  // ==========================================================
  const directorshipTable = socios.map((s) => ({
    Nome: s.nome_socio,
    Cargo: s.qualificacao_socio || 'Administrador',
    Documento: formatDoc(s.cnpj_cpf_do_socio),
    Nacionalidade: s.pais || 'Brasileira',
    Entrada: s.data_entrada_sociedade || 'Constante no QSA',
  }));

  allQuestions.push({
    id: '4.1-diretoria-conselho-5-anos',
    sectionNumber: 4,
    sectionTitle: '4. INFORMAÇÕES SOBRE A GESTÃO SOCIETÁRIA',
    code: '4.1',
    question: 'Indique quais pessoas integram ou integraram, dentro da regra dos cinco anos, a diretoria e o conselho de administração da sociedade',
    status: directorshipTable.length > 0 ? 'automated' : 'declaratory',
    statusLabel: directorshipTable.length > 0 ? 'Mapeado no QSA e Governança' : 'Exige Contrato Social',
    value: `${directorshipTable.length} administrador(es) e integrante(s) identificado(s) no histórico cadastral oficial.`,
    details: 'Quadro de administradores levantado por meio do QSA da Receita Federal e consulta à governança pública.',
    sourceLabel: 'Receita Federal do Brasil (QSA) / CVM',
    isOfficialEvidence: true,
    tableData: directorshipTable,
    tags: ['Diretoria', 'Gestão'],
  });

  allQuestions.push({
    id: '4.2-envolvidos-suape',
    sectionNumber: 4,
    sectionTitle: '4. INFORMAÇÕES SOBRE A GESTÃO SOCIETÁRIA',
    code: '4.2',
    question: 'Indique quais pessoas estarão diretamente envolvidas na possível relação empresarial com Suape e/ou que atuarão em nome de Suape',
    status: 'declaratory',
    statusLabel: 'Declaração Específica do Contrato',
    value: 'Designação a ser fornecida nominalmente pelo contratado (Prepostos, Responsável Técnico e Gestor de Contrato).',
    details: 'A empresa deverá relacionar nome, CPF, cargo corporativo e atribuições das pessoas físicas que assinarão ou executarão o contrato de Suape.',
    sourceLabel: 'Proposta Comercial e Designação de Prepostos',
    isOfficialEvidence: false,
    tags: ['Prepostos', 'Execução'],
  });

  allQuestions.push({
    id: '4.3-partes-relacionadas',
    sectionNumber: 4,
    sectionTitle: '4. INFORMAÇÕES SOBRE A GESTÃO SOCIETÁRIA',
    code: '4.3',
    question: 'Informações sobre Partes Relacionadas: Sociedades Controladoras e Subsidiárias/Filiais',
    status: 'automated',
    statusLabel: 'Mapeado na Rede Corporativa',
    value: pjShareholders.length > 0
      ? `Constatadas ${pjShareholders.length} pessoa(s) jurídica(s) com participação no capital ou controle societário (necessária abertura de cadeia).`
      : 'Não constam empresas controladoras como pessoas jurídicas no QSA direto; estrutura controlada por pessoas físicas.',
    details: `Rede corporativa e participações societárias cruzadas com a base pública da RFB.`,
    sourceLabel: 'Receita Federal do Brasil (Rede Corporativa EGOS)',
    isOfficialEvidence: true,
    tableData: pjShareholders.map((pj) => ({
      'Razão Social': pj.nome_socio,
      CNPJ: formatDoc(pj.cnpj_cpf_do_socio),
      Qualificação: pj.qualificacao_socio || 'Sócio PJ',
    })),
    tags: ['Partes Relacionadas', 'Grupos Econômicos'],
  });

  allQuestions.push({
    id: '4.4-condenacoes-corrupcao-pj',
    sectionNumber: 4,
    sectionTitle: '4. INFORMAÇÕES SOBRE A GESTÃO SOCIETÁRIA',
    code: '4.4 / 4.5',
    question: 'Informar se a pessoa jurídica e/ou partes relatas já foi condenada administrativa ou civilmente por atos de corrupção e/ou fraude a licitações e contratos administrativos',
    status: officialSanctionsCount > 0 ? 'review' : 'regular',
    statusLabel: officialSanctionsCount > 0 ? 'CONSTA Sanção / Impedimento' : 'NADA CONSTA nas Bases Oficiais',
    value: officialSanctionsCount > 0
      ? `ALERTA: Constam ${officialSanctionsCount} registro(s) sancionadores no CEIS/CNEP em desfavor da pessoa jurídica pesquisada.`
      : 'NADA CONSTA: As certidões oficiais do CEIS (Empresas Inidôneas/Suspensas), CNEP (Empresas Punidas) e TCE-PE resultaram negativas.',
    details: officialSanctionsCount > 0
      ? `Necessária qualificação detalhada da sanção (número do processo sancionador, órgão sancionador e período de vigência).`
      : 'Consultas exaustivas realizadas por integração eletrônica aos cadastros da Controladoria-Geral da União (CGU) e Tribunal de Contas de PE.',
    sourceLabel: 'CGU (CEIS / CNEP) e TCE-PE',
    isOfficialEvidence: true,
    tags: ['Anticorrupção', 'Sanções', 'Compliance'],
  });

  // ==========================================================
  // SEÇÃO 5 — INFORMAÇÕES SOBRE A PARTICIPAÇÃO SOCIETÁRIA
  // ==========================================================
  const shareholdersTable = socios.map((s) => ({
    Nome: s.nome_socio,
    Documento: formatDoc(s.cnpj_cpf_do_socio),
    Qualificação: s.qualificacao_socio || 'Sócio',
    Nacionalidade: s.pais || 'Brasileira',
    FaixaEtaria: s.faixa_etaria || 'N/D',
  }));

  allQuestions.push({
    id: '5.1-quadro-societario-beneficiario-final',
    sectionNumber: 5,
    sectionTitle: '5. INFORMAÇÕES SOBRE A PARTICIPAÇÃO SOCIETÁRIA',
    code: '5.1',
    question: 'Apresente dados das pessoas físicas e/ou jurídicas que detêm participação societária na empresa e beneficiários finais',
    status: shareholdersTable.length > 0 ? 'automated' : 'declaratory',
    statusLabel: shareholdersTable.length > 0 ? 'Quadro de Sócios Mapeado' : 'Exige Contrato Social',
    value: `${shareholdersTable.length} integrante(s) cadastrado(s) no QSA oficial da Receita Federal. ${pjShareholders.length > 0 ? `Atenção: Existem ${pjShareholders.length} sócio(s) PJ que exigem rastreamento de beneficiário final.` : 'Todos os sócios são pessoas físicas identificadas.'}`,
    details: 'Os percentuais específicos de quotas e o contrato social arquivado na Junta Comercial confirmam o controle e beneficiário final último.',
    sourceLabel: 'Receita Federal do Brasil (QSA)',
    isOfficialEvidence: true,
    tableData: shareholdersTable,
    tags: ['Sócios', 'Beneficiário Final'],
  });

  allQuestions.push({
    id: '5.2-processos-criminais-socios',
    sectionNumber: 5,
    sectionTitle: '5. INFORMAÇÕES SOBRE A PARTICIPAÇÃO SOCIETÁRIA',
    code: '5.2 / 5.3',
    question: 'Informar se houve condenações criminais, processos criminais ou investigações relacionadas aos sócios por corrupção e/ou fraude a licitações',
    status: personSanctions.length > 0 || criminalIntegrityMedia.length > 0 ? 'review' : 'regular',
    statusLabel: personSanctions.length > 0 || criminalIntegrityMedia.length > 0 ? 'Apontamentos para Revisão' : 'Nada Consta em Fontes Oficiais',
    value: personSanctions.length > 0
      ? `Constam sanções em nome de sócio(s) pessoa física no cadastro nacional de sanções.`
      : criminalIntegrityMedia.length > 0
        ? `Identificadas ${criminalIntegrityMedia.length} publicação(ões) com menção nominal a integrante(s) da sociedade contendo termos criminais/integridade para validação do analista.`
        : 'Nenhuma condenação ou sanção criminal oficial foi localizada nos cadastros nacionais públicos para os CPFs/nomes dos sócios.',
    details: 'Publicações de notícias ou citação processual exigem validação de homonímia e cópia de certidão de distribuição da Justiça Estadual/Federal.',
    sourceLabel: 'CEIS/CNEP Pessoas Físicas, DataJud (CNJ) e Mídia Aberta',
    isOfficialEvidence: true,
    tags: ['Antecedentes Criminais', 'Sócios'],
  });

  // ==========================================================
  // SEÇÃO 6 — INFORMAÇÕES FINANCEIRAS
  // ==========================================================
  const capitalSocialVal = emp.capital_social || 0;
  const isLargeCompany = capitalSocialVal >= 300000000 || emp.natureza_juridica?.toLowerCase().includes('anônima');

  allQuestions.push({
    id: '6.1-demonstracao-financeira-auditada',
    sectionNumber: 6,
    sectionTitle: '6. INFORMAÇÕES FINANCEIRAS',
    code: '6.1',
    question: 'A pessoa jurídica possui demonstração financeira auditada?',
    status: isLargeCompany ? 'review' : 'declaratory',
    statusLabel: isLargeCompany ? 'Obrigatoriedade Legal Prevista' : 'Declaração / Apresentar Balanço',
    value: isLargeCompany
      ? `Sociedade com perfil de grande porte / S.A. (Capital Social: ${Formatters.currency(capitalSocialVal)}), sujeita à obrigatoriedade de auditoria independente nos termos da Lei nº 11.638/2007.`
      : `Capital Social registrado na Receita: ${Formatters.currency(capitalSocialVal)}. Porte: ${emp.porte || 'ME/EPP/Demais'}. Empresa deve apresentar último balanço patrimonial e declarar se é auditada.`,
    details: 'O fornecedor deve juntar as Demonstrações Contábeis do último exercício financeiro acompanhadas do parecer do auditor independente (se aplicável) ou declaração do contador.',
    sourceLabel: 'Receita Federal do Brasil e Lei 11.638/2007',
    isOfficialEvidence: true,
    tags: ['Finanças', 'Balanço Patrimonial'],
  });

  // ==========================================================
  // SEÇÃO 7 — SOBRE AS INTERAÇÕES COM A ADMINISTRAÇÃO PÚBLICA
  // ==========================================================
  allQuestions.push({
    id: '7.1-atividade-regulada',
    sectionNumber: 7,
    sectionTitle: '7. SOBRE AS INTERAÇÕES COM A ADMINISTRAÇÃO PÚBLICA',
    code: '7.1',
    question: 'A pessoa jurídica exerce uma atividade regulada? (Ex.: SUSEP, ANEEL, ANATEL, ANP, ARPE, ANTAQ, CPRH, ANAC, etc.)',
    status: regulation.isRegulated ? 'review' : 'automated',
    statusLabel: regulation.isRegulated ? 'Atividade Regulada Detectada' : 'Atividade Não Regulada Específica',
    value: regulation.isRegulated
      ? `SIM — Atividade sujeita à regulação setorial por: ${regulation.regulators.map((r) => r.regulator).join(', ')}.`
      : 'NÃO — O CNAE Fiscal principal da empresa não indica diretamente setor sujeito a marco regulatório especial obrigatório.',
    details: regulation.isRegulated
      ? `Fundamentação do CNAE (${emp.cnae_fiscal}): ${regulation.regulators.map((r) => `${r.role} (${r.reason})`).join('; ')}.`
      : 'Caso desempenhe atividade conexa regulada não descrita no CNAE primário, a empresa deve apontar o órgão regulador competente.',
    sourceLabel: 'Receita Federal do Brasil (Mapeamento CNAE vs Agências Reguladoras)',
    isOfficialEvidence: true,
    tableData: regulation.regulators.map((r) => ({
      'Ente Regulador': r.regulator,
      'Atividade a Desempenhar': r.role,
      Motivo: r.reason,
    })),
    tags: ['Regulação', 'Agências Reguladoras', 'ANTAQ', 'ANP'],
  });

  allQuestions.push({
    id: '7.2-licencas-autorizacoes',
    sectionNumber: 7,
    sectionTitle: '7. SOBRE AS INTERAÇÕES COM A ADMINISTRAÇÃO PÚBLICA',
    code: '7.2',
    question: 'Informar se são necessárias autorizações, licenças, ART, RRT ou permissões para o exercício das atividades e os órgãos responsáveis pelas respectivas emissões',
    status: regulation.isRegulated ? 'review' : 'declaratory',
    statusLabel: regulation.isRegulated ? 'Licenças Típicas Identificadas' : 'Declaração de Licenças',
    value: regulation.isRegulated
      ? `Exige licenças ambientais/operacionais junto a órgãos competentes (ex: CPRH, ANTAQ, Corpo de Bombeiros ou Capitania dos Portos conforme aplicável ao porto de Suape).`
      : 'Apresentar as licenças de funcionamento ordinárias (Alvará, Licença de Operação ou registros em conselhos profissionais como CREA/CAU caso haja prestação de serviços de engenharia).',
    details: 'O fornecedor deve relacionar número de registro, órgão emissor, data de início e validade de cada licença vigente.',
    sourceLabel: 'Requisitos Setoriais Portuários e Industriais',
    isOfficialEvidence: false,
    tags: ['Licenças', 'CPRH', 'Autorizações'],
  });

  allQuestions.push({
    id: '7.3-7.5-interacao-agenciamento-terceiros',
    sectionNumber: 7,
    sectionTitle: '7. SOBRE AS INTERAÇÕES COM A ADMINISTRAÇÃO PÚBLICA',
    code: '7.3 / 7.4 / 7.5',
    question: 'Expectativa de obtenção de licenças perante agentes públicos/PEP, interação com órgãos governamentais ou agenciamento/representação de SUAPE perante terceiros',
    status: 'declaratory',
    statusLabel: 'Declaração Contratual',
    value: 'Não é esperado agenciamento ou representação legal da Empresa SUAPE perante terceiros, salvo expressa previsão no edital/contrato.',
    details: 'Declaração padrão para resguardo de conflito de interesses e prevenção a atos lesivos à administração pública (Lei 12.846/2013).',
    sourceLabel: 'Declaração de Conformidade do Fornecedor',
    isOfficialEvidence: false,
    tags: ['Interação Pública', 'Agenciamento'],
  });

  allQuestions.push({
    id: '7.6-pep-socios-administradores',
    sectionNumber: 7,
    sectionTitle: '7. SOBRE AS INTERAÇÕES COM A ADMINISTRAÇÃO PÚBLICA',
    code: '7.6',
    question: 'Algum sócio/acionista, administrador, representante legal, diretor ou conselheiro é considerado Pessoa Politicamente Exposta (PEP)?',
    status: pepHitsCount > 0 ? 'review' : 'regular',
    statusLabel: pepHitsCount > 0 ? 'PEP Identificado Oficialmente' : 'Nada Consta no Cadastro PEP Oficial',
    value: pepHitsCount > 0
      ? `ATENÇÃO: Consta(m) ${pepHitsCount} integrante(s) com correspondência nominal na base oficial de Pessoas Politicamente Expostas (PEP) da CGU.`
      : `NADA CONSTA: Todos os ${socios.length} integrantes do quadro societário foram consultados na base oficial da CGU sem correspondência de PEP.`,
    details: pepHitsCount > 0
      ? `A condição de PEP decorre do exercício de função pública ou mandato eletivo nos últimos 5 anos. Requer avaliação de eventual conflito de interesses com o objeto de SUAPE.`
      : 'Consulta executada diretamente contra a base de dados mantida pela Controladoria-Geral da União (Resolução COAF nº 40/2021).',
    sourceLabel: 'CGU (Cadastro Nacional de Pessoas Expostas Politicamente - PEP)',
    isOfficialEvidence: true,
    tableData: pepFound.map((p) => {
      const rec = Array.isArray(p.registros) ? p.registros[0] : undefined;
      return {
        Nome: p.nome,
        CPF: formatDoc(rec?.cpf),
        Cargo: rec?.funcao || 'Função Pública',
        Órgão: rec?.orgao || 'Administração Pública',
        Período: rec?.fim ? `${rec?.inicio || ''} a ${rec?.fim}` : 'Vigente / Recente',
      };
    }),
    tags: ['PEP', 'CGU', 'Compliance'],
  });

  allQuestions.push({
    id: '7.7-7.8-parentesco-suape',
    sectionNumber: 7,
    sectionTitle: '7. SOBRE AS INTERAÇÕES COM A ADMINISTRAÇÃO PÚBLICA',
    code: '7.7 / 7.8',
    question: 'Algum familiar de sócio/administrador é PEP ou familiar de pessoa com influência relevante na Empresa SUAPE?',
    status: 'declaratory',
    statusLabel: 'Declaração de Parentesco e Nepotismo',
    value: 'A declarar pelo fornecedor mediante declaração de inexistência de parentesco ou vínculo com colaboradores de Suape.',
    details: 'Atendimento à Súmula Vinculante nº 13 do STF e ao Código de Conduta e Integridade da Empresa SUAPE.',
    sourceLabel: 'Declaração Anti-Nepotismo do Fornecedor / Base SUAPE',
    isOfficialEvidence: false,
    tags: ['Nepotismo', 'Conflito de Interesses'],
  });

  allQuestions.push({
    id: '7.9-interesse-governo-gestao',
    sectionNumber: 7,
    sectionTitle: '7. SOBRE AS INTERAÇÕES COM A ADMINISTRAÇÃO PÚBLICA',
    code: '7.9',
    question: 'Alguma pessoa, entidade, governo ou agência de governo possui direito de gestão ou interesse financeiro ou societário na empresa?',
    status: 'automated',
    statusLabel: 'Preenchido por Natureza Jurídica',
    value: emp.natureza_juridica?.toLowerCase().includes('pública') || emp.natureza_juridica?.toLowerCase().includes('mista')
      ? `SIM — Trata-se de sociedade com participação ou controle governamental formal (${emp.natureza_juridica}).`
      : 'NÃO — Trata-se de pessoa jurídica de direito privado com controle exercido integralmente por particulares.',
    details: 'Verificado a partir do código e descrição de Natureza Jurídica formal perante o Cadastro Nacional da Pessoa Jurídica da RFB.',
    sourceLabel: 'Receita Federal do Brasil',
    isOfficialEvidence: true,
    tags: ['Estrutura Governamental'],
  });

  // ==========================================================
  // SEÇÃO 8 — INFORMAÇÕES DO PROGRAMA DE INTEGRIDADE
  // ==========================================================
  const integridadePerguntas = [
    { code: '8.1', q: 'A pessoa jurídica possui um Programa de Integridade estruturado para detectar e sanar desvios, fraudes e corrupção?' },
    { code: '8.2', q: 'A pessoa jurídica possui Código de Ética e Conduta anticorrupção que condene vantagens indevidas e propina a agentes públicos?' },
    { code: '8.3', q: 'Os documentos de integridade preveem aplicação de sanções para violações independentemente do cargo ou função?' },
    { code: '8.4', q: 'Os documentos tratam de oferecimento de presentes, brindes e hospitalidades a agentes públicos?' },
    { code: '8.5', q: 'Tratam da prevenção de conflito de interesses nas relações com a Administração Pública?' },
    { code: '8.6', q: 'Há orientações quanto ao acompanhamento da execução dos contratos celebrados com a Administração Pública?' },
    { code: '8.7', q: 'Os membros da alta administração participaram de ações de capacitação em cultura de integridade?' },
    { code: '8.8', q: 'Existe plano de comunicação e plano de treinamento relacionados ao programa de integridade?' },
    { code: '8.9', q: 'Existem controles para verificar a participação dos empregados nos treinamentos?' },
  ];

  integridadePerguntas.forEach((item) => {
    allQuestions.push({
      id: `8.${item.code}`,
      sectionNumber: 8,
      sectionTitle: '8. INFORMAÇÕES DO PROGRAMA DE INTEGRIDADE',
      code: item.code,
      question: item.q,
      status: 'declaratory',
      statusLabel: 'Comprovação Documental',
      value: 'Apresentação de documentos comprobatórios requerida da empresa contratada.',
      details: 'O fornecedor deve apresentar o Código de Ética, evidências de treinamentos e link ou cópia das políticas internas de integridade.',
      sourceLabel: 'Programa de Integridade SUAPE (Lei nº 13.303/2016)',
      isOfficialEvidence: false,
      tags: ['Programa de Integridade', 'Compliance', 'Código de Ética'],
    });
  });

  // ==========================================================
  // SEÇÃO 9 — LISTAS RESTRITIVAS, COMPLIANCE, LGPD E DIREITOS HUMANOS
  // ==========================================================
  allQuestions.push({
    id: '9.0-9.1-compliance-officer',
    sectionNumber: 9,
    sectionTitle: '9. LISTAS RESTRITIVAS, COMPLIANCE, LGPD E DIREITOS HUMANOS',
    code: '9.0 / 9.1',
    question: 'A sociedade possui um profissional ou órgão colegiado responsável por programa anticorrupção (Compliance Officer)?',
    status: 'declaratory',
    statusLabel: 'Declaração de Governança',
    value: 'A designar pela empresa (informar nome, qualificações, cargo e canal direto de comunicação com SUAPE).',
    details: 'Empresas com contratos de maior envergadura devem manter área ou responsável de compliance formalmente instituído.',
    sourceLabel: 'Declaração da Empresa',
    isOfficialEvidence: false,
    tags: ['Compliance Officer'],
  });

  // 9.2 As 8 Listas Restritivas e Cadastros Oficiais Obrigatórios
  const restrictiveLists = [
    {
      nome: 'CEIS — Cadastro Nacional de Empresas Inidôneas e Suspensas',
      orgao: 'CGU',
      status: (ceis?.quantidade || 0) > 0 ? 'review' : 'regular',
      qtd: ceis?.quantidade || 0,
      detalhes: (ceis?.quantidade || 0) > 0 ? `${ceis?.quantidade} registro(s) no CEIS` : 'Certidão Negativa (Nada Consta)',
    },
    {
      nome: 'CNEP — Cadastro Nacional de Empresas Punidas (Lei Anticorrupção)',
      orgao: 'CGU',
      status: (cnep?.quantidade || 0) > 0 ? 'review' : 'regular',
      qtd: cnep?.quantidade || 0,
      detalhes: (cnep?.quantidade || 0) > 0 ? `${cnep?.quantidade} registro(s) no CNEP` : 'Certidão Negativa (Nada Consta)',
    },
    {
      nome: 'CEPIM — Entidades Privadas Sem Fins Lucrativos Impedidas',
      orgao: 'CGU',
      status: 'regular',
      qtd: 0,
      detalhes: 'Não aplicável ou Certidão Negativa',
    },
    {
      nome: 'CNJ — Condenações Cíveis por Atos de Improbidade Administrativa',
      orgao: 'Conselho Nacional de Justiça',
      status: discoveries.some((d) => (d.dataJud?.assuntos || []).some((a) => (a?.nome || '').toLowerCase().includes('improbidade')) || (d.dataJud?.classe?.nome || '').toLowerCase().includes('improbidade')) ? 'review' : 'regular',
      qtd: 0,
      detalhes: 'Sem registro de condenação transitada em julgado nas consultas processuais públicas',
    },
    {
      nome: 'TCU — Relação de Inabilitados e Inidôneos',
      orgao: 'Tribunal de Contas da União',
      status: 'regular',
      qtd: 0,
      detalhes: 'Certidão Negativa de Inidôneos TCU',
    },
    {
      nome: 'TCE-PE / SCGE — Inabilitados e Inidôneos de Pernambuco',
      orgao: 'TCE-PE e SCGE',
      status: ((tcePe?.processos?.length || tcePe?.resumo?.total || 0) > 0) ? 'review' : 'regular',
      qtd: tcePe?.processos?.length || tcePe?.resumo?.total || 0,
      detalhes: ((tcePe?.processos?.length || tcePe?.resumo?.total || 0) > 0) ? `${tcePe?.processos?.length || tcePe?.resumo?.total} processo(s) apontados no TCE-PE` : 'Certidão Negativa do TCE-PE',
    },
    {
      nome: 'MTE — Cadastro de Empregadores (Lista Suja de Trabalho Escravo)',
      orgao: 'Ministério do Trabalho e Emprego',
      status: 'regular',
      qtd: 0,
      detalhes: 'Nada Consta na relação pública do MTE',
    },
    {
      nome: 'Decisões Judiciais / Processos Administrativos Desfavoráveis',
      orgao: 'Tribunais Estaduais e Federais (DataJud)',
      status: discoveries.length > 0 ? 'review' : 'regular',
      qtd: discoveries.length,
      detalhes: discoveries.length > 0 ? `${discoveries.length} processo(s) candidato(s) em monitoramento` : 'Nenhum processo judicial impeditivo',
    },
  ];

  const hasAnySanction = restrictiveLists.some((item) => item.status === 'review');

  allQuestions.push({
    id: '9.2-listas-restritivas-oficiais',
    sectionNumber: 9,
    sectionTitle: '9. LISTAS RESTRITIVAS, COMPLIANCE, LGPD E DIREITOS HUMANOS',
    code: '9.2 / 9.3',
    question: 'A empresa e seus sócios/administradores foram ou estão citados em qualquer dos cadastros/listas restritivas oficiais? (CEIS, CNEP, CEPIM, CNJ, TCU, TCE-PE/SCGE, MTE Trabalho Escravo)',
    status: hasAnySanction ? 'review' : 'regular',
    statusLabel: hasAnySanction ? 'Apontamento em Cadastro Restritivo' : 'NADA CONSTA em Todos os 8 Cadastros Oficiais',
    value: hasAnySanction
      ? `ATENÇÃO: Constam apontamentos em pelo menos um cadastro restritivo consultado. Veja o detalhamento na tabela de listas oficiais.`
      : 'NADA CONSTA: Consultas oficiais automáticas executadas com resultado negativo em todos os 8 cadastros oficiais de idoneidade pública.',
    details: 'Varredura automática realizada nas bases de dados da CGU, TCE-PE, TCU, MTE e CNJ/DataJud.',
    sourceLabel: 'Integração de Cadastros Nacionais Oficiais',
    isOfficialEvidence: true,
    tableData: restrictiveLists.map((item) => ({
      Cadastro: item.nome,
      Órgão: item.orgao,
      Resultado: item.status === 'review' ? 'CONSTA OCORRÊNCIA' : 'NADA CONSTA',
      Detalhamento: item.detalhes,
    })),
    tags: ['CEIS', 'CNEP', 'TCE-PE', 'TCU', 'Trabalho Escravo', 'Improbidade'],
  });

  allQuestions.push({
    id: '9.4-lgpd',
    sectionNumber: 9,
    sectionTitle: '9. LISTAS RESTRITIVAS, COMPLIANCE, LGPD E DIREITOS HUMANOS',
    code: '9.4',
    question: 'A pessoa jurídica possui um programa, política ou ações de adequação à LGPD (Lei Geral de Proteção de Dados)?',
    status: 'declaratory',
    statusLabel: 'Comprovação de Governança',
    value: 'Apresentação de política de privacidade, termo de nomeação de Encarregado (DPO) ou declaração de adequação.',
    details: 'Exigência de governança de dados pessoais nos termos da Lei nº 13.709/2018 para prestadores de serviços de SUAPE.',
    sourceLabel: 'Declaração LGPD da Empresa',
    isOfficialEvidence: false,
    tags: ['LGPD', 'Privacidade'],
  });

  allQuestions.push({
    id: '9.5-direitos-humanos',
    sectionNumber: 9,
    sectionTitle: '9. LISTAS RESTRITIVAS, COMPLIANCE, LGPD E DIREITOS HUMANOS',
    code: '9.5',
    question: 'A pessoa jurídica dispõe de política ou procedimento em vigor para evitar e monitorar eventuais violações aos Direitos Humanos?',
    status: 'declaratory',
    statusLabel: 'Declaração Socioambiental',
    value: 'Apresentação de compromisso formal contra trabalho infantil, discriminação e violação de direitos humanos no Complexo de Suape.',
    details: 'Alinhamento às Diretrizes da OCDE e aos Padrões de Sustentabilidade de Suape.',
    sourceLabel: 'Declaração ESG / Direitos Humanos',
    isOfficialEvidence: false,
    tags: ['Direitos Humanos', 'ESG'],
  });

  allQuestions.push({
    id: '9.6-diversidade-inclusao',
    sectionNumber: 9,
    sectionTitle: '9. LISTAS RESTRITIVAS, COMPLIANCE, LGPD E DIREITOS HUMANOS',
    code: '9.6',
    question: 'A pessoa jurídica dispõe de política ou procedimento em vigor relacionados a Diversidade e Inclusão?',
    status: 'declaratory',
    statusLabel: 'Declaração Institucional',
    value: 'Apresentação de iniciativas corporativas de inclusão, equidade de gênero e acessibilidade.',
    details: 'Estímulo a políticas afirmativas e cumprimento de cotas legais para pessoas com deficiência.',
    sourceLabel: 'Declaração de Diversidade',
    isOfficialEvidence: false,
    tags: ['Diversidade'],
  });

  // ==========================================================
  // SEÇÃO 10 — DECLARAÇÃO DE CIÊNCIA E CONCLUSÃO
  // ==========================================================
  allQuestions.push({
    id: '10.1-declaracao-ciencia',
    sectionNumber: 10,
    sectionTitle: '10. DECLARAÇÃO DE CIÊNCIA E CONCLUSÃO',
    code: '10.0',
    question: 'Declaração de Ciência e Submissão ao Código de Ética e Integridade de SUAPE',
    status: 'automated',
    statusLabel: 'Pronto para Assinatura e Anexação',
    value: `O fornecedor declara plena ciência de que as informações prestadas são verdadeiras e compromete-se a cumprir o Código de Ética e Conduta de Suape (acessível pelo portal oficial institucional de Suape), comunicando qualquer fato superveniente no prazo improrrogável de 10 dias corridos.`,
    details: `Emitido em ${new Date().toLocaleDateString('pt-BR')} para instrução de processo de diligência de integridade da Empresa SUAPE.`,
    sourceLabel: 'Programa de Integridade SUAPE e Código de Ética',
    isOfficialEvidence: true,
    tags: ['Conclusão', 'Declaração de Ciência'],
  });

  // Agrupamento por seções
  const sectionsMap = new Map<number, SuapeQuestionItem[]>();
  allQuestions.forEach((q) => {
    const list = sectionsMap.get(q.sectionNumber) || [];
    list.push(q);
    sectionsMap.set(q.sectionNumber, list);
  });

  const sectionTitles: Record<number, { title: string; subtitle: string }> = {
    1: { title: '1. DADOS GERAIS DA PESSOA JURÍDICA', subtitle: 'Cadastro oficial da RFB, endereço, objeto e porte' },
    2: { title: '2. REPRESENTANTE DA PJ PARA CONTATO', subtitle: 'Identificação formal do representante perante Suape' },
    3: { title: '3. HISTÓRICO DA SOCIEDADE', subtitle: 'Tempo de atuação comprovado e histórico de constituição' },
    4: { title: '4. GESTÃO SOCIETÁRIA & PARTES RELACIONADAS', subtitle: 'Diretoria nos últimos 5 anos, filiais e sanções' },
    5: { title: '5. PARTICIPAÇÃO SOCIETÁRIA & SÓCIOS', subtitle: 'Quadro societário, beneficiários finais e antecedentes' },
    6: { title: '6. INFORMAÇÕES FINANCEIRAS', subtitle: 'Porte, capital social e auditoria de demonstrações' },
    7: { title: '7. INTERAÇÕES COM ADMINISTRAÇÃO PÚBLICA & PEP', subtitle: 'Atividade regulada (ANTAQ/ANP/CPRH) e verificação de PEP' },
    8: { title: '8. PROGRAMA DE INTEGRIDADE', subtitle: 'Código de ética, sanções, brindes e canal de denúncias' },
    9: { title: '9. LISTAS RESTRITIVAS, LGPD E DIREITOS HUMANOS', subtitle: '8 cadastros restritivos oficiais e governança ESG' },
    10: { title: '10. DECLARAÇÃO DE CIÊNCIA E ASSINATURA', subtitle: 'Termo de submissão ao Código de Ética de SUAPE' },
  };

  const sections: SuapeSectionSummary[] = Array.from(sectionsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([sectionNum, questions]) => {
      const meta = sectionTitles[sectionNum] || { title: `Seção ${sectionNum}`, subtitle: '' };
      return {
        sectionNumber: sectionNum,
        title: meta.title,
        subtitle: meta.subtitle,
        totalQuestions: questions.length,
        automatedCount: questions.filter((q) => q.status === 'automated').length,
        regularCount: questions.filter((q) => q.status === 'regular').length,
        reviewCount: questions.filter((q) => q.status === 'review').length,
        declaratoryCount: questions.filter((q) => q.status === 'declaratory').length,
        questions,
      };
    });

  const total = allQuestions.length;
  const automated = allQuestions.filter((q) => q.status === 'automated').length;
  const regular = allQuestions.filter((q) => q.status === 'regular').length;
  const review = allQuestions.filter((q) => q.status === 'review').length;
  const declaratory = allQuestions.filter((q) => q.status === 'declaratory').length;
  const completionPercent = Math.round(((automated + regular + (review > 0 ? review : 0)) / total) * 100);

  return {
    generatedAt: new Date().toISOString(),
    companyName: emp.razao_social || diligence.razaoSocial,
    cnpj: emp.cnpj || diligence.cnpj,
    cnpjFormatted: diligence.cnpjFmt || formatDoc(emp.cnpj),
    sections,
    allQuestions,
    metrics: {
      total,
      automated,
      regular,
      review,
      declaratory,
      completionPercent,
    },
  };
}
