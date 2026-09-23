import { describe, it, expect } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from 'pdf-lib';
import { ALL_CHOICES } from './questionnaireCatalog';
import {
  collectEvidences,
  emptyState,
  fromDraft,
  isValidCpf,
  removeTableRow,
  requiresRegistries,
  toDraft,
  validateQuestionnaire,
  type Evidence,
  type QuestionnaireState,
} from './questionnaireState';
import { buildQuestionnairePdf, canEmbedPdf, toWinAnsi, verificationCode } from './questionnairePdf';

/** PNG 1x1 transparente. */
const PNG_1X1 = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

async function samplePdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([300, 400]);
  return doc.save();
}

const fileEvidence = (id: string, bytes: Uint8Array, type: 'application/pdf' | 'image/png' = 'application/pdf', rowIndex?: number): Evidence => ({
  id,
  kind: 'file',
  label: `${id}.${type === 'image/png' ? 'png' : 'pdf'}`,
  rowIndex,
  file: { name: `${id}.${type === 'image/png' ? 'png' : 'pdf'}`, type, size: bytes.length, bytes, sha256: 'a'.repeat(64) },
});

/** Questionário completo no espírito do da TMP Terminais: tudo Não, exceto o que for pedido. */
function completo(): QuestionnaireState {
  const state = emptyState();
  state.fields = {
    razaoSocial: 'TMP TERMINAIS S/A',
    cnpj: '20.867.216/0001-66',
    dataConstituicao: '01/08/2024',
    objetoSocial: 'Atividade de operador portuário',
    ramoAtividade: 'Operador logístico',
    numeroEmpregados: '61',
    endereco: 'Av. dos Tanques, s/n - Ilha de Cocaia, Ipojuca/PE',
    paisesLocalidades: 'Brasil - Norte/Nordeste',
    servicoPrestado: 'Armazenamento e movimentação de granéis líquidos',
    representanteNome: 'Fulano de Tal',
    representanteCpf: '529.982.247-25',
    representanteRg: '2256172',
    representanteTelefone: '(81) 99419-5973',
    representanteEmail: 'fulano@empresa.com.br',
    representanteNacionalidade: 'Brasileira',
    representanteCargo: 'Gerente',
    anosAtividade: 'Desde a década de 1990',
    historico: 'Grupo formado por empresas do ramo sucroalcooleiro.',
    declaracaoLocalData: 'Ipojuca, 11 de setembro de 2026',
    declaracaoNome: 'Fulano de Tal',
    declaracaoCargo: 'Gerente',
  };
  state.tables = {
    administradores: [{ nome: 'Diretor Um', cargo: 'Diretor', nacionalidade: 'Brasileira', periodo: '2024-2027' }],
    envolvidos: [{ nome: 'Gerente Um', cargo: 'Gerente', nacionalidade: 'Brasileira' }],
    socios: [{ nome: 'Controladora S/A', nacionalidade: 'Brasil', documento: '02.639.582/0001-86', participacao: '100%' }],
  };
  for (const choice of ALL_CHOICES) state.choices[choice.id] = 'nao';
  state.declarationAccepted = true;
  state.cnpjLookup = { cnpj: '20867216000166', source: 'receita' };
  return state;
}

describe('validação', () => {
  it('questionário completo, tudo Não, não tem pendência', () => {
    expect(validateQuestionnaire(completo())).toEqual([]);
  });

  it('formulário vazio lista campos, perguntas e a declaração', () => {
    const issues = validateQuestionnaire(emptyState());
    expect(issues.some((i) => i.message.includes('Razão Social'))).toBe(true);
    expect(issues.some((i) => i.message.startsWith('7.1: responda Sim ou Não'))).toBe(true);
    expect(issues.some((i) => i.anchor === 'q-declaracao')).toBe(true);
  });

  it('CNPJ e CPF inválidos são pendência', () => {
    const state = completo();
    state.fields.cnpj = '20.867.216/0001-67';
    state.fields.representanteCpf = '111.111.111-11';
    const messages = validateQuestionnaire(state).map((i) => i.message);
    expect(messages.some((m) => m.includes('CNPJ inválido'))).toBe(true);
    expect(messages.some((m) => m.includes('CPF inválido'))).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('participação societária precisa somar 100%', () => {
    const state = completo();
    state.tables.socios = [
      { nome: 'A', nacionalidade: 'BR', documento: '1', participacao: '60' },
      { nome: 'B', nacionalidade: 'BR', documento: '2', participacao: '30,5%' },
    ];
    expect(validateQuestionnaire(state).some((i) => i.message.includes('soma 90,5%'))).toBe(true);
  });
});

describe('CPF ou CNPJ escolhido pela empresa', () => {
  it('sem escolha vale CNPJ; escolhendo CPF, valida como CPF', () => {
    const state = completo();
    state.tables.socios = [{ nome: 'Sócio PF', nacionalidade: 'Brasileira', documento: '529.982.247-25', participacao: '100' }];
    expect(validateQuestionnaire(state).some((i) => i.message.includes('CNPJ inválido'))).toBe(true);

    state.tables.socios[0].__tipo_documento = 'cpf';
    expect(validateQuestionnaire(state)).toEqual([]);
  });

  it('a escolha do tipo sozinha não conta como linha preenchida', () => {
    const state = completo();
    state.choices['1.2'] = 'sim';
    state.tables.subcontratadas = [{ __tipo_documento: 'cpf' }];
    expect(validateQuestionnaire(state).some((i) => i.message.includes('inclua ao menos uma linha'))).toBe(true);
  });
});

describe('evidências bloqueiam a exportação', () => {
  it('"Sim" em pergunta com evidência exige arquivo ou link', () => {
    const state = completo();
    state.choices['8.2'] = 'sim';
    expect(validateQuestionnaire(state).some((i) => i.message.startsWith('8.2: resposta "Sim" exige evidência'))).toBe(true);

    state.evidences['8.2'] = [{ id: 'l', kind: 'link', label: 'https://empresa.com.br/codigo-de-etica.pdf' }];
    expect(validateQuestionnaire(state)).toEqual([]);
  });

  it('link malformado e trecho indicado não valem onde a regra não aceita', () => {
    const state = completo();
    state.choices['8.1'] = 'sim';
    state.evidences['8.1'] = [
      { id: 'a', kind: 'link', label: 'empresa.com.br' },
      { id: 'b', kind: 'reference', label: 'Capítulo 3 do Código' },
    ];
    expect(validateQuestionnaire(state).some((i) => i.message.startsWith('8.1:'))).toBe(true);
  });

  it('8.3 aceita a indicação do trecho no documento', () => {
    const state = completo();
    state.choices['8.3'] = 'sim';
    state.evidences['8.3'] = [{ id: 'r', kind: 'reference', label: 'Código de Ética, capítulo 7, item 7.2' }];
    expect(validateQuestionnaire(state)).toEqual([]);
  });

  it('7.2 exige uma evidência por licença listada', async () => {
    const state = completo();
    state.choices['7.2'] = 'sim';
    state.tables.licencas = [
      { registro: 'L.O. 05.24.05.003143-7', orgao: 'CPRH', inicio: '09/05/2024', termino: '09/05/2027' },
      { registro: 'AVCB', orgao: 'CBM-PE', inicio: '20/08/2025', termino: '20/08/2026' },
    ];
    const pdf = await samplePdf(1);
    state.evidences['7.2'] = [fileEvidence('lo', pdf, 'application/pdf', 0)];
    const messages = validateQuestionnaire(state).map((i) => i.message);
    expect(messages).toEqual(['7.2: anexe a evidência da linha 2 (AVCB).']);

    state.evidences['7.2'].push(fileEvidence('avcb', pdf, 'application/pdf', 1));
    expect(validateQuestionnaire(state)).toEqual([]);
  });

  it('respostas "Não" não pedem evidência', () => {
    const state = completo();
    expect(ALL_CHOICES.filter((c) => c.evidence).every((c) => state.choices[c.id] === 'nao')).toBe(true);
    expect(validateQuestionnaire(state)).toEqual([]);
  });
});

describe('itens 9.2 e 9.3', () => {
  it('só são exigidos em risco Alto ou Muito Alto', () => {
    const state = completo();
    expect(requiresRegistries(state)).toBe(false);
    state.choices['7.4'] = 'sim';
    state.tables.interacoes = [{ orgao: 'Autoridade Portuária', atividade: 'Fiscalização' }];
    expect(requiresRegistries(state)).toBe(true);
    // Nada marcado no 9.2 é "não consta", como no questionário.
    expect(validateQuestionnaire(state)).toEqual([]);
  });

  it('cadastro marcado exige o detalhamento do 9.3', () => {
    const state = completo();
    state.choices['4.4'] = 'sim';
    state.fields.processos44 = 'Processo 123, em andamento';
    state.evidences['4.4'] = [{ id: 'l', kind: 'link', label: 'https://tribunal.jus.br/processo/123' }];
    state.registries.ceis = true;
    expect(validateQuestionnaire(state).map((i) => i.anchor)).toEqual(['q-cadastrosDetalhe']);
  });
});

describe('rascunho e linhas', () => {
  it('o rascunho não leva os bytes dos arquivos, mas mantém links', async () => {
    const state = completo();
    state.evidences['8.1'] = [fileEvidence('p', await samplePdf()), { id: 'l', kind: 'link', label: 'https://x.com.br/p' }];
    const draft = JSON.parse(JSON.stringify(toDraft(state)));
    expect(fromDraft(draft)?.evidences['8.1']).toEqual([{ id: 'l', kind: 'link', label: 'https://x.com.br/p' }]);
  });

  it('remover uma licença reposiciona as evidências das linhas seguintes', () => {
    const state = completo();
    state.tables.licencas = [{ registro: 'A' }, { registro: 'B' }, { registro: 'C' }];
    state.evidences['7.2'] = [
      { id: 'a', kind: 'link', label: 'https://a.br/a', rowIndex: 0 },
      { id: 'b', kind: 'link', label: 'https://a.br/b', rowIndex: 1 },
      { id: 'c', kind: 'link', label: 'https://a.br/c', rowIndex: 2 },
    ];
    const next = removeTableRow(state, 'licencas', 1);
    expect(next.tables.licencas.map((r) => r.registro)).toEqual(['A', 'C']);
    expect(next.evidences['7.2'].map((e) => [e.id, e.rowIndex])).toEqual([['a', 0], ['c', 1]]);
  });
});

describe('PDF', () => {
  it('troca caracteres que a fonte padrão não codifica', () => {
    expect(toWinAnsi('Ação “ok” – 100% ✓')).toBe('Ação “ok” – 100% ?');
  });

  it('gera o documento e incorpora as evidências no fim', async () => {
    const state = completo();
    state.choices['8.1'] = 'sim';
    state.choices['8.2'] = 'sim';
    state.evidences['8.1'] = [fileEvidence('programa', await samplePdf(3))];
    state.evidences['8.2'] = [fileEvidence('codigo', PNG_1X1, 'image/png'), { id: 'l', kind: 'link', label: 'https://empresa.com.br/codigo' }];
    expect(validateQuestionnaire(state)).toEqual([]);
    expect(collectEvidences(state).map((e) => e.annex)).toEqual([1, 2, undefined]);

    const bytes = await buildQuestionnairePdf(state, { generatedAt: new Date(2026, 8, 23, 10, 0) });
    const doc = await PDFDocument.load(bytes);
    const semAnexos = await PDFDocument.load(await buildQuestionnairePdf(completo()));
    // Com anexos: + índice + 3 páginas do PDF anexado + 1 página da imagem.
    expect(doc.getPageCount()).toBe(semAnexos.getPageCount() + 1 + 3 + 1);
    expect(doc.getTitle()).toContain('TMP TERMINAIS S/A');
  });

  it('evidências viram links: anexo leva à página do anexo, link abre o site, anexo volta ao item', async () => {
    const state = completo();
    state.choices['8.1'] = 'sim';
    state.choices['8.2'] = 'sim';
    state.evidences['8.1'] = [fileEvidence('programa', await samplePdf(2))];
    state.evidences['8.2'] = [{ id: 'l', kind: 'link', label: 'https://empresa.com.br/codigo' }];
    const doc = await PDFDocument.load(await buildQuestionnairePdf(state));
    const pages = doc.getPages();
    const annexFirst = pages[pages.length - 2];

    const links = pages.flatMap((page) => {
      const annots = page.node.Annots();
      return annots ? annots.asArray().map((ref) => ({ page, annot: doc.context.lookup(ref) as PDFDict })) : [];
    });
    const destinos = links.map(({ annot }) => annot.get(PDFName.of('Dest'))).filter(Boolean) as PDFArray[];
    const uris = links.map(({ annot }) => (annot.get(PDFName.of('A')) as PDFDict | undefined)?.get(PDFName.of('URI'))).filter(Boolean);

    // "Anexo 1 — programa.pdf" aponta para a primeira página do anexo.
    expect(destinos.some((dest) => dest.get(0) === annexFirst.ref)).toBe(true);
    // O link do 8.2 abre o site.
    expect(uris.map((uri) => (uri as PDFString).decodeText())).toContain('https://empresa.com.br/codigo');
    // As páginas do anexo têm "Voltar ao item" apontando para as respostas.
    const voltar = links.filter(({ page }) => page === annexFirst).map(({ annot }) => annot.get(PDFName.of('Dest')) as PDFArray);
    expect(voltar.length).toBe(1);
    expect(voltar[0].get(0)).not.toBe(annexFirst.ref);

    // Marcadores no painel lateral.
    const outlines = doc.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    expect((outlines.get(PDFName.of('Count')) as PDFNumber).asNumber()).toBe(4);
  });

  it('o código de verificação muda quando a resposta muda', async () => {
    const a = completo();
    const b = completo();
    b.choices['6.1'] = 'sim';
    expect(await verificationCode(a)).not.toBe(await verificationCode(b));
    expect(await verificationCode(a)).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
  });

  it('recusa PDF que não pode ser incorporado', async () => {
    expect(await canEmbedPdf(await samplePdf())).toBe(true);
    expect(await canEmbedPdf(new TextEncoder().encode('não é pdf'))).toBe(false);
  });
});
