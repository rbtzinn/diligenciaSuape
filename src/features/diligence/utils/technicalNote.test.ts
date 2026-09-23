import { describe, it, expect } from 'vitest';
import {
  buildResearchParagraph,
  buildTechnicalNote,
  defaultTechnicalNoteForm,
  formatNoteDate,
  missingFields,
  technicalNoteToHtml,
  technicalNoteToText,
  type TechnicalNote,
  type TechnicalNoteForm,
  type TechnicalNoteSource,
} from './technicalNote';
import { evaluateSuapeIntegrity, type IntegrityAnswers } from './suapeRiskMapRowGenerator';
import type { AdverseMediaSummary, DiligenceItem, SanctionsResult } from '../types';

const semSancao = (fonte: string): SanctionsResult => ({
  ok: true, fonte, encontrado: false, quantidade: 0, registros: [],
});

const midia = (extra: Partial<AdverseMediaSummary> = {}): AdverseMediaSummary => ({
  ok: true,
  totalFound: 0,
  candidatesCount: 0,
  strongMatches: 0,
  mediumMatches: 0,
  weakMatches: 0,
  results: [],
  consultadoEm: '2026-09-17T12:00:00Z',
  coverageStatus: 'COMPLETE',
  ...extra,
});

function dossie(extra: Partial<DiligenceItem> = {}): DiligenceItem {
  return {
    id: 'd1',
    cnpj: '20867216000166',
    razaoSocial: 'TMP TERMINAIS S/A',
    socios: [],
    pepResults: [],
    empresa: { cnpj: '20867216000166', razao_social: 'TMP TERMINAIS S/A' },
    ceis: semSancao('CEIS'),
    cnep: semSancao('CNEP'),
    adverseMedia: midia(),
    ...extra,
  } as unknown as DiligenceItem;
}

/** Questionário completo, tudo "Não", como o terceiro sem nenhum gatilho. */
const NEGATIVO: IntegrityAnswers = {
  '4.4': false, '5.2': false,
  '7.1': false, '7.2': false, '7.3': false, '7.4': false, '7.5': false,
  '7.6': false, '7.7': false, '7.8': false, '7.9': false,
  alcadaConselho: false,
};

/** A fonte da nota é a Avaliação de Integridade SUAPE, calculada de verdade. */
function fonte(answers: IntegrityAnswers, diligence = dossie()): TechnicalNoteSource {
  return { diligence, answers, evaluation: evaluateSuapeIntegrity(diligence, 0, answers) };
}

function form(extra: Partial<TechnicalNoteForm> = {}): TechnicalNoteForm {
  return { ...defaultTechnicalNoteForm(dossie(), new Date(2026, 8, 17)), numero: '154', ...extra };
}

function nota(answers: IntegrityAnswers, extra: Partial<TechnicalNoteForm> = {}, diligence?: DiligenceItem): TechnicalNote {
  const built = buildTechnicalNote(form(extra), fonte(answers, diligence));
  if (!built) throw new Error('nota não gerada');
  return built;
}

const texto = (answers: IntegrityAnswers, extra: Partial<TechnicalNoteForm> = {}) => technicalNoteToText(nota(answers, extra));

describe('classificação vem da Avaliação de Integridade', () => {
  it('sem questionário não há nota', () => {
    expect(buildTechnicalNote(form(), fonte({}))).toBeNull();
  });

  it('o nível da nota é o calculatedRisk da avaliação', () => {
    expect(nota(NEGATIVO).nivel).toBe('Baixo');
    expect(nota({ ...NEGATIVO, '7.2': true }).nivel).toBe('Médio');
    expect(nota({ ...NEGATIVO, '7.1': true, '7.2': true }).nivel).toBe('Alto');
    expect(nota({ ...NEGATIVO, '7.6': true }).nivel).toBe('Alto');
    expect(nota({ ...NEGATIVO, alcadaConselho: true }).nivel).toBe('Alto');
    expect(nota({ ...NEGATIVO, '5.2': true }).nivel).toBe('Muito Alto');
  });
});

describe('cabeçalho', () => {
  it('reproduz título, local, data por extenso e ementa', () => {
    const n = nota(NEGATIVO, {
      empresa: 'TMP Terminais S/A',
      objeto: 'empresa especializada em armazenamento e movimentação de granéis líquidos no Porto Organizado de Suape',
    });
    expect(n.titulo).toBe('NOTA TÉCNICA - SUAPE - ASSESSORIA ESPECIAL DE COMPLIANCE - Nº 154/2026');
    expect(n.local).toBe('Ipojuca, 17 de setembro de 2026');
    expect(n.ementa).toBe(
      'Política de Contratação de Terceiros. Contratação da empresa TMP Terminais S/A, empresa especializada em armazenamento e movimentação de granéis líquidos no Porto Organizado de Suape.',
    );
  });

  it('formata a data sem zero à esquerda no dia', () => {
    expect(formatNoteDate('2026-03-05')).toBe('5 de março de 2026');
  });
});

describe('Risco Baixo (modelo da nota 155)', () => {
  const supernova = { empresa: 'Supernova Serviços de Informação Ltda' };
  const respostas: IntegrityAnswers = { ...NEGATIVO, '8.1': false, '8.2': false, '8.7': false, '9.0': false };

  it('diz que as respostas não a classificaram em nível superior', () => {
    expect(nota(respostas, supernova).paragrafos[1]).toBe(
      'Diante da análise do questionário de diligência, verificou-se que as respostas da Supernova Serviços de Informação Ltda não a classificaram com aparente Risco Médio, Risco Alto ou Risco Muito Alto de Integridade.',
    );
  });

  it('as negativas de 8.1, 8.2, 8.7 e 9.0 saem como no modelo', () => {
    expect(texto(respostas, supernova)).toContain(
      'A Supernova Serviços de Informação Ltda informou não possuir um Programa de Integridade estruturado, não possuir Código de Ética, não ter conduzido treinamento para gestão societária e não possuir profissional responsável por um programa ou política anticorrupção.',
    );
  });

  it('4.4 e 5.2 negados viram a declaração de ausência de condenações', () => {
    expect(texto(respostas)).toContain('não haver condenações, processos ou investigações');
  });

  it('classifica, recomenda acompanhamento e arquiva, sem pesquisa nem lista', () => {
    const t = texto(respostas);
    expect(t).toContain('grau de RISCO BAIXO DE INTEGRIDADE.');
    expect(t).toContain('mantenham o acompanhamento regular da execução contratual');
    expect(t).toContain('o presente processo será arquivado');
    expect(t).not.toContain('pesquisa reputacional');
    expect(nota(respostas).recomendacoes).toEqual([]);
  });
});

describe('Risco Médio (modelo da nota 156)', () => {
  const respostas: IntegrityAnswers = { ...NEGATIVO, '7.2': true, '8.2': false, '8.7': false, '9.0': false };

  it('enquadra pelo item 7.2 e arquiva', () => {
    const t = texto(respostas, { empresa: 'Adm Arquitetos Associados Ltda - EPP' });
    expect(t).toContain('verificamos que a Adm Arquitetos Associados Ltda - EPP respondeu positivamente ao item 7.2');
    expect(t).toContain('aparente MÉDIO RISCO DE INTEGRIDADE');
    expect(t).toContain('grau de RISCO MÉDIO DE INTEGRIDADE.');
    expect(t).toContain('o presente processo será arquivado');
    expect(t).not.toContain('pesquisa reputacional');
  });

  it('item de maturidade sem resposta fica fora do texto', () => {
    const t = texto(respostas);
    expect(t).toContain('informou não possuir Código de Ética, não ter conduzido treinamento');
    expect(t).not.toContain('Programa de Integridade estruturado');
  });

  it('observações da análise documental viram parágrafos antes da conclusão', () => {
    const { paragrafos } = nota(respostas, {
      observacoes: 'O registro no CAU/PE vale até 21/09/2026.\n\nA presente manifestação possui caráter orientativo.',
    });
    const cau = paragrafos.findIndex((p) => p.includes('CAU/PE'));
    const conclusao = paragrafos.findIndex((p) => p.includes('RISCO MÉDIO DE INTEGRIDADE.'));
    expect(cau).toBeGreaterThan(0);
    expect(paragrafos[cau + 1]).toMatch(/^A presente manifestação/);
    expect(conclusao).toBe(cau + 2);
  });
});

describe('Risco Alto (modelo da nota 154)', () => {
  const respostas: IntegrityAnswers = { ...NEGATIVO, '7.1': true, '7.2': true, '8.1': true, '8.2': true, '8.7': true, '9.0': true };
  const tmp = {
    empresa: 'TMP Terminais S/A',
    atividadeRegulada: 'a Agência Nacional do Petróleo, Gás Natural e Biocombustíveis (ANP) para o armazenamento de granéis líquidos',
    licencasDestacadas: 'a Licença de Operação emitida pela CPRH',
  };

  it('só 7.1 (com 7.2) reproduz o texto do modelo', () => {
    expect(nota(respostas, tmp).paragrafos[1]).toBe(
      'Diante da análise do Questionário de Diligência, verificou-se que a empresa respondeu positivamente ao item 7.1, afirmando que exerce atividade regulada perante a Agência Nacional do Petróleo, Gás Natural e Biocombustíveis (ANP) para o armazenamento de granéis líquidos. Tal enquadramento, nos termos da Política de Contratação de Terceiros, resulta na elevação do perfil de integridade da empresa para Risco Alto de Integridade. Adicionalmente, a empresa manifestou conformidade com o item 7.2, ratificando a manutenção das licenças e autorizações necessárias ao exercício de suas atividades. Destaca-se a Licença de Operação emitida pela CPRH.',
    );
  });

  it('outros gatilhos do Alto (7.3 a 7.9) entram no enquadramento', () => {
    const [, enquadramento] = nota({ ...NEGATIVO, '7.4': true, '7.6': true }).paragrafos;
    expect(enquadramento).toContain('respondeu positivamente aos itens 7.4 e 7.6');
    expect(enquadramento).toContain('mantém interação com órgãos governamentais');
    expect(enquadramento).toContain('considerado Pessoa Politicamente Exposta');
    expect(enquadramento).toContain('Risco Alto de Integridade');
  });

  it('alçada do Conselho sozinha também enquadra', () => {
    const [, enquadramento] = nota({ ...NEGATIVO, alcadaConselho: true }).paragrafos;
    expect(enquadramento).toContain('verificou-se que as obrigações da contratação foram autorizadas por alçada do Conselho de Administração');
  });

  it('tem pesquisa reputacional, recomendações A–D e não arquiva', () => {
    const n = nota(respostas, tmp);
    const t = technicalNoteToText(n);
    expect(t).toContain('itens 3.3.2 e 3.3.3');
    expect(t).toContain('grau de RISCO ALTO.');
    expect(n.recomendacoes.map((r) => r.slice(0, 2))).toEqual(['A)', 'B)', 'C)', 'D)']);
    expect(t).not.toContain('arquivado');
  });

  it('declarações positivas saem como no modelo', () => {
    expect(texto(respostas, tmp)).toContain(
      'A TMP Terminais S/A informou possuir Programa de Integridade estruturado e Código de Ética, ter conduzido treinamento para a alta administração e possuir profissional ou órgão colegiado responsável',
    );
  });

  it('órgão regulador vazio vira marcador e aparece nos campos faltando', () => {
    const f = form({ numero: '' });
    const n = buildTechnicalNote(f, fonte(respostas));
    expect(n?.paragrafos[1]).toContain('[ÓRGÃOS REGULADORES E ATIVIDADE]');
    expect(n?.titulo).toContain('Nº ___/2026');
    expect(missingFields(f, fonte(respostas))).toEqual(['Número da nota', 'Órgãos reguladores (item 7.1)']);
  });
});

describe('Risco Muito Alto (modelo da nota 124)', () => {
  const respostas: IntegrityAnswers = { ...NEGATIVO, '4.4': true, '5.2': true, '7.1': true, '7.2': true, '7.4': true };

  it('enquadra pelo 4.4, soma o 5.2 e os agravantes do bloco 7', () => {
    const [, enquadramento] = nota(respostas).paragrafos;
    expect(enquadramento).toContain('assinalou positivamente os itens 4.4, 5.2, 7.1, 7.2 e 7.4');
    expect(enquadramento).toContain('RISCO MUITO ALTO DE INTEGRIDADE');
    expect(enquadramento).toContain('por declarar a existência de condenação administrativa ou civil por atos de corrupção');
    expect(enquadramento).toContain('Adicionalmente, a empresa respondeu positivamente ao item 5.2');
    expect(enquadramento).toContain(
      'Também foram identificadas respostas afirmativas aos itens 7.1, 7.2 e 7.4, indicando que a empresa exerce atividade regulada, necessita de autorizações e licenças para o exercício de suas atividades e mantém interação com órgãos governamentais e/ou agentes públicos em decorrência de suas atividades',
    );
  });

  it('só o 5.2 enquadra citando os sócios', () => {
    const [, enquadramento] = nota({ ...NEGATIVO, '5.2': true }).paragrafos;
    expect(enquadramento).toContain('assinalou positivamente o item 5.2');
    expect(enquadramento).toContain('por informar a existência de condenações, processos criminais ou investigações criminais relacionadas aos sócios');
    expect(enquadramento).not.toContain('Adicionalmente');
    expect(enquadramento).not.toContain('Também');
  });

  it('tem pesquisa, recomendações A–F, não arquiva e não afirma ausência de condenações', () => {
    const n = nota(respostas);
    const t = technicalNoteToText(n);
    expect(t).toContain('itens 3.3.2 e 3.3.3');
    expect(t).toContain('grau de RISCO MUITO ALTO DE INTEGRIDADE.');
    expect(n.recomendacoes).toHaveLength(6);
    expect(n.recomendacoes[0]).toContain('Terceiros de Risco Muito Alto');
    expect(n.recomendacoes[5]).toContain('as condenações criminais declaradas');
    expect(t).not.toContain('arquivado');
    expect(t).not.toContain('não haver condenações');
  });

  it('sem 5.2, a recomendação ao Jurídico não fala em condenação criminal', () => {
    expect(nota({ ...NEGATIVO, '4.4': true }).recomendacoes[5]).toContain('se as condenações declaradas');
  });
});

describe('pesquisa reputacional e cadastros do item 3.3.3', () => {
  const pesquisa = (diligence: DiligenceItem) =>
    buildResearchParagraph(diligence, evaluateSuapeIntegrity(diligence, 0, NEGATIVO).registryCoverage);

  it('sem achados, lista só os cadastros consultados e usa o texto do modelo', () => {
    const { texto: t, alertas } = pesquisa(dossie());
    expect(t).toContain('não tendo sido identificadas ocorrências envolvendo a referida empresa');
    expect(t).toContain('não foram identificados registros, ocorrências ou apontamentos');
    expect(t).toContain('CEIS');
    expect(t).not.toContain('CEPIM');
    expect(alertas.some((a) => a.startsWith('Consulta manual pendente') && a.includes('CEPIM'))).toBe(true);
  });

  it('notícia relevante não descartada impede a frase de ausência', () => {
    const { texto: t, alertas } = pesquisa(dossie({
      adverseMedia: midia({
        results: [{ id: 'n1', status: 'candidate', riskRelevant: true } as AdverseMediaSummary['results'][number]],
      }),
    }));
    expect(t).not.toContain('não tendo sido identificadas ocorrências');
    expect(t).toContain('1 ocorrência(s)');
    expect(alertas.some((a) => a.includes('sem revisão'))).toBe(true);
  });

  it('notícia descartada pelo analista não conta', () => {
    const { texto: t } = pesquisa(dossie({
      adverseMedia: midia({
        results: [{ id: 'n1', status: 'discarded', riskRelevant: true } as AdverseMediaSummary['results'][number]],
      }),
    }));
    expect(t).toContain('não tendo sido identificadas ocorrências');
  });

  it('registro no CEIS aparece no texto', () => {
    const { texto: t } = pesquisa(dossie({
      ceis: { ...semSancao('CEIS'), encontrado: true, quantidade: 1, registros: [{ vigente: true }] } as SanctionsResult,
    }));
    expect(t).toContain('foram identificados registros em CEIS');
    expect(t).not.toContain('não foram identificados registros');
  });

  it('CNEP que não respondeu vira ressalva, não "nada consta"', () => {
    const { texto: t } = pesquisa(dossie({ cnep: { ...semSancao('CNEP'), ok: false, erro: 'timeout' } }));
    expect(t).toContain('ressalvando-se que a base CNEP não respondeu');
  });

  it('notícias indisponíveis não afirmam ausência de ocorrências', () => {
    const { texto: t } = pesquisa(dossie({ adverseMedia: midia({ ok: false, coverageStatus: 'UNAVAILABLE' }) }));
    expect(t).not.toContain('não tendo sido identificadas ocorrências');
  });

  it('texto ajustado pelo analista substitui o automático', () => {
    const n = nota({ ...NEGATIVO, '7.1': true }, { pesquisaAjustada: 'Texto revisado pelo analista.' });
    expect(n.paragrafos[2]).toMatch(/3\.3\.3 da mencionada Política\. Texto revisado pelo analista\.$/);
  });
});

describe('saída', () => {
  it('versão para o SEI omite título e rodapé; a completa inclui', () => {
    const n = nota({ ...NEGATIVO, '7.1': true });
    const sei = technicalNoteToText(n);
    const completa = technicalNoteToText(n, { completa: true });
    expect(sei.startsWith('Ipojuca, 17 de setembro de 2026')).toBe(true);
    expect(sei).not.toContain('NOTA TÉCNICA');
    expect(completa.startsWith('NOTA TÉCNICA')).toBe(true);
    expect(completa).toContain('Rodovia Indonésia');
    expect(sei).toContain('Karla Taciana Sabino de Paula Sales');
  });

  it('escapa HTML vindo dos campos livres', () => {
    const html = technicalNoteToHtml(nota(NEGATIVO, { objeto: '<script>x</script>' }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
