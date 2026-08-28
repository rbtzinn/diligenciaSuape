import type { AdverseMediaSummary, DiligenceItem, ProcessDiscovery } from '../types';

export type QuestionnaireAnswerStatus = 'verified' | 'review' | 'partial' | 'declaration';

export interface ComplexQuestionnaireAnswer {
  id: string;
  reference: string;
  title: string;
  status: QuestionnaireAnswerStatus;
  answer: string;
  limitation: string;
  evidenceLabels: string[];
  relatedNames?: string[];
}

const KINSHIP_TYPES = new Set([
  'KINSHIP',
  'FAMILY_RELATIONSHIP',
  'SPOUSE_OF',
  'PARENT_OF',
  'SIBLING_OF',
  'RELATIVE_OF',
]);

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function buildComplexQuestionnaireAnswers(
  diligence: DiligenceItem,
  adverseMedia?: AdverseMediaSummary,
  discoveries: ProcessDiscovery[] = []
): ComplexQuestionnaireAnswer[] {
  const shareholders = Array.isArray(diligence.socios) ? diligence.socios : [];
  const pepResults = Array.isArray(diligence.pepResults) ? diligence.pepResults : [];
  const relationships = Array.isArray(diligence.egos?.relationships) ? diligence.egos.relationships : [];
  const findings = Array.isArray(diligence.egos?.findings) ? diligence.egos.findings : [];
  const ceisCount = diligence.ceis?.quantidade || 0;
  const cnepCount = diligence.cnep?.quantidade || 0;
  const officialSanctions = ceisCount + cnepCount;
  const sanctionsAvailable = diligence.ceis?.ok === true && diligence.cnep?.ok === true;

  const personMedia = (adverseMedia?.results || []).filter((item) => (
    item.subjectType === 'person' && item.status !== 'discarded' && item.riskRelevant !== false
  ));
  const criminalIntegrityPersonMedia = personMedia.filter((item) => (
    item.personMatch?.fullName === true
    && item.categories?.some((category) => category === 'criminal' || category === 'integrity')
    && (item.matchedTerms?.length || 0) > 0
  ));
  const personNames = unique(criminalIntegrityPersonMedia.map((item) => item.subjectName));
  const peopleSearched = adverseMedia?.peopleSearched || 0;
  const pepHits = pepResults.filter((item) => item.encontrado).length;
  const pepAvailable = pepResults.length > 0 && pepResults.every((item) => item.ok && !item.semChave);
  const pepNames = unique(pepResults.filter((item) => item.encontrado).map((item) => item.nome));
  const kinshipRelationships = relationships.filter((item) => KINSHIP_TYPES.has(item.type.toUpperCase()));
  const internalSuapeFindings = findings.filter((item) => (
    item.axis === 'INTERNAL_SUAPE' && (item.status === 'REVIEW' || item.status === 'INCONCLUSIVE')
  ));
  const companyShareholders = shareholders.filter((item) => {
    const document = String(item.cnpj_cpf_do_socio || '').replace(/\D/g, '');
    return document.length === 14 && !String(item.cnpj_cpf_do_socio || '').includes('*');
  }).length;
  const processCandidates = discoveries.filter((item) => item.status !== 'discarded').length;
  const cnae = diligence.empresa?.cnae_fiscal_descricao || String(diligence.empresa?.cnae_fiscal || '').trim();

  return [
    {
      id: 'official-integrity',
      reference: '4.4 · 9.2',
      title: 'Sanções, condenações e impedimentos oficiais',
      status: officialSanctions > 0 ? 'review' : sanctionsAvailable ? 'partial' : 'partial',
      answer: officialSanctions > 0
        ? `${officialSanctions} registro(s) foram localizado(s) no CEIS/CNEP e precisam ser qualificados quanto à vigência, pessoa atingida e fundamento.`
        : sanctionsAvailable
          ? 'CEIS e CNEP foram consultados sem registro para o CNPJ pesquisado.'
          : 'A consulta de CEIS/CNEP não foi concluída integralmente nesta diligência.',
      limitation: 'A pergunta 9.2 também exige CEPIM, CNJ, TCU, TCE/SCGE, trabalho escravo e outras decisões. Ausência no CEIS/CNEP não encerra a resposta completa.',
      evidenceLabels: ['CGU · CEIS', 'CGU · CNEP', processCandidates > 0 ? `${processCandidates} processo(s) candidato(s)` : 'Descoberta processual'],
    },
    {
      id: 'beneficial-ownership',
      reference: '5.1',
      title: 'Sócios e beneficiário final',
      status: shareholders.length > 0 ? 'partial' : 'declaration',
      answer: shareholders.length > 0
        ? `${shareholders.length} integrante(s) do quadro societário/administrativo foram estruturados${companyShareholders > 0 ? `, incluindo ${companyShareholders} pessoa(s) jurídica(s) que exigem expansão` : ''}.`
        : 'A fonte cadastral não retornou integrantes suficientes para preencher a cadeia de controle.',
      limitation: 'O QSA cadastral não informa, sozinho, percentual de participação nem garante a identificação do beneficiário final. Contrato social e cadeia societária continuam necessários.',
      evidenceLabels: ['Receita Federal · QSA', 'EGOS · Rede societária'],
    },
    {
      id: 'shareholder-occurrences',
      reference: '5.2',
      title: 'Ocorrências criminais ligadas aos integrantes',
      status: criminalIntegrityPersonMedia.length > 0 ? 'review' : peopleSearched > 0 ? 'partial' : 'declaration',
      answer: criminalIntegrityPersonMedia.length > 0
        ? `${criminalIntegrityPersonMedia.length} conteúdo(s) público(s) mencionam exatamente o nome de ${personNames.length} integrante(s) e contêm termos criminais ou de integridade no título ou trecho retornado.`
        : peopleSearched > 0
          ? `Os nomes de ${peopleSearched} integrante(s) foram pesquisados e nenhum conteúdo reuniu, ao mesmo tempo, nome completo e termo criminal ou de integridade no título ou trecho retornado.`
          : 'A busca individual de ocorrências não foi executada nesta diligência antiga; refaça a consulta para preencher este item.',
      limitation: 'Resultado de busca não confirma identidade, investigação, processo, crime ou condenação. Cada conteúdo deve ser lido e confrontado com CPF, processo e fonte oficial.',
      evidenceLabels: ['Pesquisa nominal exata', 'Termos criminais e de integridade', 'Validação humana obrigatória'],
      relatedNames: personNames,
    },
    {
      id: 'pep',
      reference: '7.6',
      title: 'Sócios ou administradores classificados como PEP',
      status: pepHits > 0 ? 'review' : pepAvailable ? 'verified' : 'partial',
      answer: pepHits > 0
        ? `${pepHits} integrante(s) possuem candidato nominal na base oficial de PEP; cargo, órgão, período e sinais de correspondência estão disponíveis para validação.`
        : pepAvailable
          ? `Todos os ${pepResults.length} integrante(s) foram consultados sem candidato nominal na base PEP.`
          : 'A verificação PEP não cobriu integralmente todos os integrantes.',
      limitation: 'PEP descreve função pública e exposição institucional. Não é registro criminal, sanção nem prova de irregularidade.',
      evidenceLabels: ['CGU · PEP', 'EGOS · Resolução de identidade'],
      relatedNames: pepNames,
    },
    {
      id: 'regulation-licenses',
      reference: '7.1 · 7.2',
      title: 'Atividade regulada, licenças e autorizações',
      status: cnae ? 'partial' : 'declaration',
      answer: cnae
        ? `A atividade econômica principal já foi pré-preenchida como “${cnae}”.`
        : 'A atividade econômica não foi suficiente para sugerir o contexto regulatório.',
      limitation: 'CNAE não prova licença vigente nem identifica todas as autorizações, ART/RRT e órgãos reguladores aplicáveis. Os documentos precisam ser anexados e validados.',
      evidenceLabels: ['Receita Federal · CNAE', 'Documentos regulatórios pendentes'],
    },
    {
      id: 'kinship-conflict',
      reference: '7.7 · 7.8 · 7.9',
      title: 'Parentesco, vínculo SUAPE e interesse público',
      status: kinshipRelationships.length > 0 || internalSuapeFindings.length > 0 ? 'review' : 'declaration',
      answer: kinshipRelationships.length > 0
        ? `${kinshipRelationships.length} relação(ões) de parentesco documentada(s) aparece(m) na rede e deve(m) ser confrontada(s) com PEP e SUAPE.`
        : internalSuapeFindings.length > 0
          ? `${internalSuapeFindings.length} possível(is) correspondência(s) com cadastro funcional SUAPE exigem validação, mas nenhuma delas prova parentesco.`
          : 'Nenhum parentesco comprovado está disponível na base atual.',
      limitation: 'A folha de pagamento contém vínculo funcional mínimo, não filiação, cônjuge ou dependentes. Sobrenome semelhante não será tratado como parentesco; declaração e documento são necessários.',
      evidenceLabels: ['Base interna SUAPE minimizada', 'Rede EGOS', 'Declaração do fornecedor'],
    },
    {
      id: 'integrity-documents',
      reference: '8.1–9.1 · 9.4–9.6',
      title: 'Programa de integridade, LGPD e direitos humanos',
      status: 'declaration',
      answer: 'Estas respostas dependem do conteúdo de código de ética, políticas, treinamentos, canal de denúncias, governança de dados e compromissos socioambientais.',
      limitation: 'O sistema não deve inferir a existência ou efetividade de políticas a partir do CNPJ. A automação correta é analisar documentos anexados, extrair evidências e apontar lacunas.',
      evidenceLabels: ['Análise documental necessária', 'Declaração e comprovação'],
    },
  ];
}
