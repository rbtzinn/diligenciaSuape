import { describe, it, expect } from 'vitest';
import {
  SUAPE_IMPORT_SCHEMA_VERSION,
  buildQuestionnaireExtractionPrompt,
  checkImportedCnpj,
  parseQuestionnaireImport,
} from './suapeQuestionnaireImport';

/** Monta uma transcrição válida, permitindo sobrescrever partes. */
function transcricao(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    versao: SUAPE_IMPORT_SCHEMA_VERSION,
    razaoSocial: 'TMP TERMINAIS S/A',
    cnpj: '56.211.027/0002-69',
    dadosGerais: {
      valorContrato: 'R$ 46.056,00',
      processoSei: '0050200077.001023/2024-54',
      diretoria: 'dgp',
      gestor: 'Nilson Monteiro',
      objetoContrato: 'Atividade de operador portuário',
      representante: 'Sebastião Azevedo de Lira Júnior',
      dataPreenchimento: '17/09/2026',
    },
    respostas: {
      '4.4': 'nao',
      '5.2': 'nao',
      '7.1': 'sim',
      '7.2': 'sim',
      '7.3': 'sim',
      '7.4': 'sim',
      '7.5': 'sim',
      '7.6': 'nao',
      '7.7': 'nao',
      '7.8': 'nao',
      '7.9': 'sim',
      alcadaConselho: 'nao',
      '8.1': 'sim',
      '8.2': 'sim',
    },
    evidencias: {
      '7.1': 'ANTAQ — FISCALIZAÇÃO DO OBJETO CONTRATUAL',
      '7.2': 'ALVARÁ PREFEITURA, LICENÇA DE OPERAÇÃO CPRH, validade 20/08/2026',
      '7.3': 'Em processo de renovação, aguardando inspeção',
      '7.4': 'AUTORIDADE PORTUÁRIA - PORTO DE SUAPE',
      '7.5': 'ANTAQ FISCALIZAÇÃO DO OBJETO CONTRATUAL',
      '7.9': 'TEMAPE TERMINAIS MARITIMOS DE PERNAMBUCO S/A 100%',
      '8.1': 'Existência de Comitê de Ética interno, composto por 04 membros',
      '8.2': 'Código de Conduta vigente',
    },
    ...overrides,
  });
}

describe('Prompt de extração', () => {
  it('traz os enunciados oficiais e o vocabulário fechado das respostas', () => {
    const prompt = buildQuestionnaireExtractionPrompt({
      razaoSocial: 'TMP Terminais S/A',
      cnpj: '56.211.027/0002-69',
    });

    expect(prompt).toContain('TMP Terminais S/A');
    expect(prompt).toContain(SUAPE_IMPORT_SCHEMA_VERSION);
    expect(prompt).toContain('"4.4"');
    expect(prompt).toContain('"alcadaConselho"');
    expect(prompt).toContain('"9.0"');
    expect(prompt).toContain('"sim", "nao" ou "nao_identificado"');
  });

  it('instrui a devolver não identificado na dúvida, em vez de chutar', () => {
    const prompt = buildQuestionnaireExtractionPrompt();
    expect(prompt).toContain('Esta é a resposta correta na dúvida');
    expect(prompt).toContain('Não invente');
  });
});

describe('Leitura da transcrição', () => {
  it('importa uma transcrição completa', () => {
    const resultado = parseQuestionnaireImport(transcricao());

    expect(resultado.ok).toBe(true);
    expect(resultado.errors).toHaveLength(0);
    expect(resultado.answers['7.2']).toBe(true);
    expect(resultado.answers['4.4']).toBe(false);
    expect(resultado.answers['9.0']).toBeNull();
    expect(resultado.generalData.valorContrato).toBe(46056);
    expect(resultado.generalData.diretoria).toBe('DGP');
    expect(resultado.generalData.processoSei).toBe('0050200077.001023/2024-54');
  });

  it('aceita o JSON embrulhado em cerca de código e texto de cortesia', () => {
    const colado = `Claro! Segue a transcrição:\n\n\`\`\`json\n${transcricao()}\n\`\`\`\n\nEspero ter ajudado.`;
    const resultado = parseQuestionnaireImport(colado);
    expect(resultado.ok).toBe(true);
    expect(resultado.answers['7.3']).toBe(true);
  });

  it('rebaixa a não identificado o "sim" sem citação literal', () => {
    const resultado = parseQuestionnaireImport(transcricao({ evidencias: {} }));

    expect(resultado.answers['7.2']).toBeNull();
    expect(resultado.answers['4.4']).toBe(false); // "não" não exige citação
    expect(resultado.demotedForMissingEvidence).toContain('7.2');
    expect(resultado.warnings.join(' ')).toContain('sem citação literal');
  });

  it('nunca transforma ausência de resposta em "não"', () => {
    const resultado = parseQuestionnaireImport(
      transcricao({ respostas: { '4.4': 'nao_identificado', '7.2': '', '7.4': 'sim' } })
    );

    expect(resultado.answers['4.4']).toBeNull();
    expect(resultado.answers['7.2']).toBeNull();
    expect(resultado.answers['5.2']).toBeNull();
  });

  it('registra valor fora do vocabulário como não identificado, com aviso', () => {
    const resultado = parseQuestionnaireImport(
      transcricao({ respostas: { '4.4': 'talvez', '7.4': 'sim' } })
    );

    expect(resultado.answers['4.4']).toBeNull();
    expect(resultado.warnings.join(' ')).toContain('não é reconhecido');
  });

  it('avisa sobre itens que não existem no questionário oficial', () => {
    const resultado = parseQuestionnaireImport(
      transcricao({ respostas: { '7.4': 'sim', '99.9': 'sim' } })
    );
    expect(resultado.warnings.join(' ')).toContain('99.9');
  });

  it('recusa texto que não é JSON', () => {
    const resultado = parseQuestionnaireImport('a empresa respondeu sim para quase tudo');
    expect(resultado.ok).toBe(false);
    expect(resultado.errors[0]).toContain('bloco JSON');
  });

  it('recusa JSON malformado com orientação de refazer', () => {
    const resultado = parseQuestionnaireImport('{ "respostas": { "4.4": "sim", } ');
    expect(resultado.ok).toBe(false);
    expect(resultado.errors.join(' ')).toMatch(/JSON/);
  });

  it('recusa transcrição sem nenhuma resposta utilizável', () => {
    const resultado = parseQuestionnaireImport(
      transcricao({ respostas: { '4.4': 'nao_identificado' }, evidencias: {} })
    );
    expect(resultado.ok).toBe(false);
    expect(resultado.errors.join(' ')).toContain('Nenhum item');
  });

  it('avisa quando a versão do formato não é a atual', () => {
    const resultado = parseQuestionnaireImport(transcricao({ versao: 'formato-antigo' }));
    expect(resultado.warnings.join(' ')).toContain('formato-antigo');
  });

  it('conta as respostas para a confirmação em tela', () => {
    const resultado = parseQuestionnaireImport(transcricao());
    expect(resultado.summary.sim).toBe(8);
    expect(resultado.summary.nao).toBe(6);
    expect(resultado.summary.sim + resultado.summary.nao + resultado.summary.naoIdentificado).toBe(
      resultado.summary.total
    );
  });
});

describe('Conferência de CNPJ', () => {
  it('não reclama quando o CNPJ confere, mesmo com máscara diferente', () => {
    expect(checkImportedCnpj('56.211.027/0002-69', '56211027000269')).toBeNull();
  });

  it('alerta quando o questionário é de outra empresa', () => {
    const aviso = checkImportedCnpj('11.222.333/0001-44', '56211027000269');
    expect(aviso).toContain('diferente da diligência aberta');
  });

  it('não alerta quando falta um dos lados', () => {
    expect(checkImportedCnpj(null, '56211027000269')).toBeNull();
  });
});
