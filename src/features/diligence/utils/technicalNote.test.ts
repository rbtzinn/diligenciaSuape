import { describe, it, expect } from 'vitest';
import {
  buildResearchParagraph,
  buildTechnicalNote,
  classifyByQuestionnaire,
  defaultTechnicalNoteForm,
  formatNoteDate,
  missingFields,
  technicalNoteToHtml,
  technicalNoteToText,
  type TechnicalNoteForm,
} from './technicalNote';
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
    pepResults: [{ nome: 'FULANO', ok: true, encontrado: false, quantidade: 0, registros: [] }],
    empresa: { cnpj: '20867216000166', razao_social: 'TMP TERMINAIS S/A' },
    ceis: semSancao('CEIS'),
    cnep: semSancao('CNEP'),
    adverseMedia: midia(),
    ...extra,
  } as unknown as DiligenceItem;
}

const base = () => defaultTechnicalNoteForm(dossie(), new Date(2026, 8, 17));

/** Nota 154: TMP Terminais, Risco Alto. */
function formAlto(extra: Partial<TechnicalNoteForm> = {}): TechnicalNoteForm {
  return {
    ...base(),
    numero: '154',
    empresa: 'TMP Terminais S/A',
    objeto: 'empresa especializada em armazenamento e movimentação de granéis líquidos no Porto Organizado de Suape',
    respondeuItem71: true,
    atividadeRegulada: 'a Agência Nacional do Petróleo, Gás Natural e Biocombustíveis (ANP) para o armazenamento de granéis líquidos',
    respondeuItem72: true,
    licencasDestacadas: 'a Licença de Operação emitida pela CPRH',
    integridade: { programa: 'sim', codigo: 'sim', treinamento: 'sim', comite: 'sim', responsavel: 'omitir' },
    declarouSemCondenacoes: true,
    ...extra,
  };
}

/** Nota 155: Supernova, Risco Baixo. */
function formBaixo(extra: Partial<TechnicalNoteForm> = {}): TechnicalNoteForm {
  return {
    ...base(),
    numero: '155',
    empresa: 'Supernova Serviços de Informação Ltda',
    integridade: { programa: 'nao', codigo: 'nao', treinamento: 'nao', comite: 'omitir', responsavel: 'nao' },
    declarouSemCondenacoes: true,
    ...extra,
  };
}

/** Nota 156: Adm Arquitetos, Risco Médio. */
function formMedio(extra: Partial<TechnicalNoteForm> = {}): TechnicalNoteForm {
  return {
    ...base(),
    numero: '156',
    empresa: 'Adm Arquitetos Associados Ltda - EPP',
    respondeuItem72: true,
    integridade: { programa: 'omitir', codigo: 'nao', treinamento: 'nao', comite: 'omitir', responsavel: 'nao' },
    declarouSemCondenacoes: true,
    observacoes: 'No curso da análise documental, verificou-se que o registro no CAU/PE vale até 21/09/2026.\n\nA presente manifestação possui caráter orientativo.',
    ...extra,
  };
}

/** Nota 124: B3, Risco Muito Alto. */
function formMuitoAlto(extra: Partial<TechnicalNoteForm> = {}): TechnicalNoteForm {
  return {
    ...base(),
    numero: '124',
    empresa: 'B3 S.A. – Brasil, Bolsa, Balcão',
    respondeuItem44: true,
    respondeuItem52: true,
    respondeuItem71: true,
    respondeuItem72: true,
    respondeuItem74: true,
    integridade: { programa: 'sim', codigo: 'sim', treinamento: 'nao', comite: 'omitir', responsavel: 'sim' },
    ...extra,
  };
}

const texto = (form: TechnicalNoteForm) => technicalNoteToText(buildTechnicalNote(form, dossie()));

describe('classificação pelas respostas do questionário', () => {
  it('segue a ordem da Política: 4.4/5.2, depois 7.1, depois 7.2', () => {
    const r = (extra: Partial<TechnicalNoteForm>) => classifyByQuestionnaire({ ...base(), ...extra });
    expect(r({})).toBe('BAIXO');
    expect(r({ respondeuItem72: true })).toBe('MEDIO');
    expect(r({ respondeuItem71: true, respondeuItem72: true })).toBe('ALTO');
    expect(r({ respondeuItem44: true })).toBe('MUITO_ALTO');
    expect(r({ respondeuItem52: true, respondeuItem71: true })).toBe('MUITO_ALTO');
  });

  it('7.4 sozinho não muda o nível', () => {
    const form: TechnicalNoteForm = { ...base(), respondeuItem74: true };
    expect(classifyByQuestionnaire(form)).toBe('BAIXO');
  });
});

describe('cabeçalho', () => {
  it('reproduz título, local, data por extenso e ementa', () => {
    const nota = buildTechnicalNote(formAlto(), dossie());
    expect(nota.titulo).toBe('NOTA TÉCNICA - SUAPE - ASSESSORIA ESPECIAL DE COMPLIANCE - Nº 154/2026');
    expect(nota.local).toBe('Ipojuca, 17 de setembro de 2026');
    expect(nota.ementa).toBe(
      'Política de Contratação de Terceiros. Contratação da empresa TMP Terminais S/A, empresa especializada em armazenamento e movimentação de granéis líquidos no Porto Organizado de Suape.',
    );
  });

  it('formata a data sem zero à esquerda no dia', () => {
    expect(formatNoteDate('2026-03-05')).toBe('5 de março de 2026');
  });

  it('abre com o texto das notas mais recentes em todos os níveis', () => {
    for (const form of [formBaixo(), formMedio(), formAlto(), formMuitoAlto()]) {
      expect(buildTechnicalNote(form, dossie()).paragrafos[0]).toMatch(/^Trata-se de Questionário de Diligência enviado pela Coordenadoria de Gestão e Licitações – CPL/);
    }
  });
});

describe('Risco Baixo (modelo da nota 155)', () => {
  const nota = () => buildTechnicalNote(formBaixo(), dossie());

  it('diz que as respostas não a classificaram em nível superior', () => {
    expect(nota().paragrafos[1]).toBe(
      'Diante da análise do questionário de diligência, verificou-se que as respostas da Supernova Serviços de Informação Ltda não a classificaram com aparente Risco Médio, Risco Alto ou Risco Muito Alto de Integridade.',
    );
  });

  it('lista as negativas de integridade como no modelo', () => {
    expect(texto(formBaixo())).toContain(
      'A Supernova Serviços de Informação Ltda informou não possuir um Programa de Integridade estruturado, não possuir Código de Ética, não ter conduzido treinamento para gestão societária e não possuir profissional responsável por um programa ou política anticorrupção.',
    );
  });

  it('classifica, recomenda acompanhamento e arquiva, sem pesquisa nem lista de recomendações', () => {
    const t = texto(formBaixo());
    expect(t).toContain('grau de RISCO BAIXO DE INTEGRIDADE.');
    expect(t).toContain('mantenham o acompanhamento regular da execução contratual');
    expect(t).toContain('Assim considerando, o presente processo será arquivado.');
    expect(t).not.toContain('pesquisa reputacional');
    expect(nota().recomendacoes).toEqual([]);
  });
});

describe('Risco Médio (modelo da nota 156)', () => {
  it('enquadra pelo item 7.2 e arquiva', () => {
    const t = texto(formMedio());
    expect(t).toContain('verificamos que a Adm Arquitetos Associados Ltda - EPP respondeu positivamente ao item 7.2');
    expect(t).toContain('aparente MÉDIO RISCO DE INTEGRIDADE');
    expect(t).toContain('grau de RISCO MÉDIO DE INTEGRIDADE.');
    expect(t).toContain('o presente processo será arquivado');
    expect(t).not.toContain('pesquisa reputacional');
  });

  it('não menciona item de integridade marcado como omitir', () => {
    const t = texto(formMedio());
    expect(t).toContain('informou não possuir Código de Ética, não ter conduzido treinamento');
    expect(t).not.toContain('Programa de Integridade estruturado');
  });

  it('observações da análise documental viram parágrafos antes da conclusão', () => {
    const { paragrafos } = buildTechnicalNote(formMedio(), dossie());
    const cau = paragrafos.findIndex((p) => p.includes('CAU/PE'));
    const orientativo = paragrafos.findIndex((p) => p.startsWith('A presente manifestação'));
    const conclusao = paragrafos.findIndex((p) => p.includes('RISCO MÉDIO DE INTEGRIDADE.'));
    expect(cau).toBeGreaterThan(0);
    expect(orientativo).toBe(cau + 1);
    expect(conclusao).toBe(orientativo + 1);
  });
});

describe('Risco Alto (modelo da nota 154)', () => {
  it('cita o item 7.1, eleva para Risco Alto e destaca as licenças do 7.2', () => {
    const [, enquadramento] = buildTechnicalNote(formAlto(), dossie()).paragrafos;
    expect(enquadramento).toContain('respondeu positivamente ao item 7.1');
    expect(enquadramento).toContain('perante a Agência Nacional do Petróleo');
    expect(enquadramento).toContain('Risco Alto de Integridade');
    expect(enquadramento).toContain('item 7.2');
    expect(enquadramento).toContain('Destaca-se a Licença de Operação emitida pela CPRH.');
  });

  it('tem pesquisa reputacional, recomendações A–D e não arquiva', () => {
    const nota = buildTechnicalNote(formAlto(), dossie());
    const t = technicalNoteToText(nota);
    expect(t).toContain('itens 3.3.2 e 3.3.3');
    expect(t).toContain('grau de RISCO ALTO.');
    expect(nota.recomendacoes.map((r) => r.slice(0, 2))).toEqual(['A)', 'B)', 'C)', 'D)']);
    expect(t).not.toContain('arquivado');
  });

  it('declarações positivas saem como no modelo', () => {
    expect(texto(formAlto())).toContain(
      'A TMP Terminais S/A informou possuir programa de integridade e Código de Ética, conduzir treinamento para a alta administração e possuir Comitê de Ética',
    );
    expect(texto(formAlto())).toContain('não haver condenações');
  });

  it('campo obrigatório vazio vira marcador visível, nunca some do texto', () => {
    const form = formAlto({ atividadeRegulada: '', numero: '' });
    const nota = buildTechnicalNote(form, dossie());
    expect(nota.paragrafos[1]).toContain('[ÓRGÃOS REGULADORES E ATIVIDADE]');
    expect(nota.titulo).toContain('Nº ___/2026');
    expect(missingFields(form)).toEqual(['Número da nota', 'Atividade regulada (item 7.1)']);
  });

  it('atividade regulada só é obrigatória no Risco Alto', () => {
    expect(missingFields(formMedio())).toEqual([]);
    expect(missingFields(formMuitoAlto())).toEqual([]);
  });
});

describe('Risco Muito Alto (modelo da nota 124)', () => {
  it('enquadra pelo 4.4, soma o 5.2 e os agravantes 7.1, 7.2 e 7.4', () => {
    const [, enquadramento] = buildTechnicalNote(formMuitoAlto(), dossie()).paragrafos;
    expect(enquadramento).toContain('assinalou positivamente os itens 4.4, 5.2, 7.1, 7.2 e 7.4');
    expect(enquadramento).toContain('RISCO MUITO ALTO DE INTEGRIDADE');
    expect(enquadramento).toContain('por declarar a existência de condenação administrativa ou civil por atos de corrupção');
    expect(enquadramento).toContain('Adicionalmente, a empresa respondeu positivamente ao item 5.2');
    expect(enquadramento).toContain('Também foram identificadas respostas afirmativas aos itens 7.1, 7.2 e 7.4');
    expect(enquadramento).toContain('mantém interação com órgãos governamentais e/ou agentes públicos');
  });

  it('só o 5.2 também enquadra, citando os sócios como motivo', () => {
    const [, enquadramento] = buildTechnicalNote(
      formMuitoAlto({ respondeuItem44: false, respondeuItem71: false, respondeuItem72: false, respondeuItem74: false }),
      dossie(),
    ).paragrafos;
    expect(enquadramento).toContain('assinalou positivamente o item 5.2');
    expect(enquadramento).toContain('por informar a existência de condenações, processos criminais ou investigações criminais relacionadas aos sócios');
    expect(enquadramento).not.toContain('Adicionalmente');
    expect(enquadramento).not.toContain('Também');
  });

  it('tem pesquisa reputacional, recomendações A–F e não arquiva', () => {
    const nota = buildTechnicalNote(formMuitoAlto(), dossie());
    const t = technicalNoteToText(nota);
    expect(t).toContain('itens 3.3.2 e 3.3.3');
    expect(t).toContain('grau de RISCO MUITO ALTO DE INTEGRIDADE.');
    expect(t).toContain('recomenda a adoção das seguintes medidas:');
    expect(nota.recomendacoes).toHaveLength(6);
    expect(nota.recomendacoes[0]).toContain('Declaração de Gestão de Contratos com Terceiros de Risco Muito Alto');
    expect(nota.recomendacoes[5]).toContain('as condenações criminais declaradas');
    expect(t).not.toContain('arquivado');
  });

  it('sem 5.2, a recomendação ao Jurídico não fala em condenação criminal', () => {
    const nota = buildTechnicalNote(formMuitoAlto({ respondeuItem52: false }), dossie());
    expect(nota.recomendacoes[5]).toContain('se as condenações declaradas');
  });

  it('não afirma ausência de condenações, mesmo marcada por engano', () => {
    expect(texto(formMuitoAlto({ declarouSemCondenacoes: true }))).not.toContain('não haver condenações');
  });
});

describe('pesquisa reputacional e cadastros', () => {
  it('sem achados e com fontes respondendo, usa o texto do modelo', () => {
    const { texto: t, alertas } = buildResearchParagraph(dossie());
    expect(t).toContain('não tendo sido identificadas ocorrências envolvendo a referida empresa');
    expect(t).toContain('não foram identificados registros, ocorrências ou apontamentos');
    expect(t).toContain('CEIS');
    expect(alertas).toEqual([]);
  });

  it('notícia relevante não descartada impede a frase de ausência', () => {
    const { texto: t, alertas } = buildResearchParagraph(dossie({
      adverseMedia: midia({
        results: [{ id: 'n1', status: 'candidate', riskRelevant: true } as AdverseMediaSummary['results'][number]],
      }),
    }));
    expect(t).not.toContain('não tendo sido identificadas ocorrências');
    expect(t).toContain('1 ocorrência(s)');
    expect(alertas.some((a) => a.includes('sem revisão'))).toBe(true);
  });

  it('notícia descartada pelo analista não conta como ocorrência', () => {
    const { texto: t } = buildResearchParagraph(dossie({
      adverseMedia: midia({
        results: [{ id: 'n1', status: 'discarded', riskRelevant: true } as AdverseMediaSummary['results'][number]],
      }),
    }));
    expect(t).toContain('não tendo sido identificadas ocorrências');
  });

  it('registro no CEIS aparece no texto e gera alerta', () => {
    const { texto: t, alertas } = buildResearchParagraph(dossie({
      ceis: { ...semSancao('CEIS'), encontrado: true, quantidade: 1, registros: [{ vigente: true }] } as SanctionsResult,
    }));
    expect(t).toContain('foram identificados registros em CEIS');
    expect(t).not.toContain('não foram identificados registros');
    expect(alertas.length).toBeGreaterThan(0);
  });

  it('fonte que não respondeu vira ressalva, não ausência', () => {
    const { texto: t } = buildResearchParagraph(dossie({
      cnep: { ...semSancao('CNEP'), ok: false, erro: 'timeout' },
    }));
    expect(t).toContain('ressalvando-se que a base CNEP não respondeu');
  });

  it('pesquisa de notícias indisponível não afirma ausência de ocorrências', () => {
    const { texto: t, alertas } = buildResearchParagraph(dossie({ adverseMedia: midia({ ok: false, coverageStatus: 'UNAVAILABLE' }) }));
    expect(t).not.toContain('não tendo sido identificadas ocorrências');
    expect(alertas.length).toBeGreaterThan(0);
  });

  it('texto ajustado pelo analista substitui o automático', () => {
    const nota = buildTechnicalNote(formAlto({ pesquisaAjustada: 'Texto revisado pelo analista.' }), dossie());
    expect(nota.paragrafos[2]).toMatch(/3\.3\.3 da mencionada Política\. Texto revisado pelo analista\.$/);
  });
});

describe('saída', () => {
  it('versão para o SEI omite título e rodapé; a completa inclui', () => {
    const nota = buildTechnicalNote(formAlto(), dossie());
    const sei = technicalNoteToText(nota);
    const completa = technicalNoteToText(nota, { completa: true });
    expect(sei.startsWith('Ipojuca, 17 de setembro de 2026')).toBe(true);
    expect(sei).not.toContain('NOTA TÉCNICA');
    expect(completa.startsWith('NOTA TÉCNICA')).toBe(true);
    expect(completa).toContain('Rodovia Indonésia');
    expect(sei).toContain('D) Que sejam realizadas atualizações periódicas');
    expect(sei).toContain('Karla Taciana Sabino de Paula Sales');
  });

  it('escapa HTML vindo dos campos livres', () => {
    const nota = buildTechnicalNote(formAlto({ objeto: '<script>x</script>' }), dossie());
    const html = technicalNoteToHtml(nota);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
